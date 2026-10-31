import { simulationAllowed } from '../../config/simulation.js';
import {
  PHASE3_PINNED_EXECUTION,
  type ApprovalSnapshot,
  type PurchaseIntent,
  type GuardianOutcome,
  type GuardianReasonCode,
  type GuardianRuleResult,
  type CanonicalTerms,
} from '@x402/shared';
import { isKillSwitchActive, getKillSwitchStatus } from '../payment-engine/killSwitch.js';
import { GUARDIAN_REASON_CODES } from './reasonCodes.js';

export interface PolicyEvaluationParams {
  userId: string;
  intent: PurchaseIntent;
  snapshot: ApprovalSnapshot;
  proposedPayment?: {
    amount?: string | undefined;
    recipientAddress?: string | undefined;
    networkIdentifier?: string | undefined;
    assetIdentifier?: string | undefined;
    scheme?: string | undefined;
  } | undefined;
  now?: Date | undefined;
  appEnv?: string | undefined;
}

export interface PureEvaluationResult {
  outcome: GuardianOutcome;
  reasonCode: GuardianReasonCode;
  reason: string;
  userFacingExplanation: string;
  rulesEvaluated: GuardianRuleResult[];
  canonicalTerms: CanonicalTerms;
  proposedTerms: Record<string, unknown>;
  riskScore: number;
}

/**
 * Pure, deterministic Guardian Policy Evaluator for Phase 4.
 *
 * Evaluates proposed payment execution parameters strictly against server-authoritative
 * immutable approval snapshots and immutable catalog/policy parameters.
 * Never loads approved amounts, recipients, or permissions from assistant prose or merchant untrusted text.
 */
export function evaluateGuardianPolicy(params: PolicyEvaluationParams): PureEvaluationResult {
  const now = params.now || new Date();
  const appEnv = params.appEnv || process.env.APP_ENV || 'development';
  const { userId, intent, snapshot, proposedPayment } = params;

  const rulesEvaluated: GuardianRuleResult[] = [];
  let riskScore = 0;

  const canonicalTerms: CanonicalTerms = {
    userId,
    intentId: intent.id,
    intentVersion: intent.version,
    snapshotId: snapshot ? snapshot.id : '',
    approvalVersion: snapshot ? snapshot.approvalVersion : 0,
    amount: snapshot ? snapshot.exactAmount : intent.proposedAmount,
    recipient: snapshot ? snapshot.trustedRecipientAddress : '',
    network: snapshot ? snapshot.networkIdentifier : intent.networkIdentifier,
    asset: snapshot ? snapshot.assetIdentifier : intent.assetIdentifier,
    expiresAt: snapshot ? snapshot.expiresAt : '',
    evaluatedAt: now.toISOString(),
  };

  const proposedTerms = {
    amount: proposedPayment?.amount || (snapshot ? snapshot.exactAmount : intent.proposedAmount),
    recipientAddress: proposedPayment?.recipientAddress || (snapshot ? snapshot.trustedRecipientAddress : ''),
    networkIdentifier: proposedPayment?.networkIdentifier || (snapshot ? snapshot.networkIdentifier : intent.networkIdentifier),
    assetIdentifier: proposedPayment?.assetIdentifier || (snapshot ? snapshot.assetIdentifier : intent.assetIdentifier),
    scheme: proposedPayment?.scheme || 'exact',
  };

  // Helper to record rule result
  function recordRule(ruleId: string, ruleName: string, passed: boolean, reason: string, details?: Record<string, unknown> | undefined) {
    const item: GuardianRuleResult = {
      ruleId,
      ruleName,
      passed,
      score: passed ? 0 : 25,
      reason,
    };
    if (details !== undefined) {
      item.details = details;
    }
    rulesEvaluated.push(item);
    if (!passed) {
      riskScore += 25;
    }
  }

  // 1. Production Isolation Rule
  const isProd =
    !simulationAllowed(appEnv);

  if (isProd) {
    recordRule(
      'ENV_SIMULATION_ISOLATION',
      'Environment Simulation Isolation',
      false,
      'Simulated payment engine components are strictly prohibited from executing in production environments.'
    );
    const meta = GUARDIAN_REASON_CODES.PRODUCTION_REFUSAL;
    return {
      outcome: 'BLOCK',
      reasonCode: meta.code,
      reason: meta.defaultMessage,
      userFacingExplanation: meta.userFacingExplanation,
      rulesEvaluated,
      canonicalTerms,
      proposedTerms,
      riskScore: 100,
    };
  }
  recordRule('ENV_SIMULATION_ISOLATION', 'Environment Simulation Isolation', true, 'Simulation environment active.');

  // 2. Emergency Kill Switch Rule
  if (isKillSwitchActive()) {
    const ks = getKillSwitchStatus();
    recordRule('KILL_SWITCH_STATUS', 'Emergency Kill Switch Status', false, `Emergency kill switch is active: ${ks.reason}`);
    const meta = GUARDIAN_REASON_CODES.KILL_SWITCH_ACTIVE;
    return {
      outcome: 'BLOCK',
      reasonCode: meta.code,
      reason: `${meta.defaultMessage} (Reason: ${ks.reason})`,
      userFacingExplanation: meta.userFacingExplanation,
      rulesEvaluated,
      canonicalTerms,
      proposedTerms,
      riskScore: 100,
    };
  }
  recordRule('KILL_SWITCH_STATUS', 'Emergency Kill Switch Status', true, 'Emergency kill switch is inactive.');

  // 3. User Ownership & Tenant Isolation
  const ownershipValid = intent.userId === userId && (!snapshot || snapshot.userId === userId);
  if (!ownershipValid) {
    recordRule('OWNERSHIP_CHECK', 'Intent and Approval Ownership', false, 'Identity mismatch between user and purchase intent.');
    const meta = GUARDIAN_REASON_CODES.OWNER_MISMATCH;
    return {
      outcome: 'BLOCK',
      reasonCode: meta.code,
      reason: meta.defaultMessage,
      userFacingExplanation: meta.userFacingExplanation,
      rulesEvaluated,
      canonicalTerms,
      proposedTerms,
      riskScore: 100,
    };
  }
  recordRule('OWNERSHIP_CHECK', 'Intent and Approval Ownership', true, 'User identity owns purchase intent and snapshot.');

  // 4. Approval Snapshot Existence & Status
  if (!snapshot) {
    recordRule('SNAPSHOT_EXISTS', 'Approval Snapshot Existence', false, 'No approval snapshot found.');
    const meta = GUARDIAN_REASON_CODES.SNAPSHOT_MISSING;
    return {
      outcome: 'BLOCK',
      reasonCode: meta.code,
      reason: meta.defaultMessage,
      userFacingExplanation: meta.userFacingExplanation,
      rulesEvaluated,
      canonicalTerms,
      proposedTerms,
      riskScore: 100,
    };
  }
  recordRule('SNAPSHOT_EXISTS', 'Approval Snapshot Existence', true, 'Approval snapshot loaded.');

  if (snapshot.status !== 'active') {
    recordRule('SNAPSHOT_ACTIVE', 'Approval Active Status', false, `Approval snapshot status is '${snapshot.status}'`);
    const meta = GUARDIAN_REASON_CODES.SNAPSHOT_SUPERSEDED;
    return {
      outcome: 'BLOCK',
      reasonCode: meta.code,
      reason: `${meta.defaultMessage} Current status: ${snapshot.status}`,
      userFacingExplanation: meta.userFacingExplanation,
      rulesEvaluated,
      canonicalTerms,
      proposedTerms,
      riskScore: 90,
    };
  }
  recordRule('SNAPSHOT_ACTIVE', 'Approval Active Status', true, 'Approval snapshot is active.');

  // 5. Expiration Check
  const expiresAt = new Date(snapshot.expiresAt);
  if (expiresAt < now) {
    recordRule('EXPIRATION_VALIDITY', 'Approval Expiration Check', false, `Approval snapshot expired at ${snapshot.expiresAt}`);
    const meta = GUARDIAN_REASON_CODES.SNAPSHOT_EXPIRED;
    return {
      outcome: 'BLOCK',
      reasonCode: meta.code,
      reason: meta.defaultMessage,
      userFacingExplanation: meta.userFacingExplanation,
      rulesEvaluated,
      canonicalTerms,
      proposedTerms,
      riskScore: 85,
    };
  }
  recordRule('EXPIRATION_VALIDITY', 'Approval Expiration Check', true, `Approval valid until ${snapshot.expiresAt}.`);

  // 6. Intent Version Alignment
  if (intent.version !== snapshot.approvalVersion) {
    recordRule(
      'VERSION_ALIGNMENT',
      'Intent and Approval Version Alignment',
      false,
      `Intent version ${intent.version} != approved version ${snapshot.approvalVersion}`
    );
    const meta = GUARDIAN_REASON_CODES.VERSION_MISMATCH;
    return {
      outcome: 'BLOCK',
      reasonCode: meta.code,
      reason: meta.defaultMessage,
      userFacingExplanation: meta.userFacingExplanation,
      rulesEvaluated,
      canonicalTerms,
      proposedTerms,
      riskScore: 90,
    };
  }
  recordRule('VERSION_ALIGNMENT', 'Intent and Approval Version Alignment', true, 'Versions aligned.');

  // 7. Purchase Intent Status
  if (intent.status !== 'approved') {
    recordRule('INTENT_APPROVED_STATUS', 'Purchase Intent Status', false, `Intent status is '${intent.status}', expected 'approved'`);
    const meta = GUARDIAN_REASON_CODES.INTENT_NOT_APPROVED;
    return {
      outcome: 'BLOCK',
      reasonCode: meta.code,
      reason: meta.defaultMessage,
      userFacingExplanation: meta.userFacingExplanation,
      rulesEvaluated,
      canonicalTerms,
      proposedTerms,
      riskScore: 80,
    };
  }
  recordRule('INTENT_APPROVED_STATUS', 'Purchase Intent Status', true, 'Purchase intent status is approved.');

  // 8. Positive Pinned Network & Asset Allowlist
  const isBaseSepolia = snapshot.networkIdentifier === PHASE3_PINNED_EXECUTION.network;
  const isUsdc =
    snapshot.assetIdentifier.toUpperCase() === 'USDC' ||
    snapshot.assetIdentifier.toLowerCase() === PHASE3_PINNED_EXECUTION.assetAddress.toLowerCase();

  if (!isBaseSepolia || !isUsdc) {
    recordRule(
      'PINNED_EXECUTION_ALLOWLIST',
      'Supported Network and Asset Allowlist',
      false,
      `Requested ${snapshot.networkIdentifier} - ${snapshot.assetIdentifier}. Only Base Sepolia USDC exact scheme is supported.`
    );
    const meta = GUARDIAN_REASON_CODES.UNSUPPORTED_EXECUTION_COMBINATION;
    const msg = `Payment option (${snapshot.networkIdentifier} - ${snapshot.assetIdentifier}) is not supported for Phase 3 simulated execution. Phase 3 execution supports USDC on Base Sepolia (${PHASE3_PINNED_EXECUTION.network}).`;
    return {
      outcome: 'BLOCK',
      reasonCode: meta.code,
      reason: msg,
      userFacingExplanation: meta.userFacingExplanation,
      rulesEvaluated,
      canonicalTerms,
      proposedTerms,
      riskScore: 90,
    };
  }
  recordRule('PINNED_EXECUTION_ALLOWLIST', 'Supported Network and Asset Allowlist', true, 'Pinned execution combination validated (Base Sepolia USDC).');

  // 9. Exact Amount Verification (Integer base units equality)
  if (proposedPayment?.amount && proposedPayment.amount !== snapshot.exactAmount) {
    recordRule(
      'EXACT_AMOUNT_MATCH',
      'Exact Amount Verification',
      false,
      `Proposed amount ${proposedPayment.amount} != approved amount ${snapshot.exactAmount}`,
      { approved: snapshot.exactAmount, proposed: proposedPayment.amount }
    );
    const meta = GUARDIAN_REASON_CODES.AMOUNT_MISMATCH;
    return {
      outcome: 'BLOCK',
      reasonCode: meta.code,
      reason: `${meta.defaultMessage} Approved: ${snapshot.exactAmount}, Proposed: ${proposedPayment.amount}`,
      userFacingExplanation: meta.userFacingExplanation,
      rulesEvaluated,
      canonicalTerms,
      proposedTerms,
      riskScore: 95,
    };
  }
  recordRule('EXACT_AMOUNT_MATCH', 'Exact Amount Verification', true, `Exact base units verified (${snapshot.exactAmount}).`);

  // 10. Recipient Address Validation (Chain-appropriate EVM address comparison)
  if (proposedPayment?.recipientAddress) {
    const canonicalRecipient = snapshot.trustedRecipientAddress.toLowerCase().trim();
    const proposedRecipient = proposedPayment.recipientAddress.toLowerCase().trim();
    if (canonicalRecipient !== proposedRecipient) {
      recordRule(
        'RECIPIENT_MATCH',
        'Recipient Address Verification',
        false,
        `Proposed recipient ${proposedPayment.recipientAddress} != approved recipient ${snapshot.trustedRecipientAddress}`,
        { approved: snapshot.trustedRecipientAddress, proposed: proposedPayment.recipientAddress }
      );
      const meta = GUARDIAN_REASON_CODES.RECIPIENT_MISMATCH;
      return {
        outcome: 'BLOCK',
        reasonCode: meta.code,
        reason: `${meta.defaultMessage} Approved: ${snapshot.trustedRecipientAddress}, Proposed: ${proposedPayment.recipientAddress}`,
        userFacingExplanation: meta.userFacingExplanation,
        rulesEvaluated,
        canonicalTerms,
        proposedTerms,
        riskScore: 100,
      };
    }
  }
  recordRule('RECIPIENT_MATCH', 'Recipient Address Verification', true, `Recipient address verified (${snapshot.trustedRecipientAddress}).`);

  // 11. Payment Scheme Verification
  if (proposedPayment?.scheme && proposedPayment.scheme !== 'exact') {
    recordRule('PAYMENT_SCHEME_CHECK', 'Payment Scheme Verification', false, `Scheme ${proposedPayment.scheme} is unsupported.`);
    const meta = GUARDIAN_REASON_CODES.UNSUPPORTED_SCHEME;
    return {
      outcome: 'BLOCK',
      reasonCode: meta.code,
      reason: meta.defaultMessage,
      userFacingExplanation: meta.userFacingExplanation,
      rulesEvaluated,
      canonicalTerms,
      proposedTerms,
      riskScore: 75,
    };
  }
  recordRule('PAYMENT_SCHEME_CHECK', 'Payment Scheme Verification', true, 'Exact payment scheme validated.');

  // All deterministic pure policy rules passed
  const authorizedMeta = GUARDIAN_REASON_CODES.AUTHORIZED;
  return {
    outcome: 'ALLOW',
    reasonCode: authorizedMeta.code,
    reason: authorizedMeta.defaultMessage,
    userFacingExplanation: authorizedMeta.userFacingExplanation,
    rulesEvaluated,
    canonicalTerms,
    proposedTerms,
    riskScore: 0,
  };
}
