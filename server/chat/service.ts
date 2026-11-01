import { discover, approveCheckout } from "./shopping";
import { interpretDialogue } from "./dialogue";
import { db } from "../config";
import { AppError, conflict } from "../errors";
import {
  propose,
  confirm,
  continuePurchase,
  cancelPurchase,
  getSimulation,
} from "../simulation/engine";
import { message, usdc } from "./messages";
export async function getConversation(id: string, userId: string) {
  const c = await db.conversation.findFirst({
    where: { id, userId },
    include: {
      messages: { orderBy: { sequence: "asc" } },
      simulations: {
        include: {
          authorization: true,
          decisions: { orderBy: { createdAt: "asc" } },
          signings: { select: { id: true, createdAt: true, consumedAt: true } },
          transfer: true,
          resource: { include: { merchant: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!c)
    throw new AppError(
      404,
      "CONVERSATION_NOT_FOUND",
      "Conversation not found in this workspace.",
    );
  return {
    ...c,
    dialogueMode: process.env.DIALOGUE_ADAPTER_URL
      ? "model_intent_adapter"
      : "deterministic",
  };
}
export async function createConversation(userId: string, sandboxId?: string) {
  return db.$transaction(async (tx) => {
    const c = await tx.conversation.create({ data: { userId, sandboxId } });
    await message(
      tx,
      c.id,
      "welcome",
      "AI_MESSAGE",
      "assistant",
      "What would you like to shop for? I’ll show matching catalog products, payment options, and a receipt for your approval.",
      { dialogueMode: "deterministic" },
    );
    return c;
  });
}
export async function listConversations(userId: string, sandboxId?: string) {
  return db.conversation.findMany({
    where: { userId, ...(sandboxId ? { sandboxId } : {}) },
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: { _count: { select: { messages: true } } },
  });
}
async function reply(
  conversationId: string,
  key: string,
  text: string,
  data: unknown = {},
) {
  await db.$transaction(async (tx) => {
    await message(
      tx,
      conversationId,
      key,
      "AI_MESSAGE",
      "assistant",
      text,
      data,
    );
    await tx.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
  });
}
export async function technicalError(
  conversationId: string,
  userId: string,
  key: string,
  error: unknown,
  simulationId?: string,
) {
  await getConversation(conversationId, userId);
  const code = error instanceof AppError ? error.code : "OPERATION_FAILED";
  const text =
    error instanceof Error
      ? error.message
      : "The operation could not complete.";
  await db.$transaction((tx) =>
    message(
      tx,
      conversationId,
      `error:${key}`,
      "SYSTEM_ERROR",
      "system",
      text,
      { errorCode: code },
      simulationId,
    ),
  );
  await db.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });
}
export async function sendMessage(
  conversationId: string,
  userId: string,
  text: string,
  clientKey: string,
  sandboxId?: string,
) {
  const ownedConversation = await getConversation(conversationId, userId);
  if (sandboxId && ownedConversation.sandboxId !== sandboxId)
    throw new AppError(
      403,
      "TEST_SESSION_MISMATCH",
      "Start a conversation in this test session.",
    );
  const claimed = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(9403)`;
    const turn = await tx.chatTurn.findUnique({
      where: { conversationId_clientKey: { conversationId, clientKey } },
      include: { simulation: true },
    });
    if (turn) {
      const original = await tx.chatMessage.findUnique({
        where: {
          conversationId_dedupKey: {
            conversationId,
            dedupKey: `user:${clientKey}`,
          },
        },
      });
      if (original?.content !== text)
        throw conflict(
          "This message identifier was already used for different text.",
        );
      if (turn.status === "PROCESSING" && !turn.simulation)
        throw conflict(
          "This message is still being processed. Retry shortly with the same message identifier.",
        );
      return null;
    }
    const created = await tx.chatTurn.create({
      data: { conversationId, clientKey },
    });
    const userMessage = await message(
      tx,
      conversationId,
      `user:${clientKey}`,
      "USER_MESSAGE",
      "user",
      text,
    );
    await tx.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
    return { turn: created, userMessage };
  });
  if (!claimed) return getConversation(conversationId, userId);
  const key = `turn:${claimed.turn.id}`;
  try {
    const c = await getConversation(conversationId, userId);
    const latest = c.simulations[0];
    const q = text.trim().toLowerCase();
    const one = (stages: string[]) => {
      const pending = c.simulations.filter((s) => stages.includes(s.stage));
      return pending.length === 1 ? pending[0] : null;
    };
    if (
      /^(yes[,.!]?\s*)?(approve( (it|purchase|the purchase))?|proceed|go ahead|yes|buy it)[.!]?$/i.test(
        q,
      )
    ) {
      const target = one(["AWAITING_APPROVAL"]);
      if (target) {
        await db.chatMessage.update({
          where: { id: claimed.userMessage.id },
          data: { simulationId: target.id },
        });
        if (target.automatic)
          await approveCheckout(conversationId, userId, sandboxId!, target.id);
        else await confirm(target.id, userId);
      } else
        await reply(
          conversationId,
          key,
          "Please use the Approve purchase button on the specific card you want to authorize. I need one unambiguous purchase before proceeding.",
        );
    } else if (
      /^(cancel|cancel it|cancel purchase|never mind|nevermind|no thanks)[.!]?$/i.test(
        q,
      )
    ) {
      const target = one([
        "AWAITING_APPROVAL",
        "AUTHORIZED",
        "ATTACK_WINDOW_OPEN",
      ]);
      if (target) {
        await db.chatMessage.update({
          where: { id: claimed.userMessage.id },
          data: { simulationId: target.id },
        });
        await cancelPurchase(target.id, userId);
      } else
        await reply(
          conversationId,
          key,
          "I can cancel a purchase before evaluation or signing starts. Choose a pending purchase card; completed or processing payments cannot be canceled.",
        );
    } else if (
      /^(continue( without (an? )?attack)?|pay now|finish purchase)[.!]?$/i.test(
        q,
      )
    ) {
      const target = one(["ATTACK_WINDOW_OPEN"]);
      if (target) {
        await db.chatMessage.update({
          where: { id: claimed.userMessage.id },
          data: { simulationId: target.id },
        });
        await continuePurchase(target.id, userId);
      } else
        await reply(
          conversationId,
          key,
          "There is no single open test payment to continue. Use the Continue without attack action on the relevant pending message.",
        );
    } else if (/\b(balance|funds|how much money)\b/i.test(q)) {
      const wallet = await db.mockAccount.findUniqueOrThrow({
        where: { id: "buyer-demo" },
      });
      await reply(
        conversationId,
        key,
        `Your available balance is ${usdc(wallet.balance.toFixed(0))} USDC.`,
        { balance: wallet.balance.toFixed(0) },
      );
    } else if (
      /\b(why|explain|what happened|safe|decision|blocked)\b/i.test(q) &&
      latest
    ) {
      const s = await getSimulation(latest.id, userId);
      const last = s.decisions.at(-1);
      const explanation = last
        ? `The Guardian ${last.decision === "block" ? "blocked" : "approved"} this payment: ${last.explanation}`
        : `Your purchase is ${s.stage.toLowerCase().replaceAll("_", " ")}. Nothing can be signed before your confirmation and a passing Guardian decision.`;
      await reply(conversationId, key, explanation, {
        simulationId: s.id,
        rules: last?.rules || [],
        decision: last?.decision || null,
      });
    } else if (/^(hi|hello|hey|thanks|thank you)[!.]?$/i.test(q)) {
      await reply(
        conversationId,
        key,
        /thank/.test(q)
          ? "You’re welcome. Your approval is always required before a payment."
          : "Hello! What would you like to shop for?",
      );
    } else {
      await discover(conversationId, userId, text, key);
    }
    await db.chatTurn.update({
      where: { id: claimed.turn.id },
      data: { status: "COMPLETED" },
    });
  } catch (e) {
    await technicalError(conversationId, userId, key, e);
    await db.chatTurn.update({
      where: { id: claimed.turn.id },
      data: { status: "FAILED" },
    });
    throw e;
  }
  return getConversation(conversationId, userId);
}
export async function chatAction(
  cid: string,
  userId: string,
  simulationId: string,
  action: "approve" | "cancel" | "continue",
  clientKey: string,
) {
  const c = await getConversation(cid, userId);
  const s = c.simulations.find((s) => s.id === simulationId);
  if (!s)
    throw new AppError(
      404,
      "PURCHASE_NOT_IN_CONVERSATION",
      "This purchase does not belong to this conversation.",
    );
  try {
    if (action === "approve") {
      if (s.automatic)
        await approveCheckout(cid, userId, c.sandboxId!, simulationId);
      else await confirm(simulationId, userId);
    } else if (action === "cancel") await cancelPurchase(simulationId, userId);
    else await continuePurchase(simulationId, userId);
  } catch (e) {
    await technicalError(cid, userId, clientKey, e, simulationId);
    throw e;
  }
  return getConversation(cid, userId);
}
