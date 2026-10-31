export type GuardianOutcome = 'ALLOW' | 'BLOCK';

export type GuardianDecisionResult = 'allow' | 'block' | 'require_reapproval';

export type GuardianReasonCode =
  | 'AUTHORIZED'
  | 'OWNER_MISMATCH'
  | 'SNAPSHOT_MISSING'
  | 'SNAPSHOT_EXPIRED'
  | 'SNAPSHOT_SUPERSEDED'
  | 'VERSION_MISMATCH'
  | 'INTENT_NOT_APPROVED'
  | 'AMOUNT_MISMATCH'
  | 'RECIPIENT_MISMATCH'
  | 'TERMS_MISMATCH'
  | 'UNSUPPORTED_EXECUTION_COMBINATION'
  | 'UNSUPPORTED_SCHEME'
  | 'BUDGET_EXCEEDED_PER_PAYMENT'
  | 'BUDGET_EXCEEDED_PER_TASK'
  | 'BUDGET_EXCEEDED_DAILY'
  | 'DUPLICATE_SETTLEMENT'
  | 'KILL_SWITCH_ACTIVE'
  | 'PRODUCTION_REFUSAL'
  | 'STALE_WORKER_FENCING_TOKEN'
  | 'PERMIT_INVALID'
  | 'PERMIT_EXPIRED'
  | 'AUTHENTICATION_REQUIRED'
  | 'ADMIN_REQUIRED'
  | 'INFRASTRUCTURE_ERROR';

export interface GuardianRuleResult {
  ruleId: string;
  ruleName: string;
  passed: boolean;
  score?: number | undefined;
  reason: string;
  details?: Record<string, unknown> | undefined;
}

export interface SpendingPolicy {
  id: string;
  userId?: string | null | undefined;
  policyVersion: number;
  assetIdentifier: string;
  networkIdentifier: string;
  maxAmountPerPayment: string;
  maxAmountPerTask: string;
  maxAmountPerDailyWindow: string;
  dailyWindowSeconds: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type SpendingReservationStatus = 'RESERVED' | 'COMMITTED' | 'RELEASED';

export interface SpendingReservation {
  id: string;
  userId: string;
  purchaseIntentId: string;
  paymentExecutionId?: string | null | undefined;
  policyId: string;
  policyVersion: number;
  assetIdentifier: string;
  networkIdentifier: string;
  amount: string;
  reservationStatus: SpendingReservationStatus;
  taskId?: string | null | undefined;
  windowStartedAt: string;
  windowExpiresAt: string;
  releaseReason?: string | null | undefined;
  committedAt?: string | null | undefined;
  releasedAt?: string | null | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionPermit {
  permitId: string;
  executionId: string;
  intentId: string;
  snapshotId: string;
  approvalVersion: number;
  policyId: string;
  policyVersion: number;
  reservationId: string;
  fencingToken: number;
  recipientAddress: string;
  amount: string;
  assetIdentifier: string;
  networkIdentifier: string;
  issuedAt: string;
  expiresAt: string;
  hmacSignature: string;
}

export interface UserBudgetSummary {
  userId: string;
  policyId: string;
  policyVersion: number;
  assetIdentifier: string;
  networkIdentifier: string;
  currency: string;
  decimals: number;
  dailyLimitAmount: string;
  settledAmount: string;
  reservedAmount: string;
  availableAmount: string;
  paymentLimitAmount: string;
  taskLimitAmount: string;
  windowStartedAt: string;
  windowExpiresAt: string;
  resetAtUtc: string;
}

export interface CanonicalTerms {
  userId: string;
  intentId: string;
  intentVersion: number;
  snapshotId: string;
  approvalVersion: number;
  amount: string;
  recipient: string;
  network: string;
  asset: string;
  expiresAt: string;
  evaluatedAt?: string | undefined;
}

export interface GuardianDecision {
  id: string;
  purchaseIntentId: string;
  userId?: string | null | undefined;
  approvalSnapshotId?: string | null | undefined;
  paymentExecutionId?: string | null | undefined;
  reservationId?: string | null | undefined;
  permitId?: string | null | undefined;
  policyVersion?: number | undefined;
  outcome?: GuardianOutcome | undefined;
  decision: GuardianDecisionResult;
  reasonCode?: GuardianReasonCode | undefined;
  reason: string;
  riskScore: number;
  rulesEvaluated: GuardianRuleResult[];
  canonicalTerms?: CanonicalTerms | Record<string, unknown> | undefined;
  proposedTerms?: Record<string, unknown> | undefined;
  correlationId?: string | undefined;
  simulated: boolean;
  evaluatedAt: string;
  createdAt: string;
}

export interface GuardianEvaluationRequest {
  purchaseIntentId: string;
  userId: string;
  productId: string;
  merchantId: string;
  amount: string;
  assetIdentifier: string;
  networkIdentifier: string;
  recipientAddress: string;
  userApprovalVersion: number;
}
