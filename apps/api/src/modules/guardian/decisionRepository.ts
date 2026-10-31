import { eq, and, desc, sql } from 'drizzle-orm';
import type {
  GuardianDecision,
  GuardianOutcome,
  GuardianReasonCode,
  GuardianRuleResult,
  CanonicalTerms,
} from '@x402/shared';
import { guardianDecisions } from '@x402/database/schema';

export interface CreateDecisionParams {
  userId: string;
  purchaseIntentId: string;
  approvalSnapshotId?: string;
  paymentExecutionId?: string;
  reservationId?: string;
  permitId?: string;
  policyVersion?: number;
  outcome: GuardianOutcome;
  reasonCode: GuardianReasonCode;
  reason: string;
  riskScore: number;
  rulesEvaluated: GuardianRuleResult[];
  canonicalTerms: CanonicalTerms | Record<string, unknown>;
  proposedTerms: Record<string, unknown>;
  correlationId?: string;
}

export interface ListDecisionsQuery {
  userId: string;
  outcome?: 'ALLOW' | 'BLOCK' | 'ALL' | undefined;
  purchaseIntentId?: string | undefined;
  paymentExecutionId?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

/**
 * Persists an explainable Guardian security evaluation decision into PostgreSQL.
 */
export async function recordGuardianDecision(
  db: any,
  params: CreateDecisionParams
): Promise<GuardianDecision> {
  const now = new Date();
  const decisionResult = params.outcome === 'ALLOW' ? 'allow' : 'block';

  const [decision] = await db
    .insert(guardianDecisions)
    .values({
      purchaseIntentId: params.purchaseIntentId,
      userId: params.userId,
      approvalSnapshotId: params.approvalSnapshotId || null,
      paymentExecutionId: params.paymentExecutionId || null,
      reservationId: params.reservationId || null,
      permitId: params.permitId || null,
      policyVersion: params.policyVersion || 1,
      outcome: params.outcome,
      reasonCode: params.reasonCode,
      decision: decisionResult,
      reason: params.reason,
      riskScore: params.riskScore,
      rulesEvaluated: params.rulesEvaluated,
      canonicalTerms: params.canonicalTerms,
      proposedTerms: params.proposedTerms,
      correlationId: params.correlationId || null,
      simulated: true,
      evaluatedAt: now,
      createdAt: now,
    })
    .returning();

  return decision;
}

/**
 * Lists user-isolated decisions for the Security History view.
 */
export async function listGuardianDecisions(
  db: any,
  query: ListDecisionsQuery
): Promise<{ decisions: GuardianDecision[]; totalCount: number }> {
  const conditions = [eq(guardianDecisions.userId, query.userId)];

  if (query.outcome && query.outcome !== 'ALL') {
    conditions.push(eq(guardianDecisions.outcome, query.outcome));
  }

  if (query.purchaseIntentId) {
    conditions.push(eq(guardianDecisions.purchaseIntentId, query.purchaseIntentId));
  }

  if (query.paymentExecutionId) {
    conditions.push(eq(guardianDecisions.paymentExecutionId, query.paymentExecutionId));
  }

  const limit = query.limit || 50;
  const offset = query.offset || 0;

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(guardianDecisions)
    .where(and(...conditions));

  const totalCount = countResult?.count || 0;

  const rows = await db
    .select()
    .from(guardianDecisions)
    .where(and(...conditions))
    .orderBy(desc(guardianDecisions.createdAt))
    .limit(limit)
    .offset(offset);

  return {
    decisions: rows,
    totalCount,
  };
}

/**
 * Retrieves a single decision by ID ensuring tenant isolation.
 */
export async function getGuardianDecisionById(
  db: any,
  decisionId: string,
  userId: string
): Promise<GuardianDecision | null> {
  const [decision] = await db
    .select()
    .from(guardianDecisions)
    .where(
      and(
        eq(guardianDecisions.id, decisionId),
        eq(guardianDecisions.userId, userId)
      )
    )
    .limit(1);

  return decision || null;
}
