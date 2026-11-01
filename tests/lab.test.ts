import * as labCore from "../server/lab/core";
import {
  encodePaymentSignatureHeader,
  decodePaymentRequiredHeader,
  decodePaymentResponseHeader,
} from "@x402/core/http";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import request from "supertest";
import fc from "fast-check";
import { app } from "../server/index";
import { db } from "../server/config";
import {
  Scope,
  seedCatalog,
  createEnvironment,
  initialDefaults,
  locked,
  amount,
  emit,
  digest,
  ENGINE,
} from "../server/lab/core";
import {
  runScenario,
  exportEnvironment,
  replay,
  controlledMove,
  exchangeCase,
  semanticState,
} from "../server/lab/runner";
import {
  createPurchase,
  authorize,
  processPurchase,
  approveAndExecute,
  reconcile,
  createAttack,
  inspectPurchase,
} from "../server/lab/engine";
import { snapshot, restore } from "../server/lab/snapshots";
import { index, mine, reorg } from "../server/lab/chain";
import { evaluateRules } from "../server/lab/guardian";
import { verifyPayload } from "../server/lab/signer";
import { categories, validateConfig } from "../server/lab/scenarios";
process.env.CRYPBRIDGE_MODE = "simulation";
const scope: Scope = {
  userId: "lab-test-user",
  sandboxId: "lab-suite-isolation",
};
const runs = new Map<string, any>();
async function run(category: any, config: any = {}) {
  const r = await runScenario(
    scope,
    category,
    "security-suite:" + category,
    config,
  );
  runs.set(category, r);
  return r;
}
async function record(r: any) {
  return exportEnvironment(scope, r.environmentId);
}
beforeAll(async () => {
  await seedCatalog();
}, 30000);
afterAll(() => db.$disconnect());
describe("persisted simulation security invariants", () => {
  it("legitimate exact x402 payment cryptographically verifies, settles once, produces coherent receipt/logs and balances", async () => {
    const r = await run("normal"),
      s = await record(r);
    expect(r.result.settlementCount).toBe(1);
    expect(s.transactions).toHaveLength(1);
    expect(s.logs).toHaveLength(1);
    expect(s.executions).toHaveLength(1);
    expect(s.wallets.find((w: any) => w.role === "buyer").usdcAtomic).toBe(
      "49000000",
    );
    expect(s.wallets.find((w: any) => w.role === "merchant").usdcAtomic).toBe(
      "1000000",
    );
    expect(s.wallets.find((w: any) => w.role === "facilitator").ethWei).toBe(
      (1000000000000000000n - 65000n * 1000000000n).toString(),
    );
    expect(
      (
        await verifyPayload(
          s.signings[0].payload,
          s.wallets.find((w: any) => w.role === "buyer").address,
          s.environment.clock,
        )
      ).isValid,
    ).toBe(true);
    expect(s.transactions[0].reference).toMatch(/^simtx:/);
    expect(
      s.settlements[0].response.extensions.simulation.referenceKind,
    ).toContain("SIMULATION_IDENTIFIER");
  }, 30000);
  it.each([
    ["overpayment", "APPROVED_AMOUNT"],
    ["wrong-recipient", "AUTHORIZED_RECIPIENT"],
    ["wrong-network", "AUTHORIZED_NETWORK"],
    ["fake-token", "TOKEN_CONTRACT"],
    ["token-approval", "CONTRACT_PERMISSION"],
    ["unsupported-scheme", "PAYMENT_SCHEME"],
    ["resource-substitution", "RESOURCE_IDENTITY"],
    ["expired", "AUTHORIZATION_EXPIRY"],
  ])(
    "blocks %s before signing or settlement",
    async (category, rule) => {
      const r = await run(
          category,
          category === "overpayment" ? { attemptedAmount: "100000000" } : {},
        ),
        s = await record(r);
      expect(r.result.failedRules).toContain(rule);
      expect(s.signings).toHaveLength(0);
      expect(s.transactions).toHaveLength(0);
      expect(s.settlements).toHaveLength(0);
      expect(s.wallets.find((w: any) => w.role === "buyer").usdcAtomic).toBe(
        "50000000",
      );
      expect(s.incidents.length).toBeGreaterThan(0);
    },
    30000,
  );
  it("a non-malicious configured attack is allowed rather than forcing a hardcoded blocked result", async () => {
    const r = await runScenario(
      scope,
      "overpayment",
      "ineffective-overpayment",
      { attemptedAmount: "1000000" },
    );
    expect(r.result.legitimatePaymentSuccess).toBe(true);
    expect(r.result.objectiveAchieved).toBe(false);
    expect(r.result.blockedAttempts).toBe(0);
  }, 30000);
  it("checksum variants of the approved recipient remain one EVM wallet and credit the merchant", async () => {
    const e = await createEnvironment(
      scope,
      "address-case-normalization",
      "REGRESSION",
    );
    const p = await createPurchase(
      scope,
      e.id,
      "ai-security-report",
      "case-alias",
      "Case-variant recipient fixture",
    );
    await authorize(scope, p.id, true);
    const merchant = await db.labWallet.findUniqueOrThrow({
      where: { environmentId_role: { environmentId: e.id, role: "merchant" } },
    });
    const attack = await createAttack(
      scope,
      e.id,
      "wrong-recipient",
      { recipient: merchant.address.toLowerCase() },
      "fixture",
    );
    await processPurchase(scope, p.id, "case-alias", attack.id);
    const s = await exportEnvironment(scope, e.id);
    expect(s.purchases[0].state).toBe("COMPLETED");
    expect(s.wallets).toHaveLength(6);
    expect(s.wallets.find((w: any) => w.role === "merchant").usdcAtomic).toBe(
      "1000000",
    );
    expect(s.transactions[0].tokenRecipient).toBe(merchant.address);
  }, 30000);
  it("ignores merchant prompt instructions while allowing the legitimate purchase", async () => {
    const r = await run("prompt-injection");
    expect(r.result.objectiveAchieved).toBe(false);
    expect(r.result.legitimatePaymentSuccess).toBe(true);
    expect(r.result.falsePositive).toBe(false);
    const s = await record(r);
    expect(s.authorizations).toHaveLength(1);
    expect(s.transactions[0].tokenAmount).toBe("1000000");
  }, 30000);
  it("duplicate request fails application idempotency and never settles twice", async () => {
    const r = await run("duplicate"),
      s = await record(r);
    expect(s.transactions).toHaveLength(1);
    expect(s.signings).toHaveLength(1);
    expect(r.result.failedRules).toContain("PURCHASE_IDEMPOTENCY");
    expect(r.result.metrics.unauthorizedSettlements).toBe(0);
  }, 30000);
  it("micro-payment draining cannot exceed the cumulative task authorization", async () => {
    const r = await run("micro-drain", { count: 12 }),
      s = await record(r);
    expect(
      s.transactions.filter((t: any) => t.status === "SUCCESS"),
    ).toHaveLength(10);
    expect(
      s.transactions.reduce(
        (n: bigint, t: any) => n + BigInt(t.tokenAmount),
        0n,
      ),
    ).toBe(1000000n);
    expect(r.result.failedRules).toContain("TASK_BUDGET");
    expect(s.wallets.find((w: any) => w.role === "buyer").usdcAtomic).toBe(
      "49000000",
    );
  }, 60000);
  it("TOCTOU passes initial Guardian but final independent signer rejects the changed payload", async () => {
    const r = await run("toctou"),
      s = await record(r);
    expect(s.decisions[0].decision).toBe("ALLOW");
    expect(s.decisions.at(-1).decision).toBe("BLOCK");
    expect(r.result.failedRules).toContain("SIGNING_PAYLOAD_INTEGRITY");
    expect(s.signings).toHaveLength(0);
    expect(s.transactions).toHaveLength(0);
  }, 30000);
  it("concurrent requests cannot consume a purchase or authorization more than once", async () => {
    const r = await run("race", { count: 8 }),
      s = await record(r);
    expect(s.transactions).toHaveLength(1);
    expect(s.signings).toHaveLength(1);
    expect(s.attempts).toHaveLength(8);
    expect(s.attempts.filter((a: any) => a.state === "BLOCKED")).toHaveLength(
      7,
    );
    expect(s.wallets.find((w: any) => w.role === "buyer").usdcAtomic).toBe(
      "49000000",
    );
  }, 60000);
  it.each([
    "invalid-signature",
    "insufficient-balance",
    "insufficient-gas",
    "facilitator-rejection",
  ])(
    "%s prevents settlement without fabricating a transaction",
    async (category) => {
      const r = await run(category),
        s = await record(r);
      expect(s.transactions).toHaveLength(0);
      expect(s.settlements).toHaveLength(0);
      expect(s.purchases[0].state).toBe("FAILED");
      expect(s.attempts[0].verification.isValid).toBe(false);
    },
    30000,
  );
  it("a reverted settlement charges virtual gas but never credits merchant or emits a Transfer", async () => {
    const r = await run("settlement-failure"),
      s = await record(r);
    expect(s.transactions[0].status).toBe("FAILED");
    expect(s.transactions[0].tokenAmount).toBe("0");
    expect(s.settlements[0].state).toBe("FAILED");
    expect(s.logs).toHaveLength(0);
    expect(s.wallets.find((w: any) => w.role === "buyer").usdcAtomic).toBe(
      "50000000",
    );
    expect(s.wallets.find((w: any) => w.role === "merchant").usdcAtomic).toBe(
      "0",
    );
  }, 30000);
  it("uncertain facilitator timeout remains pending and reconciles the same persisted signature", async () => {
    const r = await run("facilitator-timeout"),
      s = await record(r);
    expect(s.purchases[0].state).toBe("PENDING");
    expect(s.decisions.some((d: any) => d.decision === "REVIEW")).toBe(true);
    expect(s.transactions).toHaveLength(0);
    await reconcile(scope, s.purchases[0].id);
    await reconcile(scope, s.purchases[0].id);
    const after = await record(r);
    expect(after.transactions).toHaveLength(1);
    expect(after.signings).toHaveLength(1);
    expect(after.purchases[0].state).toBe("COMPLETED");
  }, 30000);
  it("missed indexing recovers from persisted virtual logs without duplicate edges", async () => {
    const r = await run("rpc-failure"),
      s = await record(r);
    expect(
      s.events.some((e: any) => e.type === "INDEXER_SIMULATED_FAILURE"),
    ).toBe(true);
    expect(s.flows).toHaveLength(1);
    await locked(r.environmentId, (tx) => index(tx, r.environmentId));
    await db.$disconnect();
    const after = await record(r);
    expect(after.flows).toHaveLength(1);
    expect(after.checkpoint.blockNumber).toBe(1);
  }, 30000);
  it("virtual reorganization reverses journal effects and removes canonical graph edges", async () => {
    const r = await run("chain-reorganization"),
      s = await record(r);
    expect(s.transactions[0].status).toBe("REORGANIZED");
    expect(s.transactions[0].confirmations).toBe(0);
    expect(s.wallets.find((w: any) => w.role === "buyer").usdcAtomic).toBe(
      "50000000",
    );
    expect(s.wallets.find((w: any) => w.role === "merchant").usdcAtomic).toBe(
      "0",
    );
    expect(s.flows).toHaveLength(0);
    expect(s.purchases[0].state).toBe("REVIEW");
  }, 30000);
  it("pending signatures reserve task and daily budgets and cannot sign twice", async () => {
    const r = await runScenario(
      scope,
      "facilitator-timeout",
      "pending-reservation",
    );
    const s = await record(r);
    await processPurchase(scope, s.purchases[0].id, "forged-retry");
    const after = await record(r);
    expect(after.signings).toHaveLength(1);
    expect(
      after.rules.some(
        (rule: any) =>
          rule.ruleId === "AUTHORIZATION_SINGLE_USE" && rule.status === "FAIL",
      ),
    ).toBe(true);
    const pendingTask = s.tasks[0];
    const next = await createPurchase(
      scope,
      r.environmentId,
      "ai-security-report",
      "pending-budget-child",
      "Second fixture installment",
      { taskId: pendingTask.id },
    );
    await authorize(scope, next.id, true);
    await processPurchase(scope, next.id);
    expect((await inspectPurchase(scope, next.id)).state).toBe("BLOCKED");
  }, 30000);
  it("concurrent distinct approved purchases atomically share one cumulative task budget", async () => {
    const e = await createEnvironment(
      scope,
      "shared-concurrent-budget",
      "REGRESSION",
    );
    const first = await createPurchase(
      scope,
      e.id,
      "micro-security-brief",
      "shared-first",
      "Shared-budget fixture",
      { budget: "300000" },
    );
    const purchases = [first];
    for (let n = 1; n < 6; n++)
      purchases.push(
        await createPurchase(
          scope,
          e.id,
          "micro-security-brief",
          "shared-" + n,
          "Authorized fixture installment",
          { taskId: first.taskId },
        ),
      );
    for (const p of purchases) await authorize(scope, p.id, true);
    await Promise.all(purchases.map((p) => processPurchase(scope, p.id)));
    const s = await exportEnvironment(scope, e.id);
    expect(
      s.transactions.filter((t: any) => t.status === "SUCCESS"),
    ).toHaveLength(3);
    expect(s.wallets.find((w: any) => w.role === "buyer").usdcAtomic).toBe(
      "49700000",
    );
    expect(
      s.rules.some(
        (r: any) => r.ruleId === "TASK_BUDGET" && r.status === "FAIL",
      ),
    ).toBe(true);
  }, 60000);
  it("independent task approvals cannot exceed the daily budget", async () => {
    const e = await createEnvironment(scope, "daily-budget", "REGRESSION", {
      ...initialDefaults,
      dailyLimit: "1000000",
    });
    for (let n = 0; n < 2; n++) {
      const p = await createPurchase(
        scope,
        e.id,
        "ai-security-report",
        "daily-" + n,
        "Daily budget fixture",
      );
      await authorize(scope, p.id, true);
      await processPurchase(scope, p.id);
    }
    const s = await exportEnvironment(scope, e.id);
    expect(s.transactions).toHaveLength(1);
    expect(
      s.rules.some(
        (r: any) => r.ruleId === "DAILY_BUDGET" && r.status === "FAIL",
      ),
    ).toBe(true);
  }, 30000);
  it("unexpected execution failure rolls back financial state and persists a FAILED attack trace", async () => {
    const e = await createEnvironment(
      scope,
      "controlled-execution-fault",
      "REGRESSION",
    );
    const p = await createPurchase(
      scope,
      e.id,
      "ai-security-report",
      "fault-case",
      "Controlled fault fixture",
    );
    await authorize(scope, p.id, true);
    const attack = await createAttack(
      scope,
      e.id,
      "overpayment",
      { attemptedAmount: "100000000" },
      "fixture",
    );
    const original = labCore.emit;
    const spy = vi
      .spyOn(labCore, "emit")
      .mockImplementation(async (...args: Parameters<typeof labCore.emit>) => {
        if (args[2] === "GUARDIAN_EVALUATION_STARTED")
          throw new Error("Injected execution fault");
        return original(...args);
      });
    try {
      await expect(
        processPurchase(scope, p.id, "fault-case", attack.id),
      ).rejects.toThrow("Injected execution fault");
    } finally {
      spy.mockRestore();
    }
    const s = await exportEnvironment(scope, e.id);
    expect(s.attacks[0].status).toBe("FAILED");
    expect(s.purchases[0].state).toBe("FAILED");
    expect(s.attempts[0].state).toBe("FAILED");
    expect(
      s.events.some(
        (event: any) => event.type === "SIMULATION_EXECUTION_FAILED",
      ),
    ).toBe(true);
    expect(s.signings).toHaveLength(0);
    expect(s.transactions).toHaveLength(0);
    expect(s.wallets.find((w: any) => w.role === "buyer").usdcAtomic).toBe(
      "50000000",
    );
  }, 30000);
  it("wallet projections equal the authoritative journal and never go negative", async () => {
    for (const r of runs.values()) {
      const s = await record(r);
      for (const wallet of s.wallets) {
        const sum = s.ledger
          .filter((e: any) => e.walletId === wallet.id && e.asset === "USDC")
          .reduce((n: bigint, e: any) => n + BigInt(e.delta), 0n);
        expect(sum.toString()).toBe(wallet.usdcAtomic);
        expect(sum >= 0n).toBe(true);
      }
      expect(
        s.wallets.reduce((n: bigint, w: any) => n + BigInt(w.usdcAtomic), 0n),
      ).toBe(BigInt(s.environment.initial.buyerUsdc));
    }
  }, 30000);
  it("evidence survives reconnect and its ordered integrity chain verifies", async () => {
    const r = runs.get("overpayment");
    await db.$disconnect();
    const s = await record(r);
    let previous = "genesis";
    for (const e of s.events) {
      const ordinal =
        s.purchases.find((p: any) => p.id === e.purchaseId)?.ordinal || null;
      expect(e.previousHash).toBe(previous);
      expect(e.integrity).toBe(
        digest({
          previousHash: previous,
          sequence: e.sequence,
          timestamp: e.timestamp,
          type: e.type,
          actor: e.actor,
          purchaseOrdinal: ordinal,
          metadata: e.metadata,
        }),
      );
      previous = e.integrity;
    }
    expect(previous).toBe(s.environment.eventHash);
    expect(s.events.length).toBeGreaterThan(5);
  }, 30000);
  it("deterministic replay produces equivalent input, rule, wallet and transaction semantics", async () => {
    for (const category of [
      "normal",
      "overpayment",
      "toctou",
      "prompt-injection",
      "race",
    ]) {
      const r = runs.get(category);
      const replayed = await replay(scope, r.id);
      expect(replayed.equivalent, category).toBe(true);
    }
  }, 60000);
  it("trusted approvals and append-only ledger/audit evidence cannot be edited", async () => {
    const s = await record(runs.get("normal"));
    await expect(
      db.labAuthorization.update({
        where: { id: s.authorizations[0].id },
        data: { amount: "100000000" },
      }),
    ).rejects.toThrow("immutable");
    await expect(
      db.labPurchase.update({
        where: { id: s.purchases[0].id },
        data: { trusted: { amount: "100000000" } },
      }),
    ).rejects.toThrow("immutable");
    await expect(
      db.labEvent.delete({ where: { id: s.events[0].id } }),
    ).rejects.toThrow("append-only");
    await expect(
      db.labLedger.update({
        where: { id: s.ledger[0].id },
        data: { delta: "999" },
      }),
    ).rejects.toThrow("append-only");
  }, 30000);
  it("a blocked attempt does not poison a later legitimate purchase in the same environment", async () => {
    const r = runs.get("overpayment");
    const p = await createPurchase(
      scope,
      r.environmentId,
      "ai-security-report",
      "legitimate-after-attack",
      "Legitimate report request",
    );
    await authorize(scope, p.id, true);
    await processPurchase(scope, p.id);
    expect((await inspectPurchase(scope, p.id)).state).toBe("COMPLETED");
  }, 30000);
  it("isolated vulnerable baseline settles the malicious payment and tracing exactly matches virtual events", async () => {
    const r = await runScenario(
      scope,
      "wrong-recipient",
      "deliberately-vulnerable",
      {},
      "baseline",
    );
    runs.set("baseline", r);
    const s = await record(r);
    expect(r.result.objectiveAchieved).toBe(true);
    expect(r.result.metrics.unauthorizedSettlements).toBe(1);
    expect(s.transactions).toHaveLength(4);
    expect(s.flows).toHaveLength(4);
    for (const edge of s.flows) {
      const log = s.logs.find((l: any) => l.id === edge.logId);
      expect(log.decoded.amount).toBe(edge.amount);
      expect(log.decoded.sender).toBe(edge.sender);
    }
    expect(s.wallets.find((w: any) => w.role === "custodian").usdcAtomic).toBe(
      "1000000",
    );
    expect(s.incidents[0].classification).toBe(
      "UNAUTHORIZED_BASELINE_TRANSFER",
    );
    await expect(
      controlledMove(
        scope,
        runs.get("normal").environmentId,
        "attacker",
        "relay",
        "1",
      ),
    ).rejects.toThrow("baseline");
  }, 60000);
  it("exchange review produces explicitly simulated holds with evidence-driven statuses", async () => {
    const r = runs.get("baseline"),
      s = await record(r),
      custodian = s.wallets.find((w: any) => w.role === "custodian");
    const pending = await exchangeCase(
      scope,
      r.environmentId,
      s.incidents[0].id,
      custodian.address,
      false,
    );
    expect(pending.status).toBe("ADDITIONAL_EVIDENCE_REQUIRED");
    const approved = await exchangeCase(
      scope,
      r.environmentId,
      s.incidents[0].id,
      custodian.address,
      true,
    );
    expect(approved.status).toBe("HOLD_APPROVED");
    expect((approved.response as any).simulation).toBe(true);
    expect((approved.response as any).realExchangeAction).toBe(false);
    await expect(
      controlledMove(scope, r.environmentId, "custodian", "relay", "1"),
    ).rejects.toThrow("holds");
  }, 30000);
  it("full snapshots restore a separate consistent ledger, preserving the original evidence", async () => {
    const r = runs.get("normal");
    const s = await snapshot(scope, r.environmentId, "restart checkpoint");
    const restored = await restore(scope, s.id, false);
    const before = await record(r),
      after = await exportEnvironment(scope, restored.id);
    expect(after.environment.id).not.toBe(before.environment.id);
    expect(after.wallets.map((w: any) => w.usdcAtomic)).toEqual(
      before.wallets.map((w: any) => w.usdcAtomic),
    );
    expect(after.transactions).toHaveLength(before.transactions.length);
    expect(after.signings).toHaveLength(before.signings.length);
    await expect(
      restore(
        scope,
        (
          await snapshot(
            scope,
            runs.get("baseline").environmentId,
            "unsafe fork",
          )
        ).id,
        true,
      ),
    ).rejects.toThrow("cannot replace");
  }, 30000);
  it("explicit block production advances confirmations, not frontend timers", async () => {
    const r = runs.get("normal");
    const before = await record(r);
    await locked(r.environmentId, async (tx) => {
      await mine(tx, r.environmentId);
      await mine(tx, r.environmentId);
    });
    const s = await record(r);
    expect(s.transactions[0].confirmations).toBe(
      before.transactions[0].confirmations + 2,
    );
    await locked(r.environmentId, (tx) => reorg(tx, r.environmentId));
    const reduced = await record(r);
    expect(reduced.transactions[0].confirmations).toBe(
      s.transactions[0].confirmations - 1,
    );
    expect(reduced.executions[0].receipt.confirmations).toBe(
      reduced.transactions[0].confirmations,
    );
  }, 30000);
});
describe("team permissions, protocol transport and replay cursors", () => {
  it("Blue and Red routes enforce role and sandbox ownership; live submission is disabled", async () => {
    const agent = request.agent(app);
    await agent.post("/api/session").send({ workspace: "red" }).expect(200);
    const state = (await agent.get("/api/lab/state")).body;
    await agent
      .post("/api/lab/purchases")
      .send({
        productId: "ai-security-report",
        clientKey: "red-forgery",
        prompt: "Buy report",
      })
      .expect(403);
    await agent.post("/api/live/intents").send({}).expect(423);
    await agent.get("/merchant/report").expect(423);
    await agent
      .get("/api/lab/environments/" + runs.get("normal").environmentId)
      .expect(404);
    await agent.post("/api/session").send({ workspace: "blue" }).expect(200);
    await agent
      .post("/api/lab/attacks")
      .send({ category: "overpayment", config: {} })
      .expect(403);
    const merchant = await agent.get("/api/lab/merchant/ai-security-report");
    expect(merchant.status).toBe(402);
    expect(merchant.headers["payment-required"]).toBeTruthy();
    expect(merchant.body.simulation).toBe(true);
  }, 30000);
  it("SDK HTTP 402, PAYMENT-SIGNATURE and PAYMENT-RESPONSE transport is backed by one persisted settlement", async () => {
    const agent = request.agent(app);
    await agent.post("/api/session").send({ workspace: "blue" });
    const before = await agent.get("/api/lab/merchant/ai-security-report");
    expect(before.status).toBe(402);
    expect(
      decodePaymentRequiredHeader(before.headers["payment-required"])
        .x402Version,
    ).toBe(2);
    const created = await agent.post("/api/lab/purchases").send({
      productId: "ai-security-report",
      clientKey: "sdk-http-flow",
      prompt: "Buy the report for 1 USDC",
    });
    expect(created.status).toBe(200);
    const paid = await agent
      .post("/api/lab/purchases/" + created.body.id + "/approve")
      .send({ approve: true });
    expect(paid.body.state).toBe("COMPLETED");
    const header = encodePaymentSignatureHeader(paid.body.signings[0].payload);
    const delivered = await agent
      .get("/api/lab/merchant/ai-security-report")
      .set("PAYMENT-SIGNATURE", header);
    expect(delivered.status).toBe(200);
    expect(delivered.text).toContain("SIMULATED PURCHASE");
    expect(
      decodePaymentResponseHeader(delivered.headers["payment-response"])
        .transaction,
    ).toMatch(/^simtx:/);
    const repeated = await agent
      .post("/api/lab/facilitator/settle")
      .send({ purchaseId: created.body.id, paymentSignature: header });
    expect(repeated.body.success).toBe(true);
    const verified = await agent
      .post("/api/lab/facilitator/verify")
      .send({ purchaseId: created.body.id, paymentSignature: header });
    expect(verified.body.isValid).toBe(false);
    expect(verified.body.reason).toBe("AUTHORIZATION_NONCE_ALREADY_USED");
    expect(
      await db.labTransaction.count({ where: { purchaseId: created.body.id } }),
    ).toBe(1);
  }, 30000);
  it("Red payload cannot edit trusted user, policy or credential fields", async () => {
    for (const key of [
      "authorization",
      "userId",
      "buyerPrivateKey",
      "policy",
      "environmentId",
    ])
      expect(() =>
        validateConfig("overpayment", { [key]: "unauthorized" }),
      ).toThrow();
  }, 30000);
  it("SSE persisted sequence cursors allow reconnect without duplicate events", async () => {
    const r = runs.get("normal"),
      s = await record(r),
      cursor = s.events.at(-1).sequence;
    const replay = await db.labEvent.findMany({
      where: { environmentId: r.environmentId, sequence: { gt: cursor } },
    });
    expect(replay).toHaveLength(0);
    await locked(r.environmentId, (tx) =>
      emit(tx, r.environmentId, "RECONNECT_TEST_EVENT", "test", {
        simulation: true,
      }),
    );
    const rows = await db.labEvent.findMany({
      where: { environmentId: r.environmentId, sequence: { gt: cursor } },
    });
    expect(rows).toHaveLength(1);
    expect(new Set(rows.map((r) => r.sequence)).size).toBe(1);
  }, 30000);
});
describe("seeded property-based security fuzzing", () => {
  function context() {
    const a: any = {
      status: "ACTIVE",
      createdAt: 0,
      expiresAt: 1000,
      merchantId: "merchant",
      productId: "report",
      amount: "1000000",
      recipient: "0x1111111111111111111111111111111111111111",
      buyer: "0x2222222222222222222222222222222222222222",
      asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      network: "eip155:84532",
      scheme: "exact",
      resource: "https://merchant.simulation.invalid/report",
    };
    const input = {
      merchantId: "merchant",
      productId: "report",
      requirements: {
        x402Version: 2,
        resource: {
          url: a.resource,
          description: "Report",
          mimeType: "text/plain",
        },
        accepts: [
          {
            scheme: "exact",
            network: a.network,
            asset: a.asset,
            amount: a.amount,
            payTo: a.recipient,
            maxTimeoutSeconds: 120,
            extra: {
              name: "USDC",
              version: "2",
              assetTransferMethod: "eip3009",
            },
          },
        ],
      },
    };
    return {
      authorization: a,
      trusted: { merchantId: "merchant" },
      input,
      clock: 10,
      settled: false,
      nonceUsed: false,
      taskSpent: 0n,
      dailySpent: 0n,
      taskBudget: "1000000",
      dailyLimit: "10000000",
    };
  }
  it("arbitrary malformed merchant JSON fails closed without throwing", () =>
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        const c = context();
        (c as any).input = value;
        expect(evaluateRules(c).decision).toBe("BLOCK");
      }),
      { seed: 84537, numRuns: 250 },
    ));
  it("exact scheme never treats Permit2 or another transfer method as an EIP-3009 payload", () => {
    for (const method of ["permit2", "erc7710", "unknown"]) {
      const c = context();
      c.input.requirements.accepts[0].extra.assetTransferMethod = method;
      expect(evaluateRules(c).failed).toContain("CONTRACT_PERMISSION");
    }
  });
  it("fuzzed uint256 amounts never authorize an increase or malformed value", () =>
    fc.assert(
      fc.property(
        fc.oneof(
          fc.bigInt({ min: 0n, max: 2n ** 256n + 100n }).map(String),
          fc.string({ maxLength: 90 }),
        ),
        (value) => {
          const c = context();
          c.input.requirements.accepts[0].amount = value;
          if (value !== "1000000")
            expect(evaluateRules(c).decision).toBe("BLOCK");
        },
      ),
      { seed: 84532, numRuns: 250 },
    ));
  it("fuzzed recipient addresses cannot replace the approved recipient", () =>
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 20, maxLength: 20 }), (bytes) => {
        const c = context(),
          value = "0x" + Buffer.from(bytes).toString("hex");
        c.input.requirements.accepts[0].payTo = value;
        if (value !== c.authorization.recipient)
          expect(evaluateRules(c).failed).toContain("AUTHORIZED_RECIPIENT");
      }),
      { seed: 84533, numRuns: 150 },
    ));
  it("fuzzed authorization lifetimes enforce strict expiration and replay", () =>
    fc.assert(
      fc.property(fc.integer({ min: -100000, max: 100000 }), (expiry) => {
        const c = context();
        c.authorization.expiresAt = expiry;
        if (expiry <= c.clock)
          expect(evaluateRules(c).failed).toContain("AUTHORIZATION_EXPIRY");
        c.nonceUsed = true;
        expect(evaluateRules(c).failed).toContain("NONCE_REPLAY");
      }),
      { seed: 84534, numRuns: 150 },
    ));
  it("fuzzed EIP-3009 nonces cannot reuse a signature for a changed message", async () => {
    const s = await record(runs.get("normal")),
      original = s.signings[0].payload,
      buyer = s.wallets.find((w: any) => w.role === "buyer").address;
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 0, maxLength: 40 }),
        async (bytes) => {
          const payload = structuredClone(original);
          payload.payload.authorization.nonce =
            "0x" + Buffer.from(bytes).toString("hex");
          if (
            payload.payload.authorization.nonce !==
            original.payload.authorization.nonce
          )
            expect(
              (await verifyPayload(payload, buyer, s.environment.clock))
                .isValid,
            ).toBe(false);
        },
      ),
      { seed: 84536, numRuns: 100 },
    );
  }, 30000);
  it("fuzzed concurrent request counts still settle exactly once", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 12 }), async (count) => {
        const r = await runScenario(
          scope,
          "race",
          "concurrency-property:" + count,
          { count },
        );
        const s = await record(r);
        expect(s.transactions).toHaveLength(1);
        expect(s.signings).toHaveLength(1);
        expect(s.wallets.find((w: any) => w.role === "buyer").usdcAtomic).toBe(
          "49000000",
        );
      }),
      { seed: 84535, numRuns: 4 },
    );
  }, 90000);
});
