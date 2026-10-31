import crypto from 'node:crypto';
import type {
  ApprovalSnapshot,
  PurchaseIntent,
  GuardianDecision,
  GuardianOutcome,
  GuardianReasonCode,
  GuardianRuleResult,
  ExecutionPermit,
  UserBudgetSummary,
  SpendingReservation,
  CanonicalTerms,
} from '@x402/shared';
import { evaluateGuardianPolicy } from './policyEvaluator.js';
import { reserveSpendingBudget, type BudgetReservationResult } from './reservationService.js';
import { generateExecutionPermit } from './authorizationService.js';
import { recordGuardianDecision } from './decisionRepository.js';

export interface GuardianEvaluationParams {
  userId: string;
  intent: PurchaseIntent;
  snapshot: ApprovalSnapshot;
  paymentExecutionId: string;
  fencingToken: number;
  taskId?: string | undefined;
  proposedPayment?: {
    amount?: string | undefined;
    recipientAddress?: string | undefined;
    networkIdentifier?: string | undefined;
    assetIdentifier?: string | undefined;
    scheme?: string | undefined;
  } | undefined;
  now?: Date | undefined;
  appEnv?: string | undefined;
  correlationId?: string | undefined;
}

export interface GuardianExecutionGateResult {
  allowed: boolean;
  outcome: GuardianOutcome;
  reasonCode: GuardianReasonCode;
  reason: string;
  userFacingExplanation: string;
  permit?: ExecutionPermit;
  reservation?: SpendingReservation;
  decision: GuardianDecision;
  rulesEvaluated: GuardianRuleResult[];
  budgetSummary?: UserBudgetSummary;
  canonicalTerms: CanonicalTerms;
}

/**
 * Blue Team Guardian Engine for Phase 4.
 *
 * Orchestrates deterministic policy evaluation, atomic budget reservations,
 * cryptographic execution permit generation, and explainable decision persistence.
 */
export class GuardianEngine {
  private readonly db: any;
  private readonly appEnv: string;

  constructor(db: any, appEnv = 'development') {
    this.db = db;
    this.appEnv = appEnv;
  }

  /**
   * Main gate: Evaluates a proposed payment execution, reserves budget, and issues an execution permit.
   */
  async evaluateAndAuthorize(params: GuardianEvaluationParams): Promise<GuardianExecutionGateResult> {
    const now = params.now || new Date();
    const correlationId = params.correlationId || `corr_${crypto.randomUUID()}`;

    // 1. Pure Deterministic Policy Evaluation
    const pureResult = evaluateGuardianPolicy({
      userId: params.userId,
      intent: params.intent,
      snapshot: params.snapshot,
      proposedPayment: params.proposedPayment,
      now,
      appEnv: this.appEnv,
    });

    if (pureResult.outcome === 'BLOCK') {
      const decision = await recordGuardianDecision(this.db, {
        userId: params.userId,
        purchaseIntentId: params.intent.id,
        approvalSnapshotId: params.snapshot?.id,
        paymentExecutionId: params.paymentExecutionId,
        outcome: 'BLOCK',
        reasonCode: pureResult.reasonCode,
        reason: pureResult.reason,
        riskScore: pureResult.riskScore,
        rulesEvaluated: pureResult.rulesEvaluated,
        canonicalTerms: pureResult.canonicalTerms,
        proposedTerms: pureResult.proposedTerms,
        correlationId,
      });

      return {
        allowed: false,
        outcome: 'BLOCK',
        reasonCode: pureResult.reasonCode,
        reason: pureResult.reason,
        userFacingExplanation: pureResult.userFacingExplanation,
        decision,
        rulesEvaluated: pureResult.rulesEvaluated,
        canonicalTerms: pureResult.canonicalTerms,
      };
    }

    // 2. Stateful Atomic Spending Reservation (under row-level locking)
    const effectiveAmount = params.proposedPayment?.amount || params.snapshot.exactAmount;
    const effectiveAsset = params.proposedPayment?.assetIdentifier || params.snapshot.assetIdentifier;
    const effectiveNetwork = params.proposedPayment?.networkIdentifier || params.snapshot.networkIdentifier;

    let reservationResult: BudgetReservationResult;
    try {
      reservationResult = await reserveSpendingBudget(this.db, {
        userId: params.userId,
        purchaseIntentId: params.intent.id,
        paymentExecutionId: params.paymentExecutionId,
        taskId: params.taskId || params.intent.id,
        assetIdentifier: effectiveAsset,
        networkIdentifier: effectiveNetwork,
        amount: effectiveAmount,
        now,
      });
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : 'Database error during budget reservation';
      pureResult.rulesEvaluated.push({
        ruleId: 'BUDGET_RESERVATION_TX',
        ruleName: 'Atomic Budget Reservation',
        passed: false,
        reason: errMessage,
      });

      const decision = await recordGuardianDecision(this.db, {
        userId: params.userId,
        purchaseIntentId: params.intent.id,
        approvalSnapshotId: params.snapshot.id,
        paymentExecutionId: params.paymentExecutionId,
        outcome: 'BLOCK',
        reasonCode: 'INFRASTRUCTURE_ERROR',
        reason: errMessage,
        riskScore: 50,
        rulesEvaluated: pureResult.rulesEvaluated,
        canonicalTerms: pureResult.canonicalTerms,
        proposedTerms: pureResult.proposedTerms,
        correlationId,
      });

      return {
        allowed: false,
        outcome: 'BLOCK',
        reasonCode: 'INFRASTRUCTURE_ERROR',
        reason: errMessage,
        userFacingExplanation: 'A system error occurred during budget verification. Payment safely prevented.',
        decision,
        rulesEvaluated: pureResult.rulesEvaluated,
        canonicalTerms: pureResult.canonicalTerms,
      };
    }

    if (!reservationResult.success || !reservationResult.reservation) {
      const code = reservationResult.reasonCode || 'BUDGET_EXCEEDED_DAILY';
      const reasonMsg = reservationResult.errorMessage || 'Spending budget limit exceeded.';

      pureResult.rulesEvaluated.push({
        ruleId: 'BUDGET_LIMIT_CHECK',
        ruleName: 'Spending Budget Policy Limit',
        passed: false,
        reason: reasonMsg,
        details: {
          limitAmount: reservationResult.budgetSummary?.dailyLimitAmount,
          availableAmount: reservationResult.budgetSummary?.availableAmount,
          proposedAmount: effectiveAmount,
        },
      });

      const decision = await recordGuardianDecision(this.db, {
        userId: params.userId,
        purchaseIntentId: params.intent.id,
        approvalSnapshotId: params.snapshot.id,
        paymentExecutionId: params.paymentExecutionId,
        policyVersion: reservationResult.budgetSummary.policyVersion,
        outcome: 'BLOCK',
        reasonCode: code,
        reason: reasonMsg,
        riskScore: 70,
        rulesEvaluated: pureResult.rulesEvaluated,
        canonicalTerms: pureResult.canonicalTerms,
        proposedTerms: pureResult.proposedTerms,
        correlationId,
      });

      return {
        allowed: false,
        outcome: 'BLOCK',
        reasonCode: code,
        reason: reasonMsg,
        userFacingExplanation: reasonMsg,
        decision,
        rulesEvaluated: pureResult.rulesEvaluated,
        budgetSummary: reservationResult.budgetSummary,
        canonicalTerms: pureResult.canonicalTerms,
      };
    }

    pureResult.rulesEvaluated.push({
      ruleId: 'BUDGET_LIMIT_CHECK',
      ruleName: 'Spending Budget Policy Limit',
      passed: true,
      reason: 'Transaction is within single-payment, task, and daily UTC budget limits.',
      details: {
        dailyLimit: reservationResult.budgetSummary.dailyLimitAmount,
        settled: reservationResult.budgetSummary.settledAmount,
        reserved: reservationResult.budgetSummary.reservedAmount,
        available: reservationResult.budgetSummary.availableAmount,
      },
    });

    // 3. Generate Cryptographic Execution Permit
    const permit = generateExecutionPermit({
      executionId: params.paymentExecutionId,
      intentId: params.intent.id,
      snapshotId: params.snapshot.id,
      approvalVersion: params.snapshot.approvalVersion,
      policyId: reservationResult.budgetSummary.policyId,
      policyVersion: reservationResult.budgetSummary.policyVersion,
      reservationId: reservationResult.reservation.id,
      fencingToken: params.fencingToken,
      recipientAddress: params.snapshot.trustedRecipientAddress,
      amount: params.snapshot.exactAmount,
      assetIdentifier: params.snapshot.assetIdentifier,
      networkIdentifier: params.snapshot.networkIdentifier,
      snapshotExpiresAt: params.snapshot.expiresAt,
      now,
    });

    pureResult.rulesEvaluated.push({
      ruleId: 'EXECUTION_PERMIT_ISSUED',
      ruleName: 'Cryptographic Execution Permit',
      passed: true,
      reason: 'Narrow HMAC execution permit issued, binding decision to execution state and signer.',
      details: {
        permitId: permit.permitId,
        reservationId: permit.reservationId,
        fencingToken: permit.fencingToken,
        expiresAt: permit.expiresAt,
      },
    });

    // 4. Persist Decision Record with Outcome ALLOW
    const decision = await recordGuardianDecision(this.db, {
      userId: params.userId,
      purchaseIntentId: params.intent.id,
      approvalSnapshotId: params.snapshot.id,
      paymentExecutionId: params.paymentExecutionId,
      reservationId: reservationResult.reservation.id,
      permitId: permit.permitId,
      policyVersion: reservationResult.budgetSummary.policyVersion,
      outcome: 'ALLOW',
      reasonCode: 'AUTHORIZED',
      reason: 'All deterministic security rules, terms verification, and spending limits validated successfully.',
      riskScore: 0,
      rulesEvaluated: pureResult.rulesEvaluated,
      canonicalTerms: pureResult.canonicalTerms,
      proposedTerms: pureResult.proposedTerms,
      correlationId,
    });

    return {
      allowed: true,
      outcome: 'ALLOW',
      reasonCode: 'AUTHORIZED',
      reason: 'Purchase authorization validated successfully.',
      userFacingExplanation: 'Purchase authorization validated. Ready for simulated execution.',
      permit,
      reservation: reservationResult.reservation,
      decision,
      rulesEvaluated: pureResult.rulesEvaluated,
      budgetSummary: reservationResult.budgetSummary,
      canonicalTerms: pureResult.canonicalTerms,
    };
  }
}
