import {
  type IGuardianEvaluationEngine,
  type GuardianEvaluationRequest,
  type ApprovalSnapshot,
  type GuardianDecision,
  type GuardianRuleResult,
  COMPATIBILITY_MATRIX,
} from '@x402/shared';

export class GuardianEvaluationEngine implements IGuardianEvaluationEngine {
  async evaluate(
    request: GuardianEvaluationRequest,
    snapshot: ApprovalSnapshot
  ): Promise<GuardianDecision> {
    const rulesEvaluated: GuardianRuleResult[] = [];
    let riskScore = 0;

    // Rule 1: Approval Snapshot Integrity Check
    const amountMatches = request.amount === snapshot.exactAmount;
    rulesEvaluated.push({
      ruleId: 'GUARDIAN_001',
      ruleName: 'Approval Snapshot Amount Binding',
      passed: amountMatches,
      score: amountMatches ? 0 : 50,
      reason: amountMatches
        ? 'Proposed payment amount exactly matches user-authorized snapshot'
        : `Amount discrepancy: request=${request.amount}, authorized=${snapshot.exactAmount}`,
    });
    if (!amountMatches) riskScore += 50;

    // Rule 2: Recipient Address Binding
    const recipientMatches =
      request.recipientAddress.toLowerCase() === snapshot.trustedRecipientAddress.toLowerCase();
    rulesEvaluated.push({
      ruleId: 'GUARDIAN_002',
      ruleName: 'Trusted Recipient Address Verification',
      passed: recipientMatches,
      score: recipientMatches ? 0 : 50,
      reason: recipientMatches
        ? 'Recipient address matches verified trusted merchant address'
        : 'Recipient address does not match trusted merchant binding',
    });
    if (!recipientMatches) riskScore += 50;

    // Rule 3: Network Compatibility Matrix Verification
    const isSupportedNetwork = COMPATIBILITY_MATRIX.networks.some(
      (net) => net.id === request.networkIdentifier
    );
    rulesEvaluated.push({
      ruleId: 'GUARDIAN_003',
      ruleName: 'Network Compatibility Matrix Verification',
      passed: isSupportedNetwork,
      score: isSupportedNetwork ? 0 : 30,
      reason: isSupportedNetwork
        ? `Network ${request.networkIdentifier} is recognized in x402 compatibility matrix`
        : `Network ${request.networkIdentifier} is not supported in Phase 1 compatibility matrix`,
    });
    if (!isSupportedNetwork) riskScore += 30;

    // Rule 4: Snapshot Expiration Check
    const isExpired = Date.now() > new Date(snapshot.expiresAt).getTime();
    rulesEvaluated.push({
      ruleId: 'GUARDIAN_004',
      ruleName: 'Snapshot Validity Period Verification',
      passed: !isExpired,
      score: !isExpired ? 0 : 40,
      reason: !isExpired ? 'Snapshot within validity window' : 'Snapshot has expired',
    });
    if (isExpired) riskScore += 40;

    // Final Guardian Decision
    let decision: 'allow' | 'block' | 'require_reapproval' = 'allow';
    let decisionReason = 'All security guardian checks passed successfully';

    if (riskScore >= 50) {
      decision = 'block';
      decisionReason = 'Critical security policy violation detected';
    } else if (riskScore > 0) {
      decision = 'require_reapproval';
      decisionReason = 'Minor discrepancy detected requiring explicit re-authorization';
    }

    return {
      id: `decision_${Date.now()}`,
      purchaseIntentId: request.purchaseIntentId,
      decision,
      reason: decisionReason,
      riskScore,
      rulesEvaluated,
      simulated: true,
      evaluatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
  }
}
