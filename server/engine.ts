import { z } from "zod";
import { isAddress } from "viem";
import { randomBytes } from "node:crypto";
import { db, defaultPolicy } from "./config";
export const uint = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,77})$/)
  .refine((v) => {
    try {
      return BigInt(v) < 2n ** 256n;
    } catch {
      return false;
    }
  });
const address = z
  .string()
  .refine((v) => Boolean(isAddress(v, { strict: false })));
export const requirements = z
  .object({
    scheme: z.string(),
    network: z.string(),
    amount: uint,
    asset: address,
    payTo: address,
    maxTimeoutSeconds: z.number().int().positive().max(3600),
  })
  .passthrough();
export const envelope = z.object({
  agentId: z.string(),
  mode: z.literal("mock"),
  service: z.string().url(),
  payment: z.object({ x402Version: z.literal(2), accepted: requirements }),
  authorization: z.object({
    from: address,
    to: address,
    value: uint,
    validAfter: uint,
    validBefore: uint,
    nonce: z.string().regex(/^0x[0-9a-f]{64}$/),
  }),
  mockSignature: z.literal("isolated-demo"),
});
export type Envelope = z.infer<typeof envelope>;
export function fixture(agentId: string): Envelope {
  const now = Math.floor(Date.now() / 1000);
  return {
    agentId,
    mode: "mock",
    service: defaultPolicy.service,
    payment: {
      x402Version: 2,
      accepted: {
        scheme: "exact",
        network: defaultPolicy.network,
        amount: "100000",
        asset: defaultPolicy.asset,
        payTo: defaultPolicy.recipient,
        maxTimeoutSeconds: 60,
      },
    },
    authorization: {
      from: "0x857b06519E91e3A54538791bDbb0E22373e36b66",
      to: defaultPolicy.recipient,
      value: "100000",
      validAfter: String(now - 1),
      validBefore: String(now + 60),
      nonce: `0x${randomBytes(32).toString("hex")}`,
    },
    mockSignature: "isolated-demo",
  };
}
export async function validate(raw: unknown) {
  const parsed = envelope.safeParse(raw);
  if (!parsed.success)
    return {
      decision: "block",
      risk: 100,
      rules: ["MALFORMED_PAYMENT"],
      explanation: "Invalid V2 test envelope",
      errors: parsed.error.flatten(),
    };
  const e = parsed.data;
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(402)`;
    const policy =
      ((await tx.policy.findFirst({ orderBy: { version: "desc" } }))
        ?.config as typeof defaultPolicy) || defaultPolicy;
    const a = e.payment.accepted,
      auth = e.authorization,
      n = BigInt(a.amount),
      now = BigInt(Math.floor(Date.now() / 1000)),
      rules: string[] = [];
    const agent = await tx.agent.findUnique({
      where: { id: e.agentId },
      include: { wallet: true },
    });
    if (
      !agent ||
      !agent.wallet.enabled ||
      agent.status !== "active" ||
      !policy.enabled
    )
      rules.push("WALLET_DISABLED");
    if (a.network !== policy.network) rules.push("NETWORK_MISMATCH");
    if (a.scheme !== policy.scheme) rules.push("SCHEME_NOT_ALLOWED");
    if (a.asset.toLowerCase() !== policy.asset.toLowerCase())
      rules.push("TOKEN_SUBSTITUTION");
    if (
      a.payTo.toLowerCase() !== policy.recipient.toLowerCase() ||
      auth.to.toLowerCase() !== a.payTo.toLowerCase()
    )
      rules.push("RECIPIENT_SUBSTITUTION");
    if (e.service !== policy.service) rules.push("UNTRUSTED_SERVICE");
    if (agent && auth.from.toLowerCase() !== agent.wallet.address.toLowerCase())
      rules.push("SIGNER_MISMATCH");
    if (n === 0n || n > BigInt(policy.maxPayment))
      rules.push("TRANSACTION_LIMIT");
    if (
      n * 10000n >
      BigInt(policy.expectedPrice) * BigInt(10000 + policy.deviationBps)
    )
      rules.push("PRICE_DEVIATION");
    if (auth.value !== a.amount) rules.push("AUTHORIZATION_TAMPERED");
    if (
      BigInt(auth.validBefore) <= now ||
      BigInt(auth.validAfter) >= now ||
      BigInt(auth.validBefore) - BigInt(auth.validAfter) > 3600n
    )
      rules.push("INVALID_VALIDITY_WINDOW");
    const nonceKey = `${a.network}:${a.asset.toLowerCase()}:${auth.from.toLowerCase()}:${auth.nonce}`;
    if (await tx.nonce.findUnique({ where: { key: nonceKey } }))
      rules.push("REPLAY_DETECTED");
    const keys = [
      `${e.agentId}:day:${new Date().toISOString().slice(0, 10)}`,
      `${e.agentId}:session`,
    ];
    for (let i = 0; i < keys.length; i++) {
      const spend = await tx.spend.findUnique({ where: { key: keys[i] } });
      if (
        BigInt(spend?.amount.toFixed(0) || "0") + n >
        BigInt(i === 0 ? policy.dailyLimit : policy.sessionLimit)
      )
        rules.push(i === 0 ? "DAILY_LIMIT" : "SESSION_LIMIT");
    }
    const decision = rules.length
      ? "block"
      : n > BigInt(policy.approvalAbove)
        ? "require_approval"
        : "approve";
    if (decision === "approve") {
      await tx.nonce.create({ data: { key: nonceKey } });
      for (const key of keys)
        await tx.spend.upsert({
          where: { key },
          create: { key, amount: a.amount },
          update: { amount: { increment: a.amount } },
        });
    }
    const row = await tx.payment.create({
      data: {
        agentId: e.agentId,
        amount: a.amount,
        decision,
        risk: rules.length ? 95 : decision === "approve" ? 0 : 55,
        rules,
        envelope: JSON.parse(JSON.stringify(e)),
      },
    });
    return {
      ...row,
      explanation: rules.length
        ? rules.join(", ")
        : decision === "approve"
          ? "All policies passed. Mock authorization only; no settlement."
          : "Manual approval required; wallet has not signed.",
    };
  });
}
