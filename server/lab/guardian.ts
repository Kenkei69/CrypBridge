import { PaymentRequiredV2Schema } from "@x402/core/schemas";
import { ASSET, NETWORK, RULES, digest, json } from "./core";
export type Rule = {
  ruleId: string;
  version: string;
  status: "PASS" | "FAIL" | "NOT_APPLICABLE";
  evaluated: any;
  expected: any;
  explanation: string;
  evidenceRef: string;
};
export type Context = {
  authorization: any;
  trusted: any;
  input: any;
  clock: number;
  settled: boolean;
  nonceUsed: boolean;
  taskSpent: bigint;
  dailySpent: bigint;
  taskBudget: string;
  dailyLimit: string;
  authorizationReserved?: boolean;
  previousBinding?: string;
};
export function evaluateRules(c: Context) {
  const rules: Rule[] = [];
  const a = c.authorization,
    r = c.input?.requirements?.accepts?.[0],
    p = c.trusted;
  const add = (
    id: string,
    pass: boolean,
    evaluated: any,
    expected: any,
    explanation: string,
    applicable = true,
  ) =>
    rules.push({
      ruleId: id,
      version: RULES,
      status: !applicable ? "NOT_APPLICABLE" : pass ? "PASS" : "FAIL",
      evaluated: json(evaluated ?? null),
      expected: json(expected ?? null),
      explanation,
      evidenceRef: `authorization:${a?.digest || "missing"};request:${digest(c.input)}`,
    });
  const valid =
    !!r &&
    typeof r.amount === "string" &&
    /^[1-9][0-9]{0,77}$/.test(r.amount) &&
    BigInt(r.amount) < 2n ** 256n;
  const amount = valid ? BigInt(r.amount) : 0n;
  add(
    "X402_V2_STRUCTURE",
    PaymentRequiredV2Schema.safeParse(c.input?.requirements).success &&
      c.input.requirements.accepts.length === 1,
    c.input?.requirements?.x402Version,
    2,
    "Exactly one valid V2 payment option is supported.",
  );
  add(
    "AUTHORIZED_MERCHANT",
    !!a &&
      a.merchantId === p.merchantId &&
      c.input?.merchantId === a.merchantId,
    c.input?.merchantId,
    a?.merchantId,
    "Merchant identity is bound to the trusted approval, not merchant text.",
  );
  add(
    "AUTHORIZED_RECIPIENT",
    typeof r?.payTo === "string" &&
      r.payTo.toLowerCase() === a?.recipient?.toLowerCase(),
    r?.payTo,
    a?.recipient,
    "payTo must exactly match the approved recipient.",
  );
  add(
    "APPROVED_AMOUNT",
    valid && r.amount === a?.amount && amount <= BigInt(a?.amount || 0),
    r?.amount,
    a?.amount,
    "Exact atomic units must match the user-approved payment.",
  );
  add(
    "TOKEN_CONTRACT",
    typeof r?.asset === "string" &&
      r.asset.toLowerCase() === ASSET.toLowerCase() &&
      r.asset.toLowerCase() === a?.asset?.toLowerCase(),
    r?.asset,
    a?.asset,
    "The contract address identifies USDC; display names cannot authorize another asset.",
  );
  add(
    "AUTHORIZED_NETWORK",
    r?.network === NETWORK && r.network === a?.network,
    r?.network,
    a?.network,
    "Network and signer domain must be the authorized Base Sepolia model.",
  );
  add(
    "PAYMENT_SCHEME",
    r?.scheme === "exact" && r.scheme === a?.scheme,
    r?.scheme,
    "exact",
    "Only the EIP-3009 exact scheme is supported.",
  );
  add(
    "RESOURCE_IDENTITY",
    c.input?.requirements?.resource?.url === a?.resource &&
      c.input?.productId === a?.productId,
    {
      resource: c.input?.requirements?.resource?.url,
      productId: c.input?.productId,
    },
    { resource: a?.resource, productId: a?.productId },
    "Resource identity comes from the trusted catalog selection.",
  );
  add(
    "AUTHORIZATION_EXPIRY",
    !!a &&
      a.status === "ACTIVE" &&
      a.createdAt <= c.clock &&
      a.expiresAt > c.clock &&
      Number.isInteger(r?.maxTimeoutSeconds) &&
      r.maxTimeoutSeconds > 0 &&
      r.maxTimeoutSeconds <= 300,
    {
      clock: c.clock,
      expiresAt: a?.expiresAt,
      status: a?.status,
      maxTimeoutSeconds: r?.maxTimeoutSeconds,
    },
    "Active approval and positive supported validity window",
    "The user authorization must be active and unexpired on the virtual clock.",
  );
  add(
    "AUTHORIZATION_SINGLE_USE",
    !c.authorizationReserved,
    !!c.authorizationReserved,
    false,
    "A signed or pending authorization cannot issue another signature.",
  );
  add(
    "NONCE_REPLAY",
    !c.nonceUsed,
    c.nonceUsed,
    false,
    "An EIP-3009 authorization nonce can be consumed only once.",
  );
  add(
    "PURCHASE_IDEMPOTENCY",
    !c.settled,
    c.settled,
    false,
    "A settled purchase cannot authorize another settlement.",
  );
  add(
    "TASK_BUDGET",
    valid && c.taskSpent + amount <= BigInt(c.taskBudget),
    { spent: c.taskSpent.toString(), requested: amount.toString() },
    c.taskBudget,
    "Completed and atomically reserved payments cannot exceed the task budget.",
  );
  add(
    "DAILY_BUDGET",
    valid && c.dailySpent + amount <= BigInt(c.dailyLimit),
    { spent: c.dailySpent.toString(), requested: amount.toString() },
    c.dailyLimit,
    "Cumulative wallet spending must remain within the virtual-day limit.",
  );
  add(
    "CONTRACT_PERMISSION",
    (!c.input?.operation || c.input.operation.kind === "eip3009") &&
      (r?.extra?.assetTransferMethod ?? "eip3009") === "eip3009",
    (r?.extra?.assetTransferMethod ?? "eip3009") !== "eip3009"
      ? r?.extra?.assetTransferMethod
      : c.input?.operation?.kind || "eip3009",
    "eip3009",
    "ERC-20 approvals, Permit and arbitrary calls require separate explicit authority.",
  );
  add(
    "SIGNING_PAYLOAD_INTEGRITY",
    !c.previousBinding || digest(c.input) === c.previousBinding,
    digest(c.input),
    c.previousBinding || digest(c.input),
    "The final signing payload must match the exact Guardian-approved serialization.",
  );
  add(
    "UNTRUSTED_CONTENT_AUTHORITY",
    true,
    {
      merchantContentPresent: !!c.input?.merchantContent,
      additionalAuthorityGranted: false,
    },
    false,
    "Merchant prose is isolated data. Ignored prompt injection does not block a valid purchase.",
    !!c.input?.merchantContent,
  );
  const failed = rules.filter((r) => r.status === "FAIL");
  return {
    decision: failed.length ? ("BLOCK" as const) : ("ALLOW" as const),
    rules,
    binding: digest(c.input),
    failed: failed.map((r) => r.ruleId),
  };
}
