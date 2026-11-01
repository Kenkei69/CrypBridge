import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { decodePaymentRequiredHeader } from "@x402/core/http";
const origin = process.env.SIMULATION_BASE_URL || "http://127.0.0.1:3001";
const cookies = new Map<string, string>();
async function api(path: string, body?: unknown, expected = 200) {
  const r = await fetch(origin + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: [...cookies].map(([k, v]) => k + "=" + v).join("; "),
      ...(process.env.ADMIN_TOKEN
        ? { Authorization: "Bearer " + process.env.ADMIN_TOKEN }
        : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  for (const line of r.headers.getSetCookie()) {
    const item = line.split(";")[0],
      at = item.indexOf("=");
    cookies.set(item.slice(0, at), item.slice(at + 1));
  }
  const data = await r.json();
  if (r.status !== expected)
    throw new Error(
      `${path}: HTTP ${r.status}: ${data.error || "request failed"}`,
    );
  return { data, headers: r.headers };
}
const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error("Acceptance failed: " + message);
};
assert(
  (await api("/api/runtime")).data.mode === "simulation",
  "Verifier refuses to operate against testnet mode",
);
await api("/api/session", { workspace: "red" });
const suite = (await api("/api/lab/suite", { seed: "acceptance-3.1.0" })).data;
const armed = (
  await api("/api/lab/attacks", {
    category: "overpayment",
    config: { attemptedAmount: "100000000" },
    targetKind: "next",
    arm: true,
  })
).data;
await api("/api/session", { workspace: "blue" });
const before = (await api("/api/lab/balance")).data;
const merchant = await api(
  "/api/lab/merchant/ai-security-report",
  undefined,
  402,
);
assert(
  decodePaymentRequiredHeader(merchant.headers.get("PAYMENT-REQUIRED")!)
    .x402Version === 2,
  "Actual HTTP 402 has a V2 SDK-decodable header",
);
const c = (await api("/api/lab/conversations", { clientKey: randomUUID() }))
  .data;
const discovered = (
  await api(`/api/lab/conversations/${c.id}/messages`, {
    clientKey: randomUUID(),
    text: "Buy me a research report about AI security for 1 USDC.",
  })
).data;
const products = discovered.messages.find((m: any) => m.type === "PRODUCTS");
const selected = (
  await api(`/api/lab/conversations/${c.id}/select`, {
    clientKey: randomUUID(),
    messageId: products.id,
    productId: "ai-security-report",
  })
).data;
const method = selected.messages.find((m: any) => m.type === "PAYMENT_METHOD");
const receipt = (
  await api(`/api/lab/conversations/${c.id}/method`, {
    clientKey: randomUUID(),
    messageId: method.id,
    method: "base-sepolia-usdc",
  })
).data;
const blocked = (
  await api(`/api/lab/purchases/${receipt.purchases[0].id}/approve`, {
    approve: true,
  })
).data;
assert(
  blocked.state === "BLOCKED" &&
    blocked.signings.length === 0 &&
    blocked.transactions.length === 0,
  "100 USDC overpayment blocked before signing or settlement",
);
assert(
  blocked.authorization.amount === "1000000" &&
    blocked.attempts[0].modified.requirements.accepts[0].amount === "100000000",
  "Trusted 1 USDC approval remains immutable",
);
assert(
  (await api("/api/lab/balance")).data.usdcAtomic === before.usdcAtomic,
  "Blocked payment leaves virtual wallet unchanged",
);
const normal = (
  await api("/api/lab/purchases", {
    productId: "ai-security-report",
    clientKey: randomUUID(),
    prompt: "Buy the research report for 1 USDC.",
  })
).data;
const paid = (
  await api(`/api/lab/purchases/${normal.id}/approve`, { approve: true })
).data;
assert(
  paid.state === "COMPLETED" && paid.transactions.length === 1,
  "Subsequent legitimate purchase executes exactly once",
);
const after = (await api("/api/lab/balance")).data;
assert(
  BigInt(before.usdcAtomic) - BigInt(after.usdcAtomic) === 1000000n,
  "Authoritative ledger debits exactly 1 simulated USDC",
);
await api("/api/session", { workspace: "red" });
const baseline = (
  await api("/api/lab/runs", {
    category: "wrong-recipient",
    seed: "acceptance-vulnerable-3.1",
    target: "baseline",
    config: {},
  })
).data;
const trace = (await api("/api/lab/environments/" + baseline.environmentId))
  .data;
assert(
  baseline.result.objectiveAchieved && trace.flows.length === 4,
  "Separate vulnerable baseline creates an auditable unauthorized transfer plus three traced test movements",
);
const original = suite.runs.find((r: any) => r.category === "overpayment");
const replay = (await api("/api/lab/runs/" + original.id + "/replay", {})).data;
assert(
  replay.equivalent,
  "Persisted scenario replays with equivalent semantics",
);
const exported = (await api("/api/lab/runs/" + original.id + "/export")).data;
const baselineExport = (await api("/api/lab/runs/" + baseline.id + "/export"))
  .data;
await api("/api/session", { workspace: "blue" });
const custodian = trace.wallets.find((w: any) => w.role === "custodian");
const exchange = (
  await api("/api/lab/exchange", {
    environmentId: trace.environment.id,
    incidentId: trace.incidents[0].id,
    destination: custodian.address,
    supportingDocumentation: true,
  })
).data;
assert(
  exchange.status === "HOLD_APPROVED" &&
    exchange.response.simulation &&
    exchange.response.realExchangeAction === false,
  "Exchange action remains explicitly virtual",
);
const status = (await api("/api/lab/status")).data;
const verification = {
  checkedAt: new Date().toISOString(),
  simulation: true,
  publicNetworkSubmission: false,
  engineVersion: status.engineVersion,
  ruleVersion: status.ruleVersion,
  armedAttackId: armed.id,
  environmentId: status.environmentId,
  merchantHttpStatus: 402,
  overpayment: {
    purchaseId: blocked.id,
    approvedAtomic: blocked.authorization.amount,
    attemptedAtomic:
      blocked.attempts[0].modified.requirements.accepts[0].amount,
    signatureCount: blocked.signings.length,
    transactionCount: blocked.transactions.length,
    incidentId: blocked.incidents[0].id,
    tailIntegrity: blocked.events.at(-1).integrity,
  },
  legitimatePurchase: {
    purchaseId: paid.id,
    state: paid.state,
    simulationTransactionReference: paid.transactions[0].reference,
    buyerBeforeAtomic: before.usdcAtomic,
    buyerAfterAtomic: after.usdcAtomic,
    settlementCount: paid.settlements.length,
  },
  suite: suite.runs.map((r: any) => ({
    id: r.id,
    category: r.category,
    seed: r.seed,
    semanticDigest: r.semanticDigest,
    result: r.result,
  })),
  replay: {
    id: replay.id,
    equivalent: replay.equivalent,
    semanticDigest: replay.semanticDigest,
  },
  vulnerableBaseline: {
    runId: baseline.id,
    environmentId: baseline.environmentId,
    objectiveAchieved: baseline.result.objectiveAchieved,
    virtualTransactionCount: trace.transactions.length,
    flowEdgeCount: trace.flows.length,
    custodianBalanceAtomic: custodian.usdcAtomic,
  },
  simulatedExchange: {
    id: exchange.id,
    status: exchange.status,
    simulation: exchange.response.simulation,
    realExchangeAction: exchange.response.realExchangeAction,
  },
};
await mkdir("artifacts/simulation", { recursive: true });
await writeFile(
  "artifacts/simulation/acceptance-verification.json",
  JSON.stringify(verification, null, 2) + "\n",
);
await writeFile(
  "artifacts/simulation/blocked-payment-evidence.json",
  JSON.stringify(blocked, null, 2) + "\n",
);
await writeFile(
  "artifacts/simulation/legitimate-payment-evidence.json",
  JSON.stringify(paid, null, 2) + "\n",
);
await writeFile(
  "artifacts/simulation/suite-overpayment-evidence.json",
  JSON.stringify(exported, null, 2) + "\n",
);
await writeFile(
  "artifacts/simulation/baseline-evidence.json",
  JSON.stringify(baselineExport, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      simulation: true,
      engine: status.engineVersion,
      coreSuiteRuns: suite.runs.length,
      overpaymentBlocked: blocked.state === "BLOCKED",
      legitimatePayment: paid.state,
      replayEquivalent: replay.equivalent,
      baselineVirtualTransfers: trace.transactions.length,
      realExchangeAction: false,
      evidence: "artifacts/simulation/acceptance-verification.json",
    },
    null,
    2,
  ),
);
