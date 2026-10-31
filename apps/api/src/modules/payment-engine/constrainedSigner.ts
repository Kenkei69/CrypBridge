import crypto from 'node:crypto';
import {
  AppError,
  PHASE3_PINNED_EXECUTION,
  type ApprovalSnapshot,
  type PurchaseIntent,
  type X402V2PaymentPayload,
  type X402V2RequirementItem,
} from '@x402/shared';

// Server-side secret for simulated HMAC integrity token (never exposed to client)
const SIMULATION_SIGNER_SECRET = process.env.SIMULATION_SIGNER_SECRET || 'x402_guardian_internal_sim_signer_secret_k92';

export interface ConstrainedSigningRequest {
  executionId: string;
  snapshot: ApprovalSnapshot;
  intent: PurchaseIntent;
  requirementItem: X402V2RequirementItem;
  resourceId?: string;
  resourceUrl?: string;
}

export interface ConstrainedSigningResult {
  authorizationId: string;
  signature: string;
  payload: X402V2PaymentPayload;
  integrityHash: string;
  issuedAt: string;
}

/**
 * Constrained Simulation Signer for Phase 3.
 *
 * Independently validates execution parameters against immutable server-side approval snapshots.
 * Generates an opaque, verifiable simulation authorization token.
 * Refuses execution in production environments.
 */
export class ConstrainedSimulationSigner {
  private readonly appEnv: string;

  constructor(appEnv = 'development') {
    this.appEnv = appEnv;
    if (appEnv === 'production' || process.env.NODE_ENV === 'production' || process.env.SIMULATION_MODE === 'false') {
      throw AppError.simulationForbidden('ConstrainedSimulationSigner is strictly prohibited in production');
    }
  }

  /**
   * Independently validates terms and signs an opaque simulation payment authorization.
   */
  async signSimulationAuthorization(request: ConstrainedSigningRequest): Promise<ConstrainedSigningResult> {
    if (this.appEnv === 'production' || process.env.NODE_ENV === 'production' || process.env.SIMULATION_MODE === 'false') {
      throw AppError.simulationForbidden('Cannot sign simulation authorization in production environment');
    }

    const { executionId, snapshot, intent, requirementItem, resourceId, resourceUrl } = request;
    const now = new Date();

    // 1. Independent Owner & Intent Binding Verification
    if (!intent || !snapshot) {
      throw AppError.badRequest('ConstrainedSigner: Missing purchase intent or approval snapshot');
    }

    if (snapshot.userId !== intent.userId) {
      throw AppError.badRequest('ConstrainedSigner: Approval owner mismatch with purchase intent');
    }

    if (snapshot.purchaseIntentId !== intent.id) {
      throw AppError.badRequest('ConstrainedSigner: Snapshot is not bound to the specified purchase intent');
    }

    // 2. Intent Version & Status Verification
    if (snapshot.approvalVersion !== intent.version) {
      throw AppError.badRequest(
        `ConstrainedSigner: Version mismatch. Intent version is ${intent.version}, snapshot version is ${snapshot.approvalVersion}`
      );
    }

    if (snapshot.status !== 'active') {
      throw AppError.badRequest(`ConstrainedSigner: Snapshot is not active (current status: ${snapshot.status})`);
    }

    // 3. Expiration Verification
    if (new Date(snapshot.expiresAt) < now) {
      throw AppError.badRequest('ConstrainedSigner: Approval snapshot has expired');
    }

    // 4. Exact Commercial Terms Validation against Requirement
    if (BigInt(snapshot.exactAmount) !== BigInt(requirementItem.amount)) {
      throw AppError.badRequest(
        `ConstrainedSigner: Amount mismatch. Snapshot requires ${snapshot.exactAmount}, merchant requirement offered ${requirementItem.amount}`
      );
    }

    if (snapshot.trustedRecipientAddress.toLowerCase() !== requirementItem.payTo.toLowerCase()) {
      throw AppError.badRequest(
        `ConstrainedSigner: Recipient mismatch. Snapshot recipient is ${snapshot.trustedRecipientAddress}, merchant requirement offered ${requirementItem.payTo}`
      );
    }

    if (snapshot.networkIdentifier.toLowerCase() !== requirementItem.network.toLowerCase()) {
      throw AppError.badRequest(
        `ConstrainedSigner: Network mismatch. Snapshot network is ${snapshot.networkIdentifier}, merchant requirement offered ${requirementItem.network}`
      );
    }

    // Strict positive allowlist: permits exclusively the pinned Base Sepolia USDC exact scheme
    if (snapshot.networkIdentifier !== 'eip155:84532' || requirementItem.network !== 'eip155:84532') {
      throw AppError.badRequest(
        'ConstrainedSigner: Permits only Base Sepolia (eip155:84532) USDC exact scheme as the explicitly supported execution combination'
      );
    }

    const isSnapshotUsdc =
      snapshot.assetIdentifier.toUpperCase() === 'USDC' ||
      snapshot.assetIdentifier.toLowerCase() === PHASE3_PINNED_EXECUTION.assetAddress.toLowerCase();
    const isRequirementUsdc =
      requirementItem.asset.toUpperCase() === 'USDC' ||
      requirementItem.asset.toLowerCase() === PHASE3_PINNED_EXECUTION.assetAddress.toLowerCase();

    if (!isSnapshotUsdc || !isRequirementUsdc) {
      throw AppError.badRequest(
        'ConstrainedSigner: Permits only USDC for Phase 3 simulated execution'
      );
    }

    if (requirementItem.scheme !== 'exact') {
      throw AppError.badRequest(
        `ConstrainedSigner: Permits only exact scheme for Phase 3 simulated execution, received scheme: ${requirementItem.scheme}`
      );
    }

    // 5. Generate Unique Authorization Identity
    const authorizationId = `sim_auth_${crypto.randomUUID()}`;
    const issuedAt = now.toISOString();

    // 6. Compute Server-Side Integrity Hash
    // Binds authorizationId, executionId, snapshotId, exactAmount, recipient, network, expiresAt
    const canonicalPayloadString = [
      authorizationId,
      executionId,
      snapshot.id,
      snapshot.exactAmount,
      snapshot.trustedRecipientAddress.toLowerCase(),
      snapshot.networkIdentifier.toLowerCase(),
      snapshot.expiresAt,
      issuedAt,
    ].join('|');

    const integrityHash = crypto
      .createHmac('sha256', SIMULATION_SIGNER_SECRET)
      .update(canonicalPayloadString)
      .digest('hex');

    const simulatedSignature = `SIMULATED_V2_AUTH_${authorizationId}_${integrityHash.substring(0, 16)}`;

    // 7. Format x402 V2 PaymentPayload
    const payload: X402V2PaymentPayload = {
      x402Version: 2,
      accepted: requirementItem,
      payload: {
        authorizationId,
        signature: simulatedSignature,
        timestamp: issuedAt,
        intentId: intent.id,
        approvalSnapshotId: snapshot.id,
        approvalVersion: snapshot.approvalVersion,
        simulated: true,
        extra: {
          executionId,
          resourceId: resourceId || null,
          integrityHash,
        },
      },
      ...(resourceUrl ? { resource: { url: resourceUrl } } : {}),
    };

    return {
      authorizationId,
      signature: simulatedSignature,
      payload,
      integrityHash,
      issuedAt,
    };
  }
}
