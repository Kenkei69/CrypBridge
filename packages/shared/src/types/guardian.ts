export type GuardianDecisionResult = 'allow' | 'block' | 'require_reapproval';

export interface GuardianRuleResult {
  ruleId: string;
  ruleName: string;
  passed: boolean;
  score: number;
  reason: string;
  details?: Record<string, unknown>;
}

export interface GuardianDecision {
  id: string;
  purchaseIntentId: string;
  decision: GuardianDecisionResult;
  reason: string;
  riskScore: number;
  rulesEvaluated: GuardianRuleResult[];
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
