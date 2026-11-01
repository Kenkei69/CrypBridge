import type { Prisma, SimulationEvent } from "@prisma/client";
type Tx = Prisma.TransactionClient;
export function usdc(value: string) {
  if (!/^\d+$/.test(value)) return value;
  const n = BigInt(value);
  return `${n / 1000000n}.${(n % 1000000n).toString().padStart(6, "0").replace(/0+$/, "").padEnd(2, "0")}`;
}
export async function message(
  tx: Tx,
  conversationId: string,
  key: string,
  type: string,
  role: string,
  content: string,
  data: unknown = {},
  simulationId?: string,
  event?: SimulationEvent,
) {
  return tx.chatMessage.upsert({
    where: { conversationId_dedupKey: { conversationId, dedupKey: key } },
    create: {
      conversationId,
      dedupKey: key,
      type,
      role,
      content,
      data: JSON.parse(JSON.stringify(data)),
      simulationId,
      eventId: event?.id,
      createdAt: event?.createdAt,
    },
    update: {},
  });
}
const reasonText: Record<string, string> = {
  AMOUNT_EXCEEDS_AUTHORIZATION: "Amount exceeds authorization",
  AMOUNT_MISMATCH: "Amount differs from your approved price",
  RECIPIENT_MISMATCH: "Recipient differs from your approved merchant",
  TOKEN_MISMATCH: "Asset contract is not authorized",
  NETWORK_MISMATCH: "Network is not authorized",
  UNAUTHORIZED_CONTRACT_INTERACTION: "Unapproved contract permission",
  UNLIMITED_ALLOWANCE: "Unlimited token allowance requested",
  UNKNOWN_SPENDER: "Spender is not authorized",
  DAILY_POLICY_LIMIT: "Daily spending limit exceeded",
  SESSION_POLICY_LIMIT: "Session spending limit exceeded",
  TRANSACTION_POLICY_LIMIT: "Payment limit exceeded",
  SIGNING_DISABLED: "Payment permissions are paused",
  INSUFFICIENT_MOCK_BALANCE: "Insufficient available balance",
  USER_AUTHORIZATION_EXPIRED: "Authorization has expired",
};
export async function projectEvent(tx: Tx, e: SimulationEvent) {
  const s = await tx.simulation.findUniqueOrThrow({
    where: { id: e.simulationId },
    include: {
      authorization: true,
      resource: { include: { merchant: true } },
      transfer: true,
    },
  });
  if (!s.conversationId) return;
  const cid = s.conversationId,
    d = e.data as any,
    input = s.modified as any,
    p = s.authorization || (s.proposal as any),
    req = input?.requirements?.accepts?.[0];
  const signed = await tx.mockSigning.count({ where: { simulationId: s.id } });
  const account = await tx.mockAccount.findUnique({
    where: { id: "buyer-demo" },
  });
  const details = {
    simulationId: s.id,
    purchaseId: s.authorization?.id || s.id,
    eventId: e.id,
    eventType: e.type,
    lastEventSequence: e.sequence,
    decisionId: d.decisionId || null,
    approvedAmount: p.amount,
    requestedAmount: req?.amount || p.amount,
    approvedRecipient: p.recipient,
    requestedRecipient: req?.payTo || p.recipient,
    asset: p.asset,
    token: "USDC",
    network: p.network,
    resource: s.resource.name,
    merchant: s.resource.merchant.name,
    merchantDomain: new URL(p.resourceUrl).host,
    authorization: s.authorization,
    requirements: input?.requirements || s.original,
    rules: d.rules || [],
    signed: signed > 0,
    settled: Boolean(s.transfer),
    paymentReference: s.transfer?.id || null,
    balance: account?.balance.toFixed(0),
    settlementType: "SIMULATED",
    mode: "mock",
  };
  const approvalKey = `approval:${s.id}`,
    paymentKey = `payment:${s.id}`;
  async function put(
    key: string,
    type: string,
    role: string,
    content: string,
    data: any,
    terminal = false,
  ) {
    const old = await tx.chatMessage.findUnique({
      where: {
        conversationId_dedupKey: { conversationId: cid, dedupKey: key },
      },
    });
    const previous = old?.data as any;
    if (
      old &&
      (previous.lastEventSequence >= e.sequence ||
        (previous.terminal && !terminal))
    )
      return;
    await tx.chatMessage.upsert({
      where: {
        conversationId_dedupKey: { conversationId: cid, dedupKey: key },
      },
      create: {
        conversationId: cid,
        dedupKey: key,
        type,
        role,
        content,
        data: { ...data, terminal },
        simulationId: s.id,
        eventId: e.id,
        createdAt: e.createdAt,
      },
      update: {
        type,
        role,
        content,
        data: { ...data, terminal },
        eventId: e.id,
      },
    });
  }
  switch (e.type) {
    case "USER_REQUESTED_PURCHASE":
      if (d.chatMessageId)
        await tx.chatMessage.updateMany({
          where: { id: d.chatMessageId, conversationId: cid },
          data: { simulationId: s.id, eventId: e.id },
        });
      else if (!d.chatOrigin)
        await message(
          tx,
          cid,
          `${e.id}:user`,
          "USER_MESSAGE",
          "user",
          d.prompt,
          {},
          s.id,
          e,
        );
      break;
    case "PURCHASE_PROPOSED":
      await put(
        approvalKey,
        "APPROVAL_RECEIPT",
        "assistant",
        "Review your payment request.",
        { ...details, status: "AWAITING_APPROVAL", proposal: s.proposal },
      );
      break;
    case "USER_AUTHORIZATION_SAVED": {
      const old = await tx.chatMessage.findUnique({
        where: {
          conversationId_dedupKey: {
            conversationId: cid,
            dedupKey: approvalKey,
          },
        },
      });
      if (old)
        await tx.chatMessage.update({
          where: { id: old.id },
          data: {
            data: {
              ...(old.data as any),
              status: "APPROVED",
              authorizationId: s.authorization?.id,
            },
          },
        });
      await put(
        paymentKey,
        "PAYMENT_RECEIPT",
        "assistant",
        "Processing your payment…",
        { ...details, status: "PROCESSING" },
      );
      break;
    }
    case "PAYMENT_BLOCKED":
      await put(
        paymentKey,
        "BLOCKED_RECEIPT",
        "guardian",
        "Guardian detected an unauthorized or unsafe change to your payment.",
        {
          ...details,
          status: "BLOCKED",
          reason: (d.rules as string[])
            .map((r) => reasonText[r] || r.toLowerCase().replaceAll("_", " "))
            .join("; "),
          walletImpact: s.transfer
            ? "Review the recorded payment"
            : "No funds were transferred.",
          decidedAt: e.createdAt,
        },
        true,
      );
      break;
    case "RESOURCE_DELIVERED": {
      const notices = [];
      if (input?.merchantContent)
        notices.push("Untrusted merchant instructions were isolated.");
      if (input?.repeatCount > 1)
        notices.push("Repeated requests cannot create another charge.");
      await put(
        paymentKey,
        "SUCCESS_RECEIPT",
        "assistant",
        "Your purchase is ready.",
        {
          ...details,
          status: "COMPLETED",
          paidAmount: d.amount,
          resourceContent: d.content,
          paymentReference: d.ledgerEntryId,
          paidAt: e.createdAt,
          settlementStatus: "Simulated settlement completed",
          securityNotes: notices,
        },
        true,
      );
      break;
    }
    case "PURCHASE_CANCELLED": {
      const old = await tx.chatMessage.findUnique({
        where: {
          conversationId_dedupKey: {
            conversationId: cid,
            dedupKey: approvalKey,
          },
        },
      });
      if (old)
        await tx.chatMessage.update({
          where: { id: old.id },
          data: { data: { ...(old.data as any), status: "REJECTED" } },
        });
      await put(
        paymentKey,
        "CANCELED_RECEIPT",
        "assistant",
        "Purchase rejected. No funds were transferred.",
        { ...details, status: "CANCELED" },
        true,
      );
      break;
    }
    case "MERCHANT_REQUEST_FAILED":
    case "SETTLEMENT_FAILED":
      await put(
        paymentKey,
        "FAILED_RECEIPT",
        "system",
        "Your payment could not be completed. Review the details before retrying.",
        { ...details, status: "FAILED", errorCode: e.type, error: d.message },
        true,
      );
      break;
  }
  await tx.conversation.update({
    where: { id: cid },
    data: { updatedAt: new Date() },
  });
}
