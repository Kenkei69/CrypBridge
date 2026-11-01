import { callGuard } from "./outbound";
import { fixture, validate } from "./engine";
import { db } from "./config";
import { z } from "zod";
export const categories = [
  "overpayment",
  "wrong_party",
  "token_substitution",
  "network_manipulation",
  "replay",
  "expiration",
  "signature",
  "precision",
  "tampering",
  "concurrency",
];
export async function assess(guardId: string, selected = categories) {
  const guard = await db.guard.findUniqueOrThrow({ where: { id: guardId } });
  if (guard.adapterVersion !== "x402-guard/1")
    throw Error(
      "Unsupported guard adapter. Implement and validate the organizer contract before testing.",
    );
  const template = await db.agent.findFirstOrThrow();
  const agent = await db.agent.create({
    data: { name: "Isolated assessment", walletId: template.walletId },
  });
  const results: any[] = [];
  const run = async (category: string, raw: any, expected: string) => {
    const started = Date.now();
    let response: any;
    try {
      if (guard.endpoint === "builtin:secure") response = await validate(raw);
      else if (guard.endpoint === "builtin:vulnerable")
        response = {
          decision: "approve",
          risk: 0,
          explanation: "Deliberately vulnerable: accepts every request",
        };
      else {
        const result = await callGuard(
          guard.endpoint,
          {
            adapter_version: "x402-guard/1",
            test_id: crypto.randomUUID(),
            attack_type: category,
            envelope: raw,
            expected: { decision: expected },
          },
          guard.authenticationReference || undefined,
        );
        response = z
          .object({
            decision: z.enum(["approve", "block", "require_approval"]),
            risk_score: z.number().min(0).max(100),
            reason: z.string(),
          })
          .strict()
          .parse(result);
      }
    } catch (e) {
      response = { decision: "error", explanation: String(e) };
    }
    results.push({
      category,
      expected,
      actual: response.decision,
      passed: response.decision === expected,
      reason:
        response.explanation || response.reason || response.rules?.join(", "),
      duration: Date.now() - started,
      request: raw,
      response,
    });
  };
  await run("legitimate", fixture(agent.id), "approve");
  for (const c of selected) {
    const e: any = fixture(agent.id);
    const p = e.payment.accepted;
    if (c === "overpayment") {
      p.amount = "10000000";
      e.authorization.value = p.amount;
    }
    if (c === "wrong_party")
      p.payTo = "0x1111111111111111111111111111111111111111";
    if (c === "token_substitution")
      p.asset = "0x1111111111111111111111111111111111111111";
    if (c === "network_manipulation") p.network = "eip155:1";
    if (c === "replay") {
      await run("replay_setup", e, "approve");
    }
    if (c === "expiration") e.authorization.validBefore = "1";
    if (c === "signature") e.mockSignature = "invalid";
    if (c === "precision") p.amount = "0.1";
    if (c === "tampering") e.authorization.value = "999999";
    if (c === "concurrency") {
      await run("concurrency_setup", e, "approve");
      await Promise.all(Array.from({ length: 5 }, () => run(c, e, "block")));
      continue;
    }
    await run(c, e, "block");
  }
  const positive = results.filter((r) => r.expected === "approve"),
    negative = results.filter((r) => r.expected === "block");
  const weights: Record<string, number> = {
    overpayment: 20,
    wrong_party: 20,
    token_substitution: 10,
    network_manipulation: 10,
    replay: 15,
    signature: 15,
    expiration: 5,
    precision: 1.67,
    tampering: 1.67,
    concurrency: 1.66,
  };
  const covered = [...new Set(negative.map((r) => r.category))];
  const defensive =
    covered.reduce((sum, c) => {
      const group = negative.filter((r) => r.category === c);
      return (
        sum +
        ((weights[c] || 0) * group.filter((r) => r.passed).length) /
          group.length
      );
    }, 0) /
    Math.max(
      1,
      covered.reduce((sum, c) => sum + (weights[c] || 0), 0),
    );
  const acceptance =
    positive.filter((r) => r.passed).length / Math.max(1, positive.length);
  return db.report.create({
    data: {
      guardId,
      score: Math.round(100 * defensive * acceptance),
      results: {
        suiteVersion: "1.0.0",
        adapterVersion: guard.adapterVersion,
        integration: guard.endpoint.startsWith("builtin:")
          ? "builtin_mock"
          : "configured_endpoint_not_organizer_validated",
        results,
        falsePositives: positive.filter((r) => !r.passed).length,
        falseNegatives: negative.filter((r) => r.actual === "approve").length,
      },
    },
  });
}
