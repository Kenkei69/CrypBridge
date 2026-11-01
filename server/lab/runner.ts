import { db } from "../config";
import { AppError } from "../errors";
import {
  Scope,
  ENGINE,
  RULES,
  createEnvironment,
  initialDefaults,
  emit,
  locked,
  owned,
  digest,
  json,
  amount,
  walletId,
  canonical,
} from "./core";
import { Category, validateConfig, scenarioLibrary } from "./scenarios";
import {
  createPurchase,
  authorize,
  createAttack,
  processPurchase,
  inspectPurchase,
  reconcile,
} from "./engine";
import { transfer, index, reorg, mine } from "./chain";
export async function exportEnvironment(scope: Scope, environmentId: string) {
  await owned(environmentId, scope);
  return locked(environmentId, async (tx) => {
    const env = await owned(environmentId, scope, tx);
    const wallets = await tx.labWallet.findMany({
      where: { environmentId },
      orderBy: { role: "asc" },
    });
    const ledger = await tx.labLedger.findMany({
      where: { environmentId },
      orderBy: { sequence: "asc" },
    });
    const balances = await Promise.all(
      wallets.map(async (w) => ({
        ...w,
        usdcAtomic: (await amount(tx, environmentId, w.role)).toString(),
        ethWei: (await amount(tx, environmentId, w.role, "ETH")).toString(),
      })),
    );
    const records: any = {
      environment: env,
      products: await tx.labProduct.findMany({ orderBy: { id: "asc" } }),
      wallets: balances,
      ledger,
      tasks: await tx.labTask.findMany({ where: { environmentId } }),
      purchases: await tx.labPurchase.findMany({
        where: { environmentId },
        orderBy: { ordinal: "asc" },
      }),
      authorizations: await tx.labAuthorization.findMany({
        where: { environmentId },
      }),
      attacks: await tx.labAttack.findMany({
        where: { environmentId },
        orderBy: { createdAt: "asc" },
      }),
      attempts: await tx.labAttempt.findMany({
        where: { environmentId },
        orderBy: { createdAt: "asc" },
      }),
      signings: await tx.labSigning.findMany({ where: { environmentId } }),
      settlements: await tx.labSettlement.findMany({
        where: { environmentId },
      }),
      transactions: await tx.labTransaction.findMany({
        where: { environmentId },
        orderBy: { timestamp: "asc" },
      }),
      blocks: await tx.labBlock.findMany({
        where: { environmentId },
        orderBy: { number: "asc" },
      }),
      logs: await tx.labLog.findMany({ where: { environmentId } }),
      checkpoint: await tx.labCheckpoint.findUnique({
        where: { environmentId },
      }),
      flows: await tx.labFlowEdge.findMany({
        where: { environmentId },
        orderBy: { timestamp: "asc" },
      }),
      incidents: await tx.labIncident.findMany({ where: { environmentId } }),
      exchangeCases: await tx.labExchangeCase.findMany({
        where: { environmentId },
      }),
      events: await tx.labEvent.findMany({
        where: { environmentId },
        orderBy: { sequence: "asc" },
      }),
      allowances: await tx.labAllowance.findMany({ where: { environmentId } }),
      movementAuthorizations: await tx.labMovementAuthorization.findMany({
        where: { environmentId },
      }),
      executions: await tx.labExecution.findMany({ where: { environmentId } }),
      conversations: await tx.labConversation.findMany({
        where: { environmentId },
      }),
      messages: await tx.labMessage.findMany({
        where: { environmentId },
        orderBy: { sequence: "asc" },
      }),
    };
    records.decisions = await tx.labDecision.findMany({
      where: { environmentId },
      orderBy: { createdAt: "asc" },
    });
    records.rules = await tx.labRuleResult.findMany({
      where: { decisionId: { in: records.decisions.map((d: any) => d.id) } },
    });
    return json({
      simulation: true,
      engineVersion: ENGINE,
      publicNetworkSubmission: false,
      ...records,
    });
  });
}
export function metrics(record: any) {
  const txs = record.transactions.filter((t: any) => t.status === "SUCCESS");
  const purchaseById = new Map(record.purchases.map((p: any) => [p.id, p]));
  let unauthorized = 0n,
    max = 0n,
    unauthorizedSettlements = 0;
  for (const t of txs) {
    const p: any = purchaseById.get(t.purchaseId);
    if (
      p &&
      (t.tokenRecipient.toLowerCase() !== p.trusted.recipient.toLowerCase() ||
        BigInt(t.tokenAmount) > BigInt(p.amount))
    ) {
      unauthorized += BigInt(t.tokenAmount);
      if (BigInt(t.tokenAmount) > max) max = BigInt(t.tokenAmount);
      unauthorizedSettlements++;
    }
  }
  let unauthorizedSignatures = 0;
  for (const s of record.signings) {
    const p: any = purchaseById.get(s.purchaseId),
      r = s.payload.accepted;
    if (
      p &&
      (r.payTo.toLowerCase() !== p.trusted.recipient.toLowerCase() ||
        r.amount !== p.amount)
    )
      unauthorizedSignatures++;
  }
  const blocked = record.attempts.filter(
    (a: any) => a.state === "BLOCKED",
  ).length;
  const successfulPayments = txs.filter((t: any) => t.purchaseId).length;
  return {
    totalAttempts: record.attempts.length,
    attacksDelivered: record.attacks.filter((a: any) => a.original !== null)
      .length,
    attemptsBlocked: blocked,
    unauthorizedSignatures,
    unauthorizedSettlements,
    unauthorizedSpendingAtomic: unauthorized.toString(),
    maximumUnauthorizedSpendingExposureAtomic: max.toString(),
    successfulPayments,
    failedSettlements: record.settlements.filter(
      (s: any) => s.state === "FAILED",
    ).length,
    averageEvaluationLatencyVirtualMs: record.attempts.length
      ? record.attempts.reduce((n: number, a: any) => n + a.latency, 0) /
        record.attempts.length
      : 0,
    simulation: true,
  };
}
export function semanticState(record: any) {
  return {
    seed: record.environment.seed,
    engineVersion: record.environment.engineVersion,
    ruleVersion: record.environment.ruleVersion,
    kind: record.environment.kind,
    initial: record.environment.initial,
    wallets: record.wallets.map((w: any) => ({
      role: w.role,
      address: w.address,
      usdcAtomic: w.usdcAtomic,
      ethWei: w.ethWei,
      transactionNonce: w.transactionNonce,
    })),
    purchases: record.purchases.map((p: any) => ({
      ordinal: p.ordinal,
      productId: p.productId,
      state: p.state,
      amount: p.amount,
      error: p.error,
      trusted: p.trusted,
    })),
    attempts: record.attempts
      .map((a: any) => ({
        state: a.state,
        modified: a.modified,
        verification: a.verification,
      }))
      .sort((a: any, b: any) => canonical(a).localeCompare(canonical(b))),
    rules: record.rules
      .map((r: any) => ({
        ruleId: r.ruleId,
        status: r.status,
        evaluated: r.evaluated,
        expected: r.expected,
      }))
      .sort((a: any, b: any) => canonical(a).localeCompare(canonical(b))),
    transactions: record.transactions.map((t: any) => ({
      reference: t.reference,
      sender: t.sender,
      recipient: t.recipient,
      tokenSender: t.tokenSender,
      tokenRecipient: t.tokenRecipient,
      tokenAmount: t.tokenAmount,
      nonce: t.nonce,
      status: t.status,
      confirmations: t.confirmations,
      operation: t.operation,
      gasUsed: t.gasUsed,
    })),
    metrics: metrics(record),
  };
}
export async function controlledMove(
  scope: Scope,
  environmentId: string,
  fromRole: string,
  toRole: string,
  value: string,
) {
  return locked(environmentId, async (tx) => {
    const env = await owned(environmentId, scope, tx);
    if (env.kind !== "BASELINE")
      throw new AppError(
        403,
        "ISOLATED_BASELINE_REQUIRED",
        "Controlled attacker fund movements require a separate vulnerable-baseline environment",
      );
    if (
      !["attacker", "relay", "custodian"].includes(fromRole) ||
      !["attacker", "relay", "custodian"].includes(toRole) ||
      fromRole === toRole
    )
      throw new Error("Only scoped forensic test wallets can be moved");
    if (
      fromRole === "custodian" &&
      (await tx.labExchangeCase.findFirst({
        where: { environmentId, status: "HOLD_APPROVED" },
      }))
    )
      throw new AppError(
        409,
        "VIRTUAL_CUSTODIAL_HOLD",
        "The simulated custodial service holds these virtual funds",
      );
    const to = await tx.labWallet.findUniqueOrThrow({
      where: { environmentId_role: { environmentId, role: toRole } },
    });
    const approval =
      environmentId +
      ":virtual-signing-receipt:" +
      digest({ seed: env.seed, clock: env.clock, fromRole, toRole, value });
    await tx.labMovementAuthorization.create({
      data: {
        id: approval,
        environmentId,
        fromRole,
        recipient: to.address,
        amount: value,
        signatureKind: "EXPLICIT_VIRTUAL_SIGNING_RECEIPT_NOT_ECDSA",
        approvedBy: scope.userId,
        createdAt: env.clock,
      },
    });
    await emit(
      tx,
      environmentId,
      "CONTROLLED_FORENSIC_TRANSFER_AUTHORIZED",
      "isolated-fixture-user",
      {
        fromRole,
        toRole,
        amount: value,
        signatureKind: "EXPLICIT_VIRTUAL_SIGNING_RECEIPT_NOT_ECDSA",
        authorization: approval,
      },
    );
    const t = await transfer(
      tx,
      environmentId,
      fromRole,
      to.address,
      value,
      approval,
      "CONTROLLED_VIRTUAL_TRANSFER",
    );
    await index(tx, environmentId);
    return t;
  });
}
export async function exchangeCase(
  scope: Scope,
  environmentId: string,
  incidentId: string,
  destination: string,
  additionalEvidence = true,
) {
  return locked(environmentId, async (tx) => {
    await owned(environmentId, scope, tx);
    const incident = await tx.labIncident.findFirstOrThrow({
      where: { id: incidentId, environmentId },
    });
    const flows = await tx.labFlowEdge.findMany({ where: { environmentId } });
    const relevant = flows.filter(
      (f) => f.recipient.toLowerCase() === destination.toLowerCase(),
    );
    const request = {
      simulation: true,
      incidentId,
      destination,
      transactionEvidence: relevant.map((f) => f.evidence),
      fundFlowHistory: flows.map((f) => ({
        sender: f.sender,
        recipient: f.recipient,
        amount: f.amount,
        transactionId: f.transactionId,
      })),
      riskIndicators: [incident.classification],
      supportingDocumentation: additionalEvidence ? incident.evidence : null,
    };
    let status = "RECEIVED";
    const c = await tx.labExchangeCase.create({
      data: {
        environmentId,
        incidentId,
        destination,
        status,
        request,
        response: {
          simulation: true,
          message:
            "Simulated exchange intake only; no real institution contacted",
        },
        createdAt: (
          await tx.labEnvironment.findUniqueOrThrow({
            where: { id: environmentId },
          })
        ).clock,
      },
    });
    for (const next of [
      "UNDER_REVIEW",
      !relevant.length
        ? "HOLD_DECLINED"
        : !additionalEvidence
          ? "ADDITIONAL_EVIDENCE_REQUIRED"
          : incident.classification === "UNAUTHORIZED_BASELINE_TRANSFER"
            ? "HOLD_APPROVED"
            : "HOLD_DECLINED",
    ]) {
      status = next;
      await tx.labExchangeCase.update({
        where: { id: c.id },
        data: {
          status,
          response: {
            simulation: true,
            status,
            realExchangeAction: false,
            explanation: !relevant.length
              ? "No matching confirmed virtual deposit evidence"
              : !additionalEvidence
                ? "Supporting documentation is required"
                : status === "HOLD_APPROVED"
                  ? "Isolated baseline incident and confirmed virtual deposit evidence satisfy the test policy"
                  : "Evidence does not establish an unauthorized baseline transfer",
          },
        },
      });
      await emit(
        tx,
        environmentId,
        "SIMULATED_EXCHANGE_" + status,
        "simulated-exchange",
        { caseId: c.id, status, realExchangeAction: false },
        undefined,
        c.id,
      );
    }
    return tx.labExchangeCase.findUniqueOrThrow({ where: { id: c.id } });
  });
}
export async function runScenario(
  scope: Scope,
  category: Category | "normal",
  seed: string,
  config: any = {},
  target: "guardian" | "baseline" = "guardian",
  replayOf?: string,
  snapshotOverride?: any,
) {
  if (category !== "normal") validateConfig(category, config);
  if (
    target === "baseline" &&
    category !== "wrong-recipient" &&
    category !== "overpayment"
  )
    throw new AppError(
      422,
      "BASELINE_FIXTURE_LIMIT",
      "Baseline comparisons support recipient and amount authorization bypasses only",
    );
  const initial = {
    ...initialDefaults,
    ...(snapshotOverride?.initial || {}),
    ...(category === "insufficient-balance" ? { buyerUsdc: "0" } : {}),
    ...(category === "insufficient-gas" ? { facilitatorEth: "0" } : {}),
  };
  const env = await createEnvironment(
    scope,
    seed,
    target === "baseline" ? "BASELINE" : "REGRESSION",
    initial,
  );
  const product =
    snapshotOverride?.product ||
    (await db.labProduct.findUniqueOrThrow({
      where: {
        id:
          category === "micro-drain"
            ? "micro-security-brief"
            : "ai-security-report",
      },
    }));
  const snapshot = {
    engineVersion: ENGINE,
    ruleVersion: RULES,
    seed,
    initial,
    product,
    target,
    category,
    config,
  };
  await db.labSnapshot.create({
    data: {
      environmentId: env.id,
      label: "pre-run reproducibility fixture",
      version: ENGINE,
      data: snapshot,
      digest: digest(snapshot),
    },
  });
  const p = await createPurchase(
    scope,
    env.id,
    product.id,
    "fixture-purchase-1",
    `Isolated fixture: ${category}`,
    {
      budget: category === "micro-drain" ? "1000000" : product.amount,
      productSnapshot: product,
    },
  );
  await authorize(scope, p.id, true);
  let attack: any = null;
  if (category !== "normal")
    attack = await createAttack(
      scope,
      env.id,
      category,
      config,
      "fixture",
      undefined,
      true,
    );
  if (category === "expired")
    await locked(env.id, (tx) =>
      emit(
        tx,
        env.id,
        "FIXTURE_VIRTUAL_CLOCK_ADVANCED",
        "fixture",
        { milliseconds: 400000 },
        p.id,
        undefined,
        400000,
      ),
    );
  if (category === "race")
    await Promise.all(
      Array.from({ length: config.count || 8 }, (_, n) =>
        processPurchase(scope, p.id, "race-" + n, undefined),
      ),
    );
  else {
    await processPurchase(scope, p.id, "fixture-first", attack?.id);
    if (category === "duplicate")
      await processPurchase(scope, p.id, "attacker-replay");
    if (category === "micro-drain") {
      for (let n = 1; n < (config.count || 12); n++) {
        const child = await createPurchase(
          scope,
          env.id,
          product.id,
          "installment-" + n,
          "Explicitly approved fixture installment",
          { taskId: p.taskId, productSnapshot: product },
        );
        await authorize(scope, child.id, true);
        await processPurchase(scope, child.id, "installment");
      }
    }
    if (category === "rpc-failure")
      await locked(env.id, async (tx) => {
        await index(tx, env.id);
        await index(tx, env.id);
        await emit(
          tx,
          env.id,
          "INDEXER_RECOVERED_FROM_VIRTUAL_LOGS",
          "indexer",
          { restartSafe: true, duplicateEdgesPrevented: true },
        );
      });
    if (category === "chain-reorganization")
      await locked(env.id, (tx) => reorg(tx, env.id));
  }
  if (target === "baseline") {
    const current = await db.labPurchase.findUniqueOrThrow({
      where: { id: p.id },
    });
    if (
      current.state === "COMPLETED" &&
      (await locked(env.id, (tx) => amount(tx, env.id, "attacker"))) > 0n
    ) {
      const moved = await locked(env.id, (tx) =>
        amount(tx, env.id, "attacker"),
      );
      await controlledMove(
        scope,
        env.id,
        "attacker",
        "relay",
        ((moved * 6n) / 10n).toString(),
      );
      await controlledMove(
        scope,
        env.id,
        "attacker",
        "custodian",
        (moved - (moved * 6n) / 10n).toString(),
      );
      await controlledMove(
        scope,
        env.id,
        "relay",
        "custodian",
        ((moved * 6n) / 10n).toString(),
      );
    }
  }
  const record = await exportEnvironment(scope, env.id);
  const m = metrics(record);
  const delivered = category !== "normal";
  const expectedLegitimate =
    category === "normal" || category === "prompt-injection";
  const result = {
    simulation: true,
    category,
    target,
    delivered,
    guardianDecisions: record.decisions.map((d: any) => ({
      stage: d.stage,
      decision: d.decision,
    })),
    blockedAttempts: m.attemptsBlocked,
    objectiveAchieved:
      m.unauthorizedSettlements > 0 || m.unauthorizedSignatures > 0,
    legitimatePaymentSuccess: m.successfulPayments > 0,
    expectedLegitimate,
    falsePositive: expectedLegitimate && m.successfulPayments === 0,
    signingCount: record.signings.length,
    settlementCount: record.settlements.filter(
      (s: any) => s.state === "SETTLED",
    ).length,
    metrics: m,
    failedRules: [
      ...new Set(
        record.rules
          .filter((r: any) => r.status === "FAIL")
          .map((r: any) => r.ruleId),
      ),
    ],
    evidence: {
      environmentId: env.id,
      purchaseIds: record.purchases.map((p: any) => p.id),
      eventCount: record.events.length,
      tailIntegrity: record.environment.eventHash,
    },
    reproduction: snapshot,
  };
  if (attack) {
    await locked(env.id, (tx) =>
      emit(
        tx,
        env.id,
        ["duplicate", "micro-drain", "race"].includes(category)
          ? "ATTACK_COMPLETED"
          : "REGRESSION_RUN_RECORDED",
        "red-team-runner",
        {
          category,
          objectiveAchieved: result.objectiveAchieved,
          blockedAttempts: result.blockedAttempts,
        },
        p.id,
        attack.id,
      ),
    );
    await db.labAttack.update({
      where: { id: attack.id },
      data: { result: json(result), status: "COMPLETED" },
    });
  }
  const semanticDigest = digest(semanticState(record));
  const saved = await db.labRun.create({
    data: {
      ...scope,
      environmentId: env.id,
      category,
      seed,
      target,
      config,
      snapshot,
      result: json(result),
      semanticDigest,
      replayOf,
    },
  });
  return { ...saved, result, snapshot };
}
export async function replay(scope: Scope, id: string) {
  const previous = await db.labRun.findFirstOrThrow({
    where: { id, ...scope },
  });
  if (
    (previous.snapshot as any).engineVersion !== ENGINE ||
    (previous.snapshot as any).ruleVersion !== RULES
  )
    throw new AppError(
      409,
      "ENGINE_VERSION_UNAVAILABLE",
      "Replay requires the recorded engine and rule versions",
    );
  const next = await runScenario(
    scope,
    previous.category as any,
    previous.seed,
    previous.config,
    previous.target as any,
    id,
    previous.snapshot,
  );
  return {
    ...next,
    equivalent: next.semanticDigest === previous.semanticDigest,
    originalDigest: previous.semanticDigest,
  };
}
export async function aggregateMetrics(scope: Scope) {
  const allRuns = await db.labRun.findMany({
    where: scope,
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  const runs = allRuns.filter((r) => r.target === "guardian");
  const baselineRuns = allRuns.filter((r) => r.target === "baseline");
  const delivered = runs.filter((r) => (r.result as any).delivered);
  const expected = runs.filter((r) => (r.result as any).expectedLegitimate);
  return {
    simulation: true,
    totalTests: allRuns.length,
    guardianTests: runs.length,
    baselineTests: baselineRuns.length,
    baselineUnauthorizedSettlements: baselineRuns.reduce(
      (n, r) => n + (r.result as any).metrics.unauthorizedSettlements,
      0,
    ),
    attacksDelivered: delivered.length,
    attacksBlocked: delivered.filter(
      (r) => (r.result as any).blockedAttempts > 0,
    ).length,
    ineffectivePrompts: delivered.filter(
      (r) =>
        r.category === "prompt-injection" &&
        !(r.result as any).objectiveAchieved &&
        (r.result as any).legitimatePaymentSuccess,
    ).length,
    unauthorizedSignatures: runs.reduce(
      (n, r) => n + (r.result as any).metrics.unauthorizedSignatures,
      0,
    ),
    unauthorizedSettlements: runs.reduce(
      (n, r) => n + (r.result as any).metrics.unauthorizedSettlements,
      0,
    ),
    attackSuccessRate: delivered.length
      ? delivered.filter((r) => (r.result as any).objectiveAchieved).length /
        delivered.length
      : 0,
    falsePositiveRate: expected.length
      ? expected.filter((r) => (r.result as any).falsePositive).length /
        expected.length
      : 0,
    legitimatePaymentSuccessRate: expected.length
      ? expected.filter((r) => (r.result as any).legitimatePaymentSuccess)
          .length / expected.length
      : 0,
    maximumUnauthorizedSpendingExposureAtomic: runs
      .reduce((max, r) => {
        const v = BigInt(
          (r.result as any).metrics.maximumUnauthorizedSpendingExposureAtomic,
        );
        return v > max ? v : max;
      }, 0n)
      .toString(),
    latencyUnit: "virtual milliseconds",
    averageEvaluationLatencyVirtualMs: runs.length
      ? runs.reduce(
          (n, r) =>
            n + (r.result as any).metrics.averageEvaluationLatencyVirtualMs,
          0,
        ) / runs.length
      : 0,
    scope:
      "Last 500 persisted runs; security rates exclude intentionally vulnerable baseline targets",
  };
}
