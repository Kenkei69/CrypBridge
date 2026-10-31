import {
  PHASE3_PINNED_EXECUTION,
  type ApprovalSnapshot,
  type PurchaseIntent,
} from '@x402/shared';
import { isKillSwitchActive, getKillSwitchStatus } from './killSwitch.js';

export interface GateEvaluationParams {
  userId: string;
  intent: PurchaseIntent;
  snapshot: ApprovalSnapshot;
  expectedNetwork?: string;
  expectedAsset?: string;
  expectedAmount?: string;
}

export interface GateDecision {
  allowed: boolean;
  reasonCode:
    | 'AUTHORIZED'
    | 'OWNER_MISMATCH'
    | 'SNAPSHOT_MISSING'
    | 'SNAPSHOT_EXPIRED'
    | 'SNAPSHOT_SUPERSEDED'
    | 'VERSION_MISMATCH'
    | 'INTENT_NOT_APPROVED'
    | 'TERMS_MISMATCH'
    | 'UNSUPPORTED_EXECUTION_COMBINATION'
    | 'KILL_SWITCH_ACTIVE'
    | 'PRODUCTION_REFUSAL';
  message: string;
  evaluatedTerms: {
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
    evaluatedAt: string;
  };
}

/**
 * Minimum Mandatory Authorization Gate for Phase 3.
 * Evaluates whether an approved purchase intent satisfies all security and domain invariants
 * before simulated signing and settlement are permitted.
 */
export function evaluateAuthorizationGate(
  params: GateEvaluationParams,
  appEnv = 'development'
): GateDecision {
  const now = new Date();
  const { userId, intent, snapshot } = params;

  const baseTerms = {
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

  // 1. Environment Safety Check (Simulation forbidden in production)
  if (appEnv === 'production' || process.env.NODE_ENV === 'production' || process.env.SIMULATION_MODE === 'false') {
    return {
      allowed: false,
      reasonCode: 'PRODUCTION_REFUSAL',
      message: 'Simulated payment engine is strictly prohibited in production environments.',
      evaluatedTerms: baseTerms,
    };
  }

  // 2. Kill Switch Check
  if (isKillSwitchActive()) {
    const ks = getKillSwitchStatus();
    return {
      allowed: false,
      reasonCode: 'KILL_SWITCH_ACTIVE',
      message: `Emergency payment processing kill switch is active: ${ks.reason}`,
      evaluatedTerms: baseTerms,
    };
  }

  // 3. User Ownership Verification
  if (intent.userId !== userId) {
    return {
      allowed: false,
      reasonCode: 'OWNER_MISMATCH',
      message: 'Authenticated user does not own this purchase intent.',
      evaluatedTerms: baseTerms,
    };
  }

  // 4. Approval Snapshot Existence & Status
  if (!snapshot) {
    return {
      allowed: false,
      reasonCode: 'SNAPSHOT_MISSING',
      message: 'No effective approval snapshot exists for this purchase intent.',
      evaluatedTerms: baseTerms,
    };
  }

  if (snapshot.status !== 'active') {
    return {
      allowed: false,
      reasonCode: 'SNAPSHOT_SUPERSEDED',
      message: `Approval snapshot is not active (current status: ${snapshot.status}). A fresh approval is required.`,
      evaluatedTerms: baseTerms,
    };
  }

  // 5. Expiration Check
  if (new Date(snapshot.expiresAt) < now) {
    return {
      allowed: false,
      reasonCode: 'SNAPSHOT_EXPIRED',
      message: 'Approval snapshot has expired. A fresh approval is required.',
      evaluatedTerms: baseTerms,
    };
  }

  // 6. Intent Version Alignment
  if (intent.version !== snapshot.approvalVersion) {
    return {
      allowed: false,
      reasonCode: 'VERSION_MISMATCH',
      message: `Purchase intent version (${intent.version}) does not match approved version (${snapshot.approvalVersion}).`,
      evaluatedTerms: baseTerms,
    };
  }

  // 7. Purchase Intent Status
  if (intent.status !== 'approved') {
    return {
      allowed: false,
      reasonCode: 'INTENT_NOT_APPROVED',
      message: `Purchase intent must be in approved status to execute payment (current status: ${intent.status}).`,
      evaluatedTerms: baseTerms,
    };
  }

  // 8. Phase 3 Pinned Execution Combination Check
  // Phase 3 specifically implements USDC on Base Sepolia (eip155:84532) exact payment scheme.
  const isBaseSepolia = snapshot.networkIdentifier === PHASE3_PINNED_EXECUTION.network;
  const isUsdc =
    snapshot.assetIdentifier.toUpperCase() === 'USDC' ||
    snapshot.assetIdentifier.toLowerCase() === PHASE3_PINNED_EXECUTION.assetAddress.toLowerCase();

  if (!isBaseSepolia || !isUsdc) {
    return {
      allowed: false,
      reasonCode: 'UNSUPPORTED_EXECUTION_COMBINATION',
      message: `Payment option (${snapshot.networkIdentifier} - ${snapshot.assetIdentifier}) is not supported for Phase 3 simulated execution. Phase 3 execution supports USDC on Base Sepolia (${PHASE3_PINNED_EXECUTION.network}).`,
      evaluatedTerms: baseTerms,
    };
  }

  // 9. Exact Terms Consistency
  if (
    snapshot.exactAmount !== intent.proposedAmount ||
    snapshot.networkIdentifier !== intent.networkIdentifier ||
    snapshot.assetIdentifier !== intent.assetIdentifier
  ) {
    return {
      allowed: false,
      reasonCode: 'TERMS_MISMATCH',
      message: 'Approval snapshot terms do not match purchase intent terms.',
      evaluatedTerms: baseTerms,
    };
  }

  return {
    allowed: true,
    reasonCode: 'AUTHORIZED',
    message: 'Purchase authorization validated successfully.',
    evaluatedTerms: baseTerms,
  };
}
