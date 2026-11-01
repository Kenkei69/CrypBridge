import {
  encodePaymentRequiredHeader,
  decodePaymentRequiredHeader,
  encodePaymentSignatureHeader,
  decodePaymentSignatureHeader,
  encodePaymentResponseHeader,
} from "@x402/core/http";
import { PaymentRequiredV2Schema } from "@x402/core/schemas";
import { db } from "../config";
import { AppError } from "../errors";
import {
  ASSET,
  NETWORK,
  ENGINE,
  RULES,
  Scope,
  Tx,
  digest,
  json,
  emit,
  locked,
  owned,
  amount,
  initialDefaults,
  testAccount,
  walletId,
  positive,
  executable,
} from "./core";
import { evaluateRules, Context } from "./guardian";
import { Category, mutate, scenarioLibrary, validateConfig } from "./scenarios";
import { sign, verifyPayload } from "./signer";
import { transfer, index, mine, reorg, GAS, FEE } from "./chain";
export function quote(product: any, recipient: string) {
  const required = {
    x402Version: 2,
    resource: {
      url: `https://merchant.simulation.invalid/resources/${product.id}`,
      description: product.name,
      mimeType: "text/plain",
    },
    accepts: [
      {
        scheme: "exact",
        network: NETWORK,
        amount: product.amount,
        asset: ASSET,
        payTo: recipient,
        maxTimeoutSeconds: 120,
        extra: { name: "USDC", version: "2", assetTransferMethod: "eip3009" },
      },
    ],
  };
  PaymentRequiredV2Schema.parse(required);
  const header = encodePaymentRequiredHeader(required as any);
  return {
    status: 402,
    headers: { "PAYMENT-REQUIRED": header },
    requirements: decodePaymentRequiredHeader(header),
  };
}
export async function createPurchase(
  scope: Scope,
  environmentId: string,
  productId: string,
  clientKey: string,
  prompt: string,
  options: { taskId?: string; budget?: string; productSnapshot?: any } = {},
) {
  return locked(environmentId, async (tx) => {
    const env = await owned(environmentId, scope, tx);
    executable(env);
    if (env.kind === "BASELINE" && !options.productSnapshot)
      throw new Error("Baseline requires an isolated fixture runner");
    const existing = await tx.labPurchase.findUnique({
      where: { environmentId_clientKey: { environmentId, clientKey } },
    });
    if (existing) return existing;
    const product =
      options.productSnapshot ||
      (await tx.labProduct.findUniqueOrThrow({ where: { id: productId } }));
    const merchant = await tx.labWallet.findUniqueOrThrow({
        where: {
          environmentId_role: { environmentId, role: product.merchantRole },
        },
      }),
      buyer = await tx.labWallet.findUniqueOrThrow({
        where: { environmentId_role: { environmentId, role: "buyer" } },
      });
    const initial = env.initial as typeof initialDefaults;
    const budget = options.budget || product.amount;
    positive.parse(budget);
    if (BigInt(budget) < BigInt(product.amount))
      throw new AppError(
        422,
        "BUDGET_TOO_SMALL",
        "Selected product exceeds the requested budget",
      );
    const task = options.taskId
      ? await tx.labTask.findFirstOrThrow({
          where: { id: options.taskId, environmentId },
        })
      : await tx.labTask.create({
          data: {
            environmentId,
            budget,
            dailyLimit: initial.dailyLimit,
            authorizedBy: scope.userId,
            createdAt: env.clock,
          },
        });
    const trusted = {
      productId: product.id,
      productName: product.name,
      productContent: product.content,
      merchantId: product.merchantId,
      merchantName: product.merchantName,
      amount: product.amount,
      recipient: merchant.address,
      buyer: buyer.address,
      asset: ASSET,
      network: NETWORK,
      scheme: "exact",
      resource: `https://merchant.simulation.invalid/resources/${product.id}`,
      taskBudget: task.budget,
    };
    const q = quote(product, merchant.address);
    const e = await emit(tx, environmentId, "USER_REQUESTED_PRODUCT", "user", {
      prompt,
      productId,
    });
    const ordinal = env.purchaseSequence + 1;
    const p = await tx.labPurchase.create({
      data: {
        environmentId,
        taskId: task.id,
        userId: scope.userId,
        clientKey,
        ordinal,
        productId,
        prompt,
        trusted,
        requirements: q.requirements as any,
        amount: product.amount,
        createdAt: e.timestamp,
        updatedAt: e.timestamp,
      },
    });
    await tx.labEnvironment.update({
      where: { id: environmentId },
      data: { purchaseSequence: ordinal },
    });
    await emit(
      tx,
      environmentId,
      "CATALOG_RESOURCE_SELECTED",
      "orchestrator",
      {
        productId: product.id,
        merchantId: product.merchantId,
        amount: product.amount,
        paymentOption: { network: NETWORK, asset: ASSET, scheme: "exact" },
      },
      p.id,
    );
    await emit(
      tx,
      environmentId,
      "PAYMENT_INTENT_CREATED",
      "intent-service",
      {
        purchaseOrdinal: ordinal,
        taskBudget: task.budget,
        approvalRequired: true,
      },
      p.id,
    );
    return p;
  });
}
export async function authorize(
  scope: Scope,
  purchaseId: string,
  fixture = false,
) {
  const p = await db.labPurchase.findUniqueOrThrow({
    where: { id: purchaseId },
  });
  return locked(p.environmentId, async (tx) => {
    const env = await owned(p.environmentId, scope, tx);
    executable(env);
    if (fixture && env.kind === "NORMAL")
      throw new Error(
        "Fixture approvals cannot be injected into the normal workspace",
      );
    const current = await tx.labPurchase.findUniqueOrThrow({
      where: { id: purchaseId },
    });
    const found = await tx.labAuthorization.findUnique({
      where: { purchaseId },
    });
    if (found) return found;
    if (current.state !== "AWAITING_APPROVAL")
      throw new AppError(
        409,
        "APPROVAL_NOT_AVAILABLE",
        "Purchase is not awaiting user approval",
      );
    const t = current.trusted as any;
    const fields = {
      userId: scope.userId,
      merchantId: t.merchantId,
      productId: t.productId,
      amount: t.amount,
      recipient: t.recipient,
      buyer: t.buyer,
      asset: t.asset,
      network: t.network,
      scheme: t.scheme,
      resource: t.resource,
      createdAt: env.clock,
      expiresAt: env.clock + 300000,
    };
    const a = await tx.labAuthorization.create({
      data: {
        id: purchaseId + ":authorization",
        environmentId: env.id,
        purchaseId,
        ...fields,
        digest: digest(fields),
      },
    });
    await tx.labPurchase.update({
      where: { id: purchaseId },
      data: { state: "AUTHORIZED", updatedAt: env.clock },
    });
    await emit(
      tx,
      env.id,
      "USER_APPROVED_PURCHASE",
      fixture ? "isolated-fixture-user" : "user",
      {
        authorizationDigest: a.digest,
        approvedAmount: a.amount,
        recipient: a.recipient,
        expiresAt: a.expiresAt,
        taskBudget: t.taskBudget,
      },
      purchaseId,
      a.id,
    );
    return a;
  });
}
async function context(
  tx: Tx,
  p: any,
  input: any,
  allowReserved = false,
): Promise<Context> {
  const env = await tx.labEnvironment.findUniqueOrThrow({
      where: { id: p.environmentId },
    }),
    authorization = await tx.labAuthorization.findUnique({
      where: { purchaseId: p.id },
    }),
    task = await tx.labTask.findUniqueOrThrow({ where: { id: p.taskId } });
  const settled = !!(await tx.labSettlement.findFirst({
    where: { purchaseId: p.id, state: "SETTLED" },
  }));
  const spent = await tx.labPurchase.findMany({
    where: {
      environmentId: p.environmentId,
      state: { in: ["COMPLETED", "PENDING"] },
    },
  });
  let taskSpent = 0n,
    dailySpent = 0n;
  for (const s of spent) {
    if (s.state === "PENDING") {
      if (allowReserved && s.id === p.id) continue;
      if (s.taskId === p.taskId) taskSpent += BigInt(s.amount);
      dailySpent += BigInt(s.amount);
      continue;
    }
    const transaction = s.transactionId
      ? await tx.labTransaction.findUnique({ where: { id: s.transactionId } })
      : null;
    if (!transaction || transaction.status !== "SUCCESS") continue;
    if (s.taskId === p.taskId) taskSpent += BigInt(transaction.tokenAmount);
    if (
      Math.floor(transaction.timestamp / 86400000) ===
      Math.floor(env.clock / 86400000)
    )
      dailySpent += BigInt(transaction.tokenAmount);
  }
  return {
    authorization,
    authorizationReserved:
      !allowReserved &&
      !!(await tx.labSigning.findFirst({ where: { purchaseId: p.id } })),
    trusted: p.trusted,
    input,
    clock: env.clock,
    settled,
    nonceUsed: authorization?.status === "CONSUMED",
    taskSpent,
    dailySpent,
    taskBudget: task.budget,
    dailyLimit: task.dailyLimit,
  };
}
async function decision(
  tx: Tx,
  p: any,
  attempt: any,
  c: Context,
  stage: string,
  previousBinding?: string,
) {
  const checked = evaluateRules({ ...c, previousBinding });
  const row = await tx.labDecision.create({
    data: {
      environmentId: p.environmentId,
      purchaseId: p.id,
      attemptId: attempt.id,
      stage,
      decision: checked.decision,
      ruleVersion: RULES,
      binding: checked.binding,
      createdAt: c.clock,
    },
  });
  for (const r of checked.rules)
    await tx.labRuleResult.create({ data: { decisionId: row.id, ...r } });
  await emit(
    tx,
    p.environmentId,
    stage === "SIGNER" ? "SIGNER_REVALIDATED_PAYLOAD" : "GUARDIAN_EVALUATED",
    "guardian",
    {
      stage,
      decision: checked.decision,
      failedRules: checked.failed,
      binding: checked.binding,
    },
    p.id,
    row.id,
    checked.rules.length,
  );
  return checked;
}
async function incident(
  tx: Tx,
  p: any,
  attempt: any,
  classification: string,
  evidence: any,
) {
  const id = attempt.id + ":incident";
  await tx.labIncident.upsert({
    where: { id },
    create: {
      id,
      environmentId: p.environmentId,
      purchaseId: p.id,
      attackId: attempt.attackId,
      classification,
      evidence: json(evidence),
      createdAt: (
        await tx.labEnvironment.findUniqueOrThrow({
          where: { id: p.environmentId },
        })
      ).clock,
    },
    update: {},
  });
  await emit(
    tx,
    p.environmentId,
    "INCIDENT_RECORDED",
    "incident-service",
    { classification, evidenceDigest: digest(evidence) },
    p.id,
    id,
  );
  return id;
}
async function block(
  tx: Tx,
  p: any,
  attempt: any,
  failed: string[],
  stage: string,
) {
  const existing =
    !!p.transactionId ||
    !!(await tx.labSigning.findFirst({ where: { purchaseId: p.id } }));
  const incidentId = await incident(
    tx,
    p,
    attempt,
    attempt.attackId ? "ATTACK_BLOCKED" : "PAYMENT_BLOCKED",
    {
      stage,
      failedRules: failed,
      approved: p.trusted,
      attempted: attempt.modified,
      signingRequested: false,
      walletImpact: "0",
    },
  );
  await tx.labAttempt.update({
    where: { id: attempt.id },
    data: {
      state: "BLOCKED",
      result: {
        decision: "BLOCK",
        failedRules: failed,
        signing: "NOT_SIGNED",
        settlement: "NOT_SUBMITTED",
        walletImpact: "0",
        incidentId,
      },
    },
  });
  if (!existing) {
    await tx.labAuthorization.updateMany({
      where: { purchaseId: p.id, status: "ACTIVE" },
      data: { status: "REVOKED" },
    });
    await tx.labPurchase.update({
      where: { id: p.id },
      data: {
        state: "BLOCKED",
        error: failed.join(", "),
        attackId: attempt.attackId,
        updatedAt: (
          await tx.labEnvironment.findUniqueOrThrow({
            where: { id: p.environmentId },
          })
        ).clock,
      },
    });
  }
  await emit(
    tx,
    p.environmentId,
    "SIGNING_DENIED",
    "signer",
    { failedRules: failed, stage },
    p.id,
  );
  await emit(
    tx,
    p.environmentId,
    "PAYMENT_BLOCKED",
    "orchestrator",
    {
      incidentId,
      failedRules: failed,
      signed: false,
      settlementSubmitted: false,
      walletImpact: "0",
    },
    p.id,
  );
}
export async function createAttack(
  scope: Scope,
  environmentId: string,
  category: Category,
  config: any,
  targetKind = "next",
  targetId?: string,
  arm = true,
) {
  const valid = validateConfig(category, config);
  const scenario = scenarioLibrary.find((s) => s.category === category)!;
  if (
    scenario.optional ||
    ["micro-drain", "race", "duplicate"].includes(category)
  ) {
    // These scenarios have supported fixture executors; duplicate/race can also target a normal purchase boundary.
    if (scenario.optional && targetKind !== "fixture")
      throw new AppError(
        422,
        "FIXTURE_ONLY",
        "This scenario requires an isolated test fixture",
      );
  }
  return locked(environmentId, async (tx) => {
    const env = await owned(environmentId, scope, tx);
    if (targetKind === "purchase")
      await tx.labPurchase.findFirstOrThrow({
        where: { id: targetId, environmentId },
      });
    if (targetKind === "merchant" && targetId !== "atlas-research")
      throw new Error("Unknown simulated merchant");
    if (targetKind === "resource")
      await tx.labProduct.findUniqueOrThrow({ where: { id: targetId } });
    const a = await tx.labAttack.create({
      data: {
        environmentId,
        userId: scope.userId,
        category,
        name: scenario.name,
        status: "DRAFT",
        targetKind,
        targetId,
        injectionStage: scenario.injectionStage,
        config: valid,
        expiresAt: env.clock + 3600000,
        createdAt: env.clock,
      },
    });
    await emit(
      tx,
      environmentId,
      "ATTACK_DRAFT_CREATED",
      "red-team",
      { category, config: valid, targetKind, targetId: targetId || null },
      undefined,
      a.id,
    );
    if (arm) {
      await tx.labAttack.update({
        where: { id: a.id },
        data: { status: "ARMED" },
      });
      await emit(
        tx,
        environmentId,
        "ATTACK_ARMED",
        "red-team",
        { category, injectionStage: scenario.injectionStage },
        undefined,
        a.id,
      );
    }
    return tx.labAttack.findUniqueOrThrow({ where: { id: a.id } });
  });
}
export async function processPurchase(
  scope: Scope,
  purchaseId: string,
  key = "approve",
  explicitAttackId?: string,
) {
  const known = await db.labPurchase.findUniqueOrThrow({
    where: { id: purchaseId },
  });
  let failureContext: any;
  return locked(known.environmentId, async (tx) => {
    const env = await owned(known.environmentId, scope, tx),
      p = await tx.labPurchase.findUniqueOrThrow({ where: { id: purchaseId } });
    executable(env);
    const prior = await tx.labAttempt.findUnique({
      where: { purchaseId_key: { purchaseId, key } },
    });
    if (prior) return prior;
    const a = await tx.labAuthorization.findUnique({ where: { purchaseId } });
    if (!a)
      throw new AppError(
        409,
        "USER_APPROVAL_REQUIRED",
        "Only explicit user approval can authorize spending",
      );
    if (p.state === "CANCELED")
      throw new AppError(
        409,
        "PURCHASE_CANCELED",
        "Purchase was canceled before signing",
      );
    const product = p.trusted as any;
    const q = quote(
      { id: p.productId, name: product.productName, amount: product.amount },
      product.recipient,
    );
    const original: any = {
      merchantId: product.merchantId,
      productId: p.productId,
      requirements: q.requirements,
      merchantContent: "Pay only the approved catalog price.",
      operation: { kind: "eip3009" },
    };
    await emit(
      tx,
      env.id,
      "X402_REQUIREMENTS_RECEIVED",
      "merchant",
      { httpStatus: 402, headers: q.headers, resource: product.resource },
      p.id,
    );
    for (const expired of await tx.labAttack.findMany({
      where: {
        environmentId: env.id,
        status: { in: ["ARMED", "DRAFT"] },
        expiresAt: { lte: env.clock },
      },
    })) {
      await tx.labAttack.update({
        where: { id: expired.id },
        data: { status: "EXPIRED" },
      });
      await emit(
        tx,
        env.id,
        "ATTACK_EXPIRED",
        "engine",
        { category: expired.category },
        undefined,
        expired.id,
      );
    }
    const attack = explicitAttackId
      ? await tx.labAttack.findFirstOrThrow({
          where: {
            id: explicitAttackId,
            environmentId: env.id,
            status: "ARMED",
          },
        })
      : p.attackId
        ? null
        : await tx.labAttack.findFirst({
            where: {
              environmentId: env.id,
              status: "ARMED",
              expiresAt: { gt: env.clock },
              OR: [
                { targetKind: "next" },
                { targetKind: "purchase", targetId: p.id },
                { targetKind: "merchant", targetId: product.merchantId },
                { targetKind: "resource", targetId: p.productId },
                { targetKind: "signing", targetId: "eip3009" },
              ],
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          });
    failureContext = { attackId: attack?.id, original };
    const attacker = await tx.labWallet.findUniqueOrThrow({
      where: {
        environmentId_role: { environmentId: env.id, role: "attacker" },
      },
    });
    let modified = attack
      ? mutate(
          attack.category as Category,
          original,
          attack.config,
          attacker.address,
        )
      : structuredClone(original);
    failureContext.modified = modified;
    if (attack) {
      await tx.labPurchase.update({
        where: { id: p.id },
        data: { attackId: attack.id },
      });
      await tx.labAttack.update({
        where: { id: attack.id },
        data: {
          status: "TRIGGERED",
          triggeredPurchaseId: p.id,
          original,
          modified,
        },
      });
      await emit(
        tx,
        env.id,
        "RED_TEAM_MUTATION_APPLIED",
        "attack-engine",
        {
          category: attack.category,
          injectionStage: attack.injectionStage,
          originalDigest: digest(original),
          modifiedDigest: digest(modified),
        },
        p.id,
        attack.id,
      );
      await tx.labAttack.update({
        where: { id: attack.id },
        data: { status: "EVALUATING" },
      });
    }
    const attempt = await tx.labAttempt.create({
      data: {
        environmentId: env.id,
        purchaseId: p.id,
        attackId: attack?.id,
        key,
        state: "EVALUATING",
        original,
        modified,
        headers: {
          "PAYMENT-REQUIRED": encodePaymentRequiredHeader(
            modified.requirements,
          ),
        },
        createdAt: env.clock,
      },
    });
    await emit(
      tx,
      env.id,
      "GUARDIAN_EVALUATION_STARTED",
      "guardian",
      { policyVersion: RULES },
      p.id,
      attempt.id,
    );
    let c = await context(tx, p, modified);
    const checked = await decision(tx, p, attempt, c, "GUARDIAN");
    const baseline = env.kind === "BASELINE";
    if (checked.decision === "BLOCK" && !baseline) {
      await block(tx, p, attempt, checked.failed, "GUARDIAN");
    } else {
      if (baseline)
        await emit(
          tx,
          env.id,
          "ISOLATED_VULNERABLE_BASELINE_BYPASS",
          "fixture",
          {
            warning:
              "APPLICATION AUTHORIZATION CHECKS AND SIGNER BINDING DELIBERATELY BYPASSED IN THIS ISOLATED TEST ONLY",
            failedRules: checked.failed,
          },
          p.id,
        );
      if (attack?.category === "toctou") {
        modified = structuredClone(modified);
        modified.requirements.accepts[0].payTo =
          (attack.config as any).recipient || attacker.address;
        if ((attack.config as any).attemptedAmount)
          modified.requirements.accepts[0].amount = (
            attack.config as any
          ).attemptedAmount;
        await tx.labAttempt.update({
          where: { id: attempt.id },
          data: { modified },
        });
        await tx.labAttack.update({
          where: { id: attack.id },
          data: { modified },
        });
        await emit(
          tx,
          env.id,
          "SIGNING_PAYLOAD_SWITCHED_AFTER_GUARDIAN",
          "test-integration",
          { before: checked.binding, after: digest(modified) },
          p.id,
          attack.id,
        );
      }
      c = await context(tx, p, modified);
      const signerCheck = await decision(
        tx,
        p,
        attempt,
        c,
        "SIGNER",
        checked.binding,
      );
      if (signerCheck.decision === "BLOCK" && !baseline) {
        await block(
          tx,
          p,
          { ...attempt, modified },
          signerCheck.failed,
          "SIGNER",
        );
      } else {
        const { signed } = await sign(
          tx,
          env.id,
          p,
          attempt,
          c,
          checked.binding,
          baseline,
        );
        if (!signed) throw new Error("Signer rejected a request unexpectedly");
        let payload = signed.payload as any;
        if (attack?.category === "invalid-signature") {
          payload = structuredClone(payload);
          payload.payload.signature =
            "0x" +
            (payload.payload.signature.slice(2, 4) === "00" ? "01" : "00") +
            payload.payload.signature.slice(4);
        }
        const transport = encodePaymentSignatureHeader(payload);
        const headers = {
          ...q.headers,
          "PAYMENT-REQUIRED": encodePaymentRequiredHeader(
            modified.requirements,
          ),
          "PAYMENT-SIGNATURE": transport,
        };
        await tx.labAttempt.update({
          where: { id: attempt.id },
          data: { headers, modified },
        });
        await settle(
          tx,
          p,
          attempt,
          signed,
          decodePaymentSignatureHeader(transport),
          attack?.category || undefined,
        );
      }
    }
    const end = await tx.labEnvironment.findUniqueOrThrow({
      where: { id: env.id },
    });
    await tx.labAttempt.update({
      where: { id: attempt.id },
      data: { latency: end.clock - env.clock },
    });
    const current = await tx.labAttempt.findUniqueOrThrow({
      where: { id: attempt.id },
    });
    if (attack) {
      const summary = await attackOutcome(tx, p, current, attack);
      if (summary.objectiveAchieved)
        await incident(tx, p, current, "UNAUTHORIZED_BASELINE_TRANSFER", {
          approved: p.trusted,
          attempted: modified,
          result: summary,
          simulation: true,
        });
      await tx.labAttack.update({
        where: { id: attack.id },
        data: {
          status: ["duplicate", "micro-drain", "race"].includes(attack.category)
            ? "EVALUATING"
            : "COMPLETED",
          result: summary,
        },
      });
      await emit(
        tx,
        env.id,
        ["duplicate", "micro-drain", "race"].includes(attack.category)
          ? "ATTACK_PRIMARY_PHASE_COMPLETED"
          : "ATTACK_COMPLETED",
        "red-team-runner",
        summary,
        p.id,
        attack.id,
      );
    }
    return tx.labAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
  }).catch(async (error) => {
    if (error instanceof AppError && error.status < 500) throw error;
    // A failed DB transaction cannot retain its own trace. Record the actual rollback in a fresh transaction.
    try {
      await locked(known.environmentId, async (tx) => {
        const env = await owned(known.environmentId, scope, tx);
        const current = await tx.labPurchase.findUniqueOrThrow({
          where: { id: purchaseId },
        });
        const committed =
          !!current.transactionId ||
          !!(await tx.labSigning.findFirst({ where: { purchaseId } }));
        if (!committed) {
          await tx.labPurchase.update({
            where: { id: purchaseId },
            data: {
              state: "FAILED",
              error:
                "Simulation execution failed and rolled back before signing or settlement",
            },
          });
          await tx.labAuthorization.updateMany({
            where: { purchaseId, status: "ACTIVE" },
            data: { status: "REVOKED" },
          });
          await tx.labAttempt.upsert({
            where: { purchaseId_key: { purchaseId, key } },
            create: {
              environmentId: env.id,
              purchaseId,
              key,
              attackId: failureContext?.attackId,
              state: "FAILED",
              original: failureContext?.original || {},
              modified: failureContext?.modified || {},
              headers: {},
              result: {
                executionFailure: true,
                transactionRolledBack: true,
                signing: "NOT_SIGNED",
                settlement: "NOT_SUBMITTED",
                walletImpact: "0",
              },
              createdAt: env.clock,
            },
            update: {},
          });
          if (failureContext?.attackId)
            await tx.labAttack.updateMany({
              where: {
                id: failureContext.attackId,
                environmentId: env.id,
                status: { in: ["ARMED", "EVALUATING", "TRIGGERED"] },
              },
              data: {
                status: "FAILED",
                original: failureContext.original,
                modified: failureContext.modified || {},
                result: {
                  executionFailure: true,
                  guardianDecision: "NOT_COMPLETED",
                  transactionRolledBack: true,
                  objectiveAchieved: false,
                },
              },
            });
        }
        await emit(
          tx,
          env.id,
          committed
            ? "SIMULATION_EXECUTION_RECONCILIATION_REQUIRED"
            : "SIMULATION_EXECUTION_FAILED",
          "engine",
          {
            errorClass: error?.name || "Error",
            transactionRolledBack: !committed,
            financialRecordsCommitted: committed,
            additionalSigningAllowed: false,
          },
          purchaseId,
          failureContext?.attackId,
        );
      });
    } catch {
      /* Database outages cannot be honestly reported as persisted evidence. Never fabricate a result. */
    }
    throw error;
  });
}
async function settle(
  tx: Tx,
  p: any,
  attempt: any,
  signed: any,
  payload: any,
  fault?: string,
) {
  const env = await tx.labEnvironment.findUniqueOrThrow({
    where: { id: p.environmentId },
  });
  const buyer = (p.trusted as any).buyer;
  let verification: any = await verifyPayload(payload, buyer, env.clock);
  const balance = await amount(tx, env.id, "buyer");
  if (verification.isValid && balance < BigInt(payload.accepted.amount))
    verification = { isValid: false, reason: "INSUFFICIENT_VIRTUAL_USDC" };
  if (fault === "facilitator-rejection")
    verification = {
      isValid: false,
      reason: "EXPLICIT_FACILITATOR_REJECTION_FIXTURE",
    };
  if (
    verification.isValid &&
    (await amount(tx, env.id, "facilitator", "ETH")) < GAS * FEE
  )
    verification = {
      isValid: false,
      reason: "INSUFFICIENT_VIRTUAL_FACILITATOR_GAS",
    };
  const prior = await tx.labNonce.findUnique({
    where: {
      environmentId_authorizer_nonce: {
        environmentId: env.id,
        authorizer: buyer,
        nonce: signed.nonce,
      },
    },
  });
  if (prior)
    verification = {
      isValid: false,
      reason: "AUTHORIZATION_NONCE_ALREADY_USED",
    };
  if (
    digest(payload) !== digest(signed.payload) &&
    fault !== "invalid-signature"
  )
    verification = {
      isValid: false,
      reason: "SIGNATURE_TRANSPORT_BINDING_MISMATCH",
    };
  await tx.labAttempt.update({
    where: { id: attempt.id },
    data: { verification },
  });
  await emit(
    tx,
    env.id,
    "FACILITATOR_VERIFIED",
    "facilitator",
    verification,
    p.id,
    attempt.id,
  );
  if (!verification.isValid) {
    const incidentId = await incident(
      tx,
      p,
      attempt,
      "FACILITATOR_REJECTED",
      verification,
    );
    await tx.labAttempt.update({
      where: { id: attempt.id },
      data: {
        state: "FAILED",
        result: {
          decision: "ALLOW",
          signing: "TEST_ONLY_SIGNED",
          settlement: "REJECTED",
          walletImpact: "0",
          incidentId,
        },
      },
    });
    if (!p.transactionId)
      await tx.labPurchase.update({
        where: { id: p.id },
        data: { state: "FAILED", error: verification.reason },
      });
    return;
  }
  const pending = fault === "facilitator-timeout";
  const record = await tx.labSettlement.create({
    data: {
      id: signed.id + ":settlement",
      environmentId: env.id,
      purchaseId: p.id,
      attemptId: attempt.id,
      signingId: signed.id,
      state: pending ? "PENDING" : "VERIFIED",
      verification,
      response: { simulation: true, pending },
    },
  });
  if (pending) {
    const review = await tx.labDecision.create({
      data: {
        environmentId: env.id,
        purchaseId: p.id,
        attemptId: attempt.id,
        stage: "SETTLEMENT_RECONCILIATION",
        decision: "REVIEW",
        ruleVersion: RULES,
        binding: digest(payload),
        createdAt: env.clock,
      },
    });
    await tx.labRuleResult.create({
      data: {
        decisionId: review.id,
        ruleId: "SETTLEMENT_EVIDENCE_PENDING",
        version: RULES,
        status: "NOT_APPLICABLE",
        evaluated: {
          facilitatorTimedOut: true,
          settlementState: "PENDING",
          confirmedTransaction: null,
        },
        expected: { settlementState: "SETTLED", verifiedReceiptRequired: true },
        explanation:
          "Authorization checks passed, but settlement evidence is incomplete. Require reconciliation; never sign or submit an additional payment.",
        evidenceRef: record.id,
      },
    });
    await emit(
      tx,
      env.id,
      "GUARDIAN_REVIEW_REQUIRED",
      "guardian",
      {
        decision: "REVIEW",
        settlementId: record.id,
        additionalSigningAllowed: false,
      },
      p.id,
      review.id,
    );
    await tx.labPurchase.update({
      where: { id: p.id },
      data: {
        state: "PENDING",
        error:
          "Simulated facilitator timeout; reconciliation required, no resubmission",
      },
    });
    await tx.labAttempt.update({
      where: { id: attempt.id },
      data: {
        state: "PENDING",
        result: {
          decision: "ALLOW",
          signing: "TEST_ONLY_SIGNED",
          settlement: "PENDING",
          walletImpact: "0",
        },
      },
    });
    await emit(
      tx,
      env.id,
      "SETTLEMENT_STATUS_UNCERTAIN",
      "facilitator",
      { simulation: true, transferExecuted: false },
      p.id,
      record.id,
    );
    return;
  }
  await completeSettlement(
    tx,
    p,
    attempt,
    signed,
    payload,
    record,
    fault === "settlement-failure",
    fault === "rpc-failure",
  );
}
async function completeSettlement(
  tx: Tx,
  p: any,
  attempt: any,
  signed: any,
  payload: any,
  record: any,
  revert = false,
  skipIndex = false,
) {
  const t = await transfer(
    tx,
    p.environmentId,
    "buyer",
    payload.accepted.payTo,
    payload.accepted.amount,
    signed.id,
    "EIP3009_TRANSFER_WITH_AUTHORIZATION",
    p.id,
    payload,
    revert,
  );
  const response = {
    success: !revert,
    transaction: t.reference,
    network: NETWORK,
    payer: payload.payload.authorization.from,
    extensions: {
      simulation: {
        engine: ENGINE,
        referenceKind: "SIMULATION_IDENTIFIER_NOT_PUBLIC_TRANSACTION",
        blockchain: "in-process virtual ledger",
      },
    },
  };
  await tx.labSettlement.update({
    where: { id: record.id },
    data: {
      state: revert ? "FAILED" : "SETTLED",
      transactionId: t.id,
      response,
    },
  });
  const state = revert ? "FAILED" : "COMPLETED";
  await tx.labAttempt.update({
    where: { id: attempt.id },
    data: {
      state,
      result: {
        decision: "ALLOW",
        signing: "TEST_ONLY_SIGNED",
        settlement: revert ? "REVERTED" : "SETTLED",
        walletImpact: revert ? "0" : payload.accepted.amount,
        transactionReference: t.reference,
      },
      headers: {
        ...(attempt.headers as any),
        "PAYMENT-SIGNATURE": encodePaymentSignatureHeader(payload),
        "PAYMENT-RESPONSE": encodePaymentResponseHeader(response as any),
      },
    },
  });
  await tx.labPurchase.update({
    where: { id: p.id },
    data: {
      state,
      transactionId: t.id,
      attackId: attempt.attackId,
      error: revert
        ? "Virtual transaction reverted; only facilitator gas was charged"
        : null,
      updatedAt: t.timestamp,
    },
  });
  if (!revert) {
    await tx.labNonce.create({
      data: {
        id: signed.id + ":nonce",
        environmentId: p.environmentId,
        signingId: signed.id,
        authorizer: payload.payload.authorization.from,
        nonce: signed.nonce,
      },
    });
    await tx.labAuthorization.update({
      where: { id: signed.authorizationId },
      data: { status: "CONSUMED" },
    });
    await emit(
      tx,
      p.environmentId,
      "RESOURCE_DELIVERED",
      "merchant",
      {
        productId: p.productId,
        transactionReference: t.reference,
        contentDigest: digest((p.trusted as any).productContent),
        simulation: true,
      },
      p.id,
      t.id,
    );
  }
  if (skipIndex)
    await emit(
      tx,
      p.environmentId,
      "INDEXER_SIMULATED_FAILURE",
      "indexer",
      { checkpointAdvanced: false, source: "explicit isolated fixture" },
      p.id,
    );
  else await index(tx, p.environmentId);
  await emit(
    tx,
    p.environmentId,
    revert ? "PAYMENT_FAILED" : "PAYMENT_SUCCESSFUL",
    "orchestrator",
    {
      transactionReference: t.reference,
      blockNumber: (
        await tx.labBlock.findUniqueOrThrow({ where: { id: t.blockId } })
      ).number,
      simulation: true,
    },
    p.id,
    t.id,
  );
}
async function attackOutcome(tx: Tx, p: any, attempt: any, attack: any) {
  const signings = await tx.labSigning.findMany({
    where: { attemptId: attempt.id },
  });
  const transaction = await tx.labTransaction.findFirst({
    where: { purchaseId: p.id, status: "SUCCESS" },
    orderBy: { timestamp: "desc" },
  });
  const trusted = p.trusted as any;
  const unauthorized =
    !!transaction &&
    (transaction.tokenRecipient.toLowerCase() !==
      trusted.recipient.toLowerCase() ||
      BigInt(transaction.tokenAmount) > BigInt(trusted.amount));
  const signingUnauthorized = signings.some((s) => {
    const r = (s.payload as any).accepted;
    return (
      r.payTo.toLowerCase() !== trusted.recipient.toLowerCase() ||
      r.amount !== trusted.amount
    );
  });
  return {
    attackCategory: attack.category,
    delivered: true,
    guardianDecision: (attempt.result as any)?.decision || "UNKNOWN",
    signingResult: signings.length ? "TEST_ONLY_SIGNED" : "NOT_SIGNED",
    settlementResult: (attempt.result as any)?.settlement || "NONE",
    financialImpact: unauthorized ? transaction!.tokenAmount : "0",
    objectiveAchieved: unauthorized || signingUnauthorized,
    unauthorizedSignatures: signingUnauthorized ? 1 : 0,
    unauthorizedSettlements: unauthorized ? 1 : 0,
    legitimatePaymentCompleted: !!transaction && !unauthorized,
    ineffectivePrompt: attack.category === "prompt-injection" && !unauthorized,
    latencyVirtualMs: attempt.latency,
    evidence: {
      attemptId: attempt.id,
      transactionReference: transaction?.reference || null,
    },
    reproduction: { category: attack.category, config: attack.config },
  };
}
export async function approveAndExecute(scope: Scope, id: string) {
  await authorize(scope, id);
  const before = await db.labPurchase.findUniqueOrThrow({ where: { id } });
  const trusted = before.trusted as any;
  const pending = before.attackId
    ? null
    : await db.labAttack.findFirst({
        where: {
          environmentId: before.environmentId,
          status: "ARMED",
          OR: [
            { targetKind: "next" },
            { targetKind: "purchase", targetId: id },
            { targetKind: "resource", targetId: before.productId },
            { targetKind: "merchant", targetId: trusted.merchantId },
            { targetKind: "signing", targetId: "eip3009" },
          ],
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
  const dispatchedRace = pending?.category === "race";
  if (dispatchedRace)
    await Promise.all(
      Array.from({ length: (pending.config as any).count || 8 }, (_, n) =>
        processPurchase(scope, id, n === 0 ? "approve" : "concurrent-" + n),
      ),
    );
  else await processPurchase(scope, id);
  const p = await db.labPurchase.findUniqueOrThrow({ where: { id } });
  const attack = await db.labAttack.findFirst({
    where: {
      triggeredPurchaseId: id,
      category: { in: ["duplicate", "race", "micro-drain"] },
    },
    orderBy: { createdAt: "desc" },
  });
  if (attack) {
    const count = (attack.config as any).count || 4;
    const actions = Array.from(
      { length: count - 1 },
      (_, n) => () => processPurchase(scope, id, "adversarial-retry-" + n),
    );
    if (attack.category === "race" && !dispatchedRace)
      await Promise.all(actions.map((f) => f()));
    else if (dispatchedRace) {
      /* Concurrent attempts already completed under database reservations. */
    } else for (const action of actions) await action();
    await locked(p.environmentId, async (tx) => {
      await emit(
        tx,
        p.environmentId,
        "ADDITIONAL_PAYMENT_ATTEMPTS_COMPLETED",
        "attack-engine",
        { category: attack.category, attempts: count, automatic: true },
        id,
        attack.id,
      );
      const attempts = await tx.labAttempt.findMany({
        where: { purchaseId: id },
      });
      await emit(
        tx,
        p.environmentId,
        "ATTACK_COMPLETED",
        "red-team-runner",
        {
          category: attack.category,
          attemptCount: attempts.length,
          blockedRetries: attempts.filter((a) => a.state === "BLOCKED").length,
          extraCharges: 0,
        },
        id,
        attack.id,
      );
      await tx.labAttack.update({
        where: { id: attack.id },
        data: {
          status: "COMPLETED",
          result: {
            ...(attack.result as any),
            additionalAttempts: attempts.length - 1,
            retryDecisions: attempts.slice(1).map((a) => a.result),
            objectiveAchieved: false,
            guardianDecision: attempts.some((a) => a.state === "BLOCKED")
              ? "BLOCK"
              : (attack.result as any).guardianDecision,
          },
        },
      });
    });
  }
  return inspectPurchase(scope, id);
}
export async function inspectPurchase(scope: Scope, id: string) {
  const p = await db.labPurchase.findUniqueOrThrow({ where: { id } });
  await owned(p.environmentId, scope);
  return {
    ...p,
    simulation: true,
    authorization: await db.labAuthorization.findUnique({
      where: { purchaseId: id },
    }),
    attempts: await db.labAttempt.findMany({
      where: { purchaseId: id },
      orderBy: { createdAt: "asc" },
    }),
    decisions: await Promise.all(
      (
        await db.labDecision.findMany({
          where: { purchaseId: id },
          orderBy: { createdAt: "asc" },
        })
      ).map(async (d) => ({
        ...d,
        rules: await db.labRuleResult.findMany({ where: { decisionId: d.id } }),
      })),
    ),
    signings: await db.labSigning.findMany({ where: { purchaseId: id } }),
    settlements: await db.labSettlement.findMany({ where: { purchaseId: id } }),
    attacks: await db.labAttack.findMany({
      where: { environmentId: p.environmentId, triggeredPurchaseId: id },
    }),
    transactions: await Promise.all(
      (await db.labTransaction.findMany({ where: { purchaseId: id } })).map(
        async (t) => {
          const block = await db.labBlock.findUniqueOrThrow({
            where: { id: t.blockId },
          });
          return {
            ...t,
            blockNumber: block.number,
            blockHash: block.hash,
            execution: await db.labExecution.findUnique({
              where: { transactionId: t.id },
            }),
          };
        },
      ),
    ),
    incidents: await db.labIncident.findMany({ where: { purchaseId: id } }),
    events: await db.labEvent.findMany({
      where: { environmentId: p.environmentId, purchaseId: id },
      orderBy: { sequence: "asc" },
    }),
  };
}
export async function cancel(scope: Scope, id: string) {
  const p = await db.labPurchase.findUniqueOrThrow({ where: { id } });
  await locked(p.environmentId, async (tx) => {
    await owned(p.environmentId, scope, tx);
    const current = await tx.labPurchase.findUniqueOrThrow({ where: { id } });
    if (current.state !== "AWAITING_APPROVAL")
      throw new AppError(
        409,
        "TOO_LATE_TO_CANCEL",
        "Only an unapproved purchase can be rejected",
      );
    await tx.labPurchase.update({ where: { id }, data: { state: "CANCELED" } });
    await emit(
      tx,
      p.environmentId,
      "USER_REJECTED_PURCHASE",
      "user",
      { signed: false, walletImpact: "0" },
      id,
    );
  });
  return inspectPurchase(scope, id);
}
export async function reconcile(scope: Scope, id: string) {
  const p = await db.labPurchase.findUniqueOrThrow({ where: { id } });
  await locked(p.environmentId, async (tx) => {
    const env = await owned(p.environmentId, scope, tx),
      record = await tx.labSettlement.findFirst({
        where: { purchaseId: id, state: "PENDING" },
      });
    if (!record) return;
    const signed = await tx.labSigning.findUniqueOrThrow({
        where: { id: record.signingId },
      }),
      attempt = await tx.labAttempt.findUniqueOrThrow({
        where: { id: record.attemptId },
      });
    const c = await context(tx, p, attempt.modified, true);
    if (evaluateRules(c).decision !== "ALLOW")
      throw new AppError(
        409,
        "REVALIDATION_REQUIRED",
        "Pending authorization no longer satisfies policy",
      );
    const verification = await verifyPayload(
      signed.payload,
      (p.trusted as any).buyer,
      env.clock,
    );
    if (!verification.isValid)
      throw new AppError(409, "AUTHORIZATION_EXPIRED", verification.reason);
    await completeSettlement(tx, p, attempt, signed, signed.payload, record);
    await emit(
      tx,
      p.environmentId,
      "PENDING_SETTLEMENT_RECONCILED",
      "facilitator",
      { newSignature: false },
      p.id,
      record.id,
    );
  });
  return inspectPurchase(scope, id);
}
