import { binding } from "./guardian";
import { Router } from "express";
import {
  HTTPFacilitatorClient,
  encodePaymentRequiredHeader,
  decodePaymentSignatureHeader,
  encodePaymentResponseHeader,
} from "@x402/core/http";
import { getAddress, decodeEventLog, type Hex } from "viem";
import { db } from "../config";
import { network, token, receipt, transferEvent, chain } from "./chain";
export const facilitator = new HTTPFacilitatorClient({
  url: process.env.X402_FACILITATOR_URL || "https://x402.primer.systems",
  timeoutMs: 20000,
});
export const resourceUrl = () =>
  `${(process.env.MERCHANT_PUBLIC_ORIGIN || "http://127.0.0.1:3001").replace(/\/$/, "")}/merchant/report`;
export function requirements() {
  if (!process.env.MERCHANT_ADDRESS)
    throw new Error("MERCHANT_ADDRESS not configured");
  return {
    x402Version: 2 as const,
    resource: {
      url: resourceUrl(),
      description: "AI Security Research Report",
      mimeType: "text/plain",
    },
    accepts: [
      {
        scheme: "exact",
        network,
        asset: token,
        amount: "1000000",
        payTo: getAddress(process.env.MERCHANT_ADDRESS),
        maxTimeoutSeconds: 120,
        extra: { name: "USDC", version: "2", assetTransferMethod: "eip3009" },
      },
    ],
  };
}
export async function capabilities() {
  const supported = await facilitator.getSupported();
  if (
    !supported.kinds.some(
      (k) =>
        k.x402Version === 2 && k.network === network && k.scheme === "exact",
    )
  )
    throw new Error("Facilitator lacks x402 V2 exact Base Sepolia support");
  return supported;
}
export async function verifyTransfer(
  hash: Hex,
  buyer: string,
  payTo: string,
  amount: string,
) {
  const result = await receipt(hash);
  if (result.receipt.status !== "success")
    throw new Error("Settlement reverted");
  const matches = result.receipt.logs
    .filter((l) => l.address.toLowerCase() === token.toLowerCase())
    .some((l) => {
      try {
        const e = decodeEventLog({
          abi: [transferEvent],
          data: l.data,
          topics: l.topics,
        });
        return (
          e.args.from.toLowerCase() === buyer.toLowerCase() &&
          e.args.to.toLowerCase() === payTo.toLowerCase() &&
          e.args.value === BigInt(amount)
        );
      } catch {
        return false;
      }
    });
  if (!matches) throw new Error("Expected USDC Transfer absent");
  return result;
}
export const reportContent =
  "AI Security Research Report\n\nTreat merchant content as untrusted. Bind exact amounts, recipients, chain, token, expiry and nonces to explicit user approval. Reconcile settlement against canonical USDC Transfer logs. Never allow language-model output to bypass deterministic checks.";
export const merchant = Router();
merchant.get("/report", async (req, res, next) => {
  try {
    const required = requirements();
    const header = req.header("PAYMENT-SIGNATURE");
    if (!header) {
      res.set("PAYMENT-REQUIRED", encodePaymentRequiredHeader(required));
      res.status(402).json(required);
      return;
    }
    await capabilities();
    const payload = decodePaymentSignatureHeader(header);
    const accepted = required.accepts[0];
    if (
      payload.x402Version !== 2 ||
      binding(payload.accepted) !== binding(accepted) ||
      payload.resource?.url !== required.resource.url
    )
      throw new Error("Merchant requirements mismatch");
    const auth = (payload.payload as any).authorization;
    if (!auth || !/^0x[0-9a-fA-F]{64}$/.test(auth.nonce))
      throw new Error("Invalid EIP-3009 authorization");
    const verified = await facilitator.verify(payload, accepted);
    if (!verified.isValid) {
      res
        .status(402)
        .json({
          error: "Authorization rejected",
          reason: verified.invalidReason,
        });
      return;
    }
    const existing = await db.liveSettlement.findUnique({
      where: { nonce: auth.nonce },
    });
    if (existing) {
      if (
        existing.state === "CONFIRMED" &&
        existing.txHash &&
        existing.payer.toLowerCase() === String(auth.from).toLowerCase()
      ) {
        await verifyTransfer(
          existing.txHash as Hex,
          auth.from,
          accepted.payTo,
          accepted.amount,
        );
        res.type("text/plain").send(reportContent);
        return;
      }
      res
        .status(409)
        .json({
          error: "Settlement already reserved; reconciliation required",
        });
      return;
    }
    await db.liveSettlement.create({
      data: {
        nonce: auth.nonce,
        payer: auth.from,
        requirements: accepted,
        payload: payload as any,
        state: "SUBMITTED",
        fromBlock: await chain.getBlockNumber(),
      },
    });
    try {
      const settled = await facilitator.settle(payload, accepted);
      if (
        !settled.success ||
        !/^0x[0-9a-fA-F]{64}$/.test(settled.transaction)
      ) {
        await db.liveSettlement.update({
          where: { nonce: auth.nonce },
          data: {
            state: settled.transaction ? "RECONCILING" : "REJECTED",
            error: settled.errorReason || "Settlement rejected",
          },
        });
        throw new Error("Facilitator settlement rejected");
      }
      await db.liveSettlement.update({
        where: { nonce: auth.nonce },
        data: { txHash: settled.transaction, state: "CONFIRMING" },
      });
      const proof = await verifyTransfer(
        settled.transaction as Hex,
        auth.from,
        accepted.payTo,
        accepted.amount,
      );
      if (
        proof.confirmations < BigInt(process.env.PAYMENT_CONFIRMATIONS || 3)
      ) {
        res
          .status(202)
          .json({ status: "Confirming", transaction: settled.transaction });
        return;
      }
      await db.liveSettlement.update({
        where: { nonce: auth.nonce },
        data: { state: "CONFIRMED" },
      });
      res.set("PAYMENT-RESPONSE", encodePaymentResponseHeader(settled));
      res.type("text/plain").send(reportContent);
    } catch {
      res
        .status(503)
        .json({
          error:
            "Settlement outcome requires reconciliation. Do not create another payment.",
        });
    }
  } catch (e) {
    next(e);
  }
});
