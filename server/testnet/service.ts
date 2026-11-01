import { parseAbiItem } from "viem";
import { randomBytes } from "node:crypto";
import {
  encodePaymentSignatureHeader,
  decodePaymentResponseHeader,
} from "@x402/core/http";
import { db } from "../config";
import { balances, chain, token } from "./chain";
import { buyerAddress, signIntent } from "./signer";
import {
  requirements,
  resourceUrl,
  capabilities,
  verifyTransfer,
  reportContent,
} from "./merchant";
import { guard } from "./guardian";
import { notify } from "./indexer";
export async function propose(userId: string, clientKey: string) {
  const buyer = buyerAddress();
  if (!buyer)
    throw new Error(
      "Configure BUYER_ADDRESS or BUYER_PRIVATE_KEY through server secrets",
    );
  const required = requirements();
  await balances(buyer as `0x${string}`);
  return db.liveIntent.upsert({
    where: { userId_clientKey: { userId, clientKey } },
    create: {
      userId,
      clientKey,
      buyer,
      payTo: required.accepts[0].payTo,
      amount: "1000000",
      resource: resourceUrl(),
      expiresAt: new Date(Date.now() + 300000),
      nonce: randomBytes(32).toString("hex"),
      requirements: required,
    },
    update: {},
  });
}
export async function reconcile(id: string, userId: string) {
  const i = await db.liveIntent.findFirstOrThrow({ where: { id, userId } });
  const nonce = (i.payload as any)?.payload?.authorization?.nonce;
  const settlement = nonce
    ? await db.liveSettlement.findUnique({ where: { nonce } })
    : null;
  let hash = i.txHash || settlement?.txHash;
  if (!hash && settlement) {
    const head = await chain.getBlockNumber();
    const event = parseAbiItem(
      "event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)",
    );
    // Never resubmit an uncertain authorization. Recover its hash from canonical nonce evidence.
    for (let from = settlement.fromBlock; from <= head; from += 200n) {
      const to = from + 199n < head ? from + 199n : head;
      const logs = await chain.getLogs({
        address: token,
        event,
        args: { authorizer: i.buyer as `0x${string}`, nonce },
        fromBlock: from,
        toBlock: to,
        strict: true,
      });
      if (logs.length) {
        hash = logs[0].transactionHash;
        await db.liveSettlement.update({
          where: { nonce },
          data: { txHash: hash, state: "CONFIRMING" },
        });
        break;
      }
    }
  }
  if (!hash) return i;
  const proof = await verifyTransfer(
    hash as `0x${string}`,
    i.buyer,
    i.payTo,
    i.amount,
  );
  const confirmed =
    proof.confirmations >= BigInt(process.env.PAYMENT_CONFIRMATIONS || 3);
  const updated = await db.liveIntent.update({
    where: { id },
    data: {
      txHash: hash,
      state: confirmed ? "CONFIRMED" : "CONFIRMING",
      error: null,
    },
  });
  if (confirmed) {
    if (settlement)
      await db.liveSettlement.update({
        where: { nonce },
        data: { state: "CONFIRMED" },
      });
    await notify(userId, `confirmed:${id}`, "payment.confirmed", {
      id,
      txHash: hash,
    });
  }
  return updated;
}
export async function purchase(id: string, userId: string) {
  const reserved = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(current_schema()),8453202)`;
    const i = await tx.liveIntent.findFirstOrThrow({ where: { id, userId } });
    if (i.state !== "AWAITING_APPROVAL") return false;
    if (i.expiresAt.getTime() <= Date.now())
      throw new Error("Approval expired");
    const active = await tx.liveIntent.findMany({
      where: {
        buyer: i.buyer,
        state: {
          in: [
            "RESERVED",
            "SIGNED",
            "SUBMITTED",
            "CONFIRMING",
            "CONFIRMED",
            "RECONCILING",
          ],
        },
        createdAt: { gte: new Date(Date.now() - 86400000) },
      },
    });
    if (
      active.reduce((n, x) => n + BigInt(x.amount), 0n) + BigInt(i.amount) >
      10000000n
    )
      throw new Error("Daily spending limit");
    const sessionSpend = active
      .filter(
        (x) =>
          x.userId === userId &&
          x.createdAt.getTime() >= Date.now() - 8 * 3600000,
      )
      .reduce((n, x) => n + BigInt(x.amount), 0n);
    if (sessionSpend + BigInt(i.amount) > 5000000n)
      throw new Error("Session spending limit");
    await tx.liveIntent.update({
      where: { id },
      data: { approvedAt: new Date(), state: "RESERVED" },
    });
    return true;
  });
  if (!reserved) return reconcile(id, userId);
  try {
    await capabilities();
    const response = await fetch(resourceUrl(), {
      signal: AbortSignal.timeout(15000),
    });
    if (response.status !== 402)
      throw new Error("Merchant did not return HTTP 402");
    const required = await response.json();
    const intent = await db.liveIntent.findUniqueOrThrow({ where: { id } });
    const decision = guard(intent, required);
    await db.liveDecision.create({
      data: { userId, intentId: id, ...decision },
    });
    if (!decision.allowed) {
      await db.liveIntent.update({
        where: { id },
        data: { state: "BLOCKED", error: decision.rules.join(",") },
      });
      await notify(userId, `blocked:${id}`, "guardian.blocked", {
        id,
        rules: decision.rules,
      });
      return db.liveIntent.findUniqueOrThrow({ where: { id } });
    }
    await db.liveIntent.update({
      where: { id },
      data: { requirements: required },
    });
    const balance = await balances(intent.buyer as `0x${string}`);
    if (BigInt(balance.usdcAtomic) < BigInt(intent.amount))
      throw new Error("Insufficient testnet USDC");
    const payload = await signIntent(id);
    await db.liveIntent.update({
      where: { id },
      data: { payload: payload as any, state: "SUBMITTED" },
    });
    await notify(userId, `submitted:${id}`, "payment.submitted", { id });
    const paid = await fetch(resourceUrl(), {
      headers: { "PAYMENT-SIGNATURE": encodePaymentSignatureHeader(payload) },
      signal: AbortSignal.timeout(45000),
    });
    const header = paid.headers.get("PAYMENT-RESPONSE");
    if (header) {
      const settlement = decodePaymentResponseHeader(header);
      await db.liveIntent.update({
        where: { id },
        data: { txHash: settlement.transaction, state: "CONFIRMING" },
      });
    }
    if (!paid.ok && paid.status !== 202)
      throw new Error("Merchant settlement requires reconciliation");
    return reconcile(id, userId);
  } catch (e) {
    const signed = await db.liveSigning.findUnique({ where: { intentId: id } });
    await db.liveIntent.update({
      where: { id },
      data: {
        state: signed ? "RECONCILING" : "BLOCKED",
        error: e instanceof Error ? e.message : "Payment failed",
      },
    });
    await notify(userId, `error:${id}`, "payment.blocked", {
      id,
      error: signed
        ? "Settlement outcome uncertain; reconciliation required"
        : "Blocked before signing",
    });
    return db.liveIntent.findUniqueOrThrow({ where: { id } });
  }
}
export async function delivery(id: string, userId: string) {
  const i = await reconcile(id, userId);
  if (i.state !== "CONFIRMED") throw new Error("Payment is not confirmed");
  return reportContent;
}
