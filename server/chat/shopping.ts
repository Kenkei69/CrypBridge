import { db } from "../config";
import { AppError, conflict } from "../errors";
import { message, usdc } from "./messages";
import {
  propose,
  authorizePurchase,
  cancelPurchase,
} from "../simulation/engine";
export async function discover(
  conversationId: string,
  userId: string,
  text: string,
  key: string,
) {
  const all = await db.mockResource.findMany({ include: { merchant: true } });
  const q = text.toLowerCase();
  let found = all.filter((r) =>
    (r.keywords as string[]).some((k) => new RegExp(`\\b${k}\\b`, "i").test(q)),
  );
  if (
    !found.length &&
    /\b(products|catalog|what.*buy|something|available)\b/i.test(q)
  )
    found = all;
  const products = found.map((r) => ({
    id: r.id,
    name: r.name,
    merchant: r.merchant.name,
    merchantId: r.merchantId,
    price: r.price,
    token: "USDC",
    description: r.description || r.content.slice(0, 110),
  }));
  return db.$transaction(async (tx) => {
    await message(
      tx,
      conversationId,
      key,
      "PRODUCT_RESULTS",
      "assistant",
      products.length
        ? `I found ${products.length === 1 ? "a matching product" : `${products.length} matching products`} in the catalog. Which would you like?`
        : "I couldn’t find a matching product in the connected catalog. Try a research report, article, weather data, or image.",
      { products },
    );
    await tx.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date(), title: text.slice(0, 60) },
    });
    return products;
  });
}
async function owned(cid: string, userId: string, sandboxId: string) {
  const c = await db.conversation.findFirst({
    where: { id: cid, userId, sandboxId },
  });
  if (!c)
    throw new AppError(
      404,
      "CONVERSATION_NOT_FOUND",
      "Open a conversation in this test session.",
    );
  return c;
}
export async function paymentMethods(resourceId: string) {
  const resource = await db.mockResource.findUniqueOrThrow({
    where: { id: resourceId },
    include: { merchant: true },
  });
  const wallet = await db.wallet.findFirst({
    where: {
      address: {
        equals: "0x857b06519E91e3A54538791bDbb0E22373e36b66",
        mode: "insensitive",
      },
    },
  });
  const account = await db.mockAccount.findUniqueOrThrow({
    where: { id: "buyer-demo" },
  });
  const policy = (
    await db.guardianPolicy.findFirstOrThrow({ orderBy: { version: "desc" } })
  ).config as any;
  const supported = Boolean(
    wallet?.enabled &&
      wallet.mode === "mock" &&
      wallet.network === resource.merchant.network &&
      resource.merchant.network === "eip155:84532" &&
      resource.merchant.asset.toLowerCase() ===
        policy.allowedAsset.toLowerCase() &&
      policy.allowedNetwork === resource.merchant.network &&
      policy.enabled,
  );
  return [
    {
      id: "usdc-base-sepolia",
      token: "USDC",
      network: "eip155:84532",
      networkName: "Base Sepolia",
      asset: resource.merchant.asset,
      available: supported,
      balance: supported ? account.balance.toFixed(0) : null,
      reason: supported
        ? null
        : "This wallet, merchant or policy does not currently permit this payment.",
    },
    {
      id: "usdt-bnb",
      token: "USDT",
      network: "eip155:56",
      networkName: "BNB Smart Chain",
      available: false,
      balance: null,
      reason:
        "No compatible wallet, merchant and settlement integration is configured.",
    },
    {
      id: "usdc-ethereum",
      token: "USDC",
      network: "eip155:1",
      networkName: "Ethereum",
      available: false,
      balance: null,
      reason:
        "No compatible wallet, merchant and settlement integration is configured.",
    },
  ];
}
export async function selectProduct(
  cid: string,
  userId: string,
  sandboxId: string,
  resourceId: string,
  discoveryId: string,
  clientKey: string,
) {
  await owned(cid, userId, sandboxId);
  const discovery = await db.chatMessage.findFirst({
    where: { id: discoveryId, conversationId: cid, type: "PRODUCT_RESULTS" },
  });
  if (
    !(discovery?.data as any)?.products?.some((r: any) => r.id === resourceId)
  )
    throw new AppError(
      400,
      "PRODUCT_NOT_OFFERED",
      "Select a product from these catalog results.",
    );
  const r = await db.mockResource.findUniqueOrThrow({
    where: { id: resourceId },
  });
  const methods = await paymentMethods(r.id);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(9403)`;
    let selection = await tx.shoppingSelection.findUnique({
      where: { conversationId_clientKey: { conversationId: cid, clientKey } },
    });
    if (selection && selection.resourceId !== resourceId)
      throw conflict("That selection key was already used.");
    if (!selection)
      selection = await tx.shoppingSelection.create({
        data: {
          conversationId: cid,
          userId,
          sandboxId,
          resourceId,
          discoveryId,
          clientKey,
        },
      });
    await message(
      tx,
      cid,
      `method-options:${selection.id}`,
      "PAYMENT_METHODS",
      "assistant",
      `${r.name} is selected. How would you like to pay?`,
      {
        selectionId: selection.id,
        resourceId: r.id,
        methods,
        selectedMethod: null,
      },
    );
    await tx.chatMessage.update({
      where: { id: discoveryId },
      data: {
        data: { ...(discovery!.data as any), selectedProductId: resourceId },
      },
    });
    await tx.conversation.update({
      where: { id: cid },
      data: { updatedAt: new Date() },
    });
    return selection;
  });
}
export async function selectMethod(
  cid: string,
  userId: string,
  sandboxId: string,
  selectionId: string,
  methodId: string,
) {
  await owned(cid, userId, sandboxId);
  const claim = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(9403)`;
    const s = await tx.shoppingSelection.findFirst({
      where: { id: selectionId, conversationId: cid, userId, sandboxId },
    });
    if (!s)
      throw new AppError(
        404,
        "SELECTION_NOT_FOUND",
        "Product selection not found.",
      );
    if (s.simulationId) return { selection: s, existing: true };
    if (s.stage === "PAYMENT_METHOD_SELECTED")
      throw conflict("This payment method is already being prepared.");
    const methods = await paymentMethods(s.resourceId);
    const method = methods.find((m) => m.id === methodId);
    if (!method?.available)
      throw new AppError(
        422,
        "PAYMENT_METHOD_UNAVAILABLE",
        "That asset and network combination is not supported by this wallet and merchant.",
      );
    return {
      selection: await tx.shoppingSelection.update({
        where: { id: s.id },
        data: {
          stage: "PAYMENT_METHOD_SELECTED",
          method: JSON.parse(JSON.stringify(method)),
        },
      }),
      existing: false,
    };
  });
  if (claim.existing) return claim.selection;
  try {
    const r = await db.mockResource.findUniqueOrThrow({
      where: { id: claim.selection.resourceId },
    });
    const simulation = await propose(
      userId,
      `Buy ${r.name} for $${usdc(r.price)}.`,
      undefined,
      { conversationId: cid, resourceId: r.id, automatic: true, sandboxId },
    );
    if ("clarification" in simulation)
      throw new AppError(
        422,
        "CATALOG_PRICE_CHANGED",
        simulation.clarification,
      );
    await db.$transaction(async (tx) => {
      await tx.shoppingSelection.update({
        where: { id: selectionId },
        data: { simulationId: simulation.id, stage: "AWAITING_USER_APPROVAL" },
      });
      const m = await tx.chatMessage.findUniqueOrThrow({
        where: {
          conversationId_dedupKey: {
            conversationId: cid,
            dedupKey: `method-options:${selectionId}`,
          },
        },
      });
      await tx.chatMessage.update({
        where: { id: m.id },
        data: { data: { ...(m.data as any), selectedMethod: methodId } },
      });
      await tx.conversation.update({
        where: { id: cid },
        data: { updatedAt: new Date() },
      });
    });
    return simulation;
  } catch (e) {
    await db.shoppingSelection.update({
      where: { id: selectionId },
      data: { stage: "PRODUCT_SELECTED" },
    });
    throw e;
  }
}
export async function approveCheckout(
  cid: string,
  userId: string,
  sandboxId: string,
  simulationId: string,
) {
  await owned(cid, userId, sandboxId);
  const s = await db.simulation.findFirst({
    where: {
      id: simulationId,
      conversationId: cid,
      userId,
      sandboxId,
      automatic: true,
    },
  });
  if (!s)
    throw new AppError(404, "PURCHASE_NOT_FOUND", "Payment request not found.");
  const job = await db.paymentJob.findUnique({ where: { simulationId } });
  if (job) return s;
  return authorizePurchase(s.id, userId, true);
}
