import { db } from "../config";
import { Scope, owned, locked, emit, json } from "./core";
import {
  createPurchase,
  approveAndExecute,
  cancel,
  inspectPurchase,
} from "./engine";
export async function createConversation(
  scope: Scope,
  environmentId: string,
  clientKey: string,
) {
  return locked(environmentId, async (tx) => {
    const e = await owned(environmentId, scope, tx);
    return tx.labConversation.upsert({
      where: { environmentId_clientKey: { environmentId, clientKey } },
      create: {
        environmentId,
        clientKey,
        title: "New conversation",
        createdAt: e.clock,
      },
      update: {},
    });
  });
}
export async function conversation(scope: Scope, id: string) {
  const c = await db.labConversation.findUniqueOrThrow({ where: { id } });
  await owned(c.environmentId, scope);
  const messages = await db.labMessage.findMany({
    where: { conversationId: id },
    orderBy: { sequence: "asc" },
  });
  const purchaseIds = [
    ...new Set(messages.map((m) => m.purchaseId).filter(Boolean)),
  ] as string[];
  return {
    ...c,
    messages,
    purchases: await Promise.all(
      purchaseIds.map((id) => inspectPurchase(scope, id)),
    ),
  };
}
export async function search(
  scope: Scope,
  id: string,
  clientKey: string,
  text: string,
) {
  const c = await db.labConversation.findUniqueOrThrow({ where: { id } });
  return locked(c.environmentId, async (tx) => {
    await owned(c.environmentId, scope, tx);
    const existing = await tx.labMessage.findUnique({
      where: { conversationId_clientKey: { conversationId: id, clientKey } },
    });
    if (existing) return existing;
    const catalog = await tx.labProduct.findMany({ orderBy: { id: "asc" } });
    const terms = text.toLowerCase();
    let matched = catalog.filter(
      (p) =>
        (p.keywords as string[]).some((k) =>
          new RegExp("\\b" + k + "\\b", "i").test(terms),
        ) || terms.includes(p.name.toLowerCase()),
    );
    if (!matched.length && /buy|purchase|product|find|report/i.test(text))
      matched = catalog;
    const budgetText = text.match(/(?<![\d.])(-?\d+(?:\.\d+)?)\s*USDC\b/i)?.[1];
    if (budgetText && !/^(0|[1-9]\d*)(?:\.\d{1,6})?$/.test(budgetText))
      throw new Error(
        "Budget must be an exact nonnegative amount with at most six decimals",
      );
    let budget: string | undefined;
    if (budgetText) {
      const [whole, fraction = ""] = budgetText.split(".");
      budget = (
        BigInt(whole) * 1000000n +
        BigInt(fraction.padEnd(6, "0"))
      ).toString();
      matched = matched.filter((p) => BigInt(p.amount) <= BigInt(budget!));
    }
    let sequence = await tx.labMessage.count({
      where: { environmentId: c.environmentId },
    });
    await tx.labMessage.create({
      data: {
        environmentId: c.environmentId,
        conversationId: id,
        clientKey: clientKey + ":user",
        role: "user",
        type: "TEXT",
        content: text,
        data: {},
        sequence: ++sequence,
      },
    });
    const result = await tx.labMessage.create({
      data: {
        environmentId: c.environmentId,
        conversationId: id,
        clientKey,
        role: "assistant",
        type: "PRODUCTS",
        content: matched.length
          ? "I found these products. Choose one to review its payment options."
          : "No supported products match this request and budget.",
        data: json({
          products: matched.map((p) => ({
            ...p,
            paymentOptions: [
              {
                id: "base-sepolia-usdc",
                token: "USDC",
                network: "eip155:84532",
                simulation: true,
              },
            ],
          })),
          budget,
        }),
        sequence: ++sequence,
      },
    });
    await tx.labConversation.update({
      where: { id },
      data: { title: text.slice(0, 80) },
    });
    await emit(
      tx,
      c.environmentId,
      "SIMULATED_CATALOG_SEARCHED",
      "orchestrator",
      {
        query: text,
        matchedProducts: matched.map((p) => p.id),
        conversationId: id,
      },
    );
    return result;
  });
}
export async function selectProduct(
  scope: Scope,
  id: string,
  messageId: string,
  productId: string,
  clientKey: string,
) {
  const c = await db.labConversation.findUniqueOrThrow({ where: { id } });
  await owned(c.environmentId, scope);
  const discovery = await db.labMessage.findFirstOrThrow({
    where: { id: messageId, conversationId: id, type: "PRODUCTS" },
  });
  const result = discovery.data as any;
  if (!result.products.some((p: any) => p.id === productId))
    throw new Error("Product must come from this persisted catalog discovery");
  return locked(c.environmentId, async (tx) => {
    const previous = await tx.labMessage.findUnique({
      where: { conversationId_clientKey: { conversationId: id, clientKey } },
    });
    if (previous) return previous;
    const product = await tx.labProduct.findUniqueOrThrow({
      where: { id: productId },
    });
    const sequence =
      (await tx.labMessage.count({
        where: { environmentId: c.environmentId },
      })) + 1;
    const m = await tx.labMessage.create({
      data: {
        environmentId: c.environmentId,
        conversationId: id,
        clientKey,
        role: "assistant",
        type: "PAYMENT_METHOD",
        content:
          "USDC on simulated Base Sepolia is available for this product.",
        data: {
          productId,
          discoveryId: messageId,
          product,
          budget: result.budget || product.amount,
          methods: [
            {
              id: "base-sepolia-usdc",
              token: "USDC",
              network: "eip155:84532",
              simulation: true,
            },
          ],
        },
        sequence,
      },
    });
    await emit(tx, c.environmentId, "PRODUCT_SELECTED_BY_USER", "user", {
      productId,
      conversationId: id,
    });
    return m;
  });
}
export async function chooseMethod(
  scope: Scope,
  id: string,
  messageId: string,
  clientKey: string,
) {
  const c = await db.labConversation.findUniqueOrThrow({ where: { id } });
  await owned(c.environmentId, scope);
  const message = await db.labMessage.findFirstOrThrow({
    where: { id: messageId, conversationId: id, type: "PAYMENT_METHOD" },
  });
  const selected = message.data as any;
  const p = await createPurchase(
    scope,
    c.environmentId,
    selected.productId,
    clientKey,
    "User selected " + selected.product.name,
    { budget: selected.budget },
  );
  await locked(c.environmentId, async (tx) => {
    const prior = await tx.labMessage.findUnique({
      where: {
        conversationId_clientKey: {
          conversationId: id,
          clientKey: clientKey + ":receipt",
        },
      },
    });
    if (prior) return;
    await tx.labMessage.create({
      data: {
        environmentId: c.environmentId,
        conversationId: id,
        clientKey: clientKey + ":receipt",
        role: "assistant",
        type: "PAYMENT_RECEIPT",
        content: "Please review and approve this simulated payment.",
        data: { purchaseId: p.id },
        purchaseId: p.id,
        sequence:
          (await tx.labMessage.count({
            where: { environmentId: c.environmentId },
          })) + 1,
      },
    });
    await emit(
      tx,
      c.environmentId,
      "PAYMENT_METHOD_SELECTED",
      "user",
      { productId: p.productId, method: "base-sepolia-usdc" },
      p.id,
    );
  });
  return inspectPurchase(scope, p.id);
}
