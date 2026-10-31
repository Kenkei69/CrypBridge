import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import {
  AppError,
  PHASE3_PINNED_EXECUTION,
  type ApprovalSnapshot,
  type PurchaseIntent,
  type X402V2PaymentPayload,
  type X402V2RequirementItem,
  type ExecutionPermit,
} from '@x402/shared';
import { isKillSwitchActive, getKillSwitchStatus } from './killSwitch.js';
import { verifyExecutionPermit } from '../guardian/authorizationService.js';
import { spendingReservations, paymentExecutions, approvalSnapshots } from '@x402/database/schema';

// Server-side secret for simulated HMAC integrity token (never exposed to client)
const SIMULATION_SIGNER_SECRET = process.env.SIMULATION_SIGNER_SECRET || 'x402_guardian_internal_sim_signer_secret_k92';

export interface ConstrainedSigningRequest {
  executionId: string;
  snapshot: ApprovalSnapshot;
  intent: PurchaseIntent;
  requirementItem: X402V2RequirementItem;
  permit?: ExecutionPermit | undefined;
  fencingToken?: number | undefined;
  requirePermit?: boolean | undefined;
  resourceId?: string | undefined;
  resourceUrl?: string | undefined;
  db?: any;
}

export interface ConstrainedSigningResult {
  authorizationId: string;
  signature: string;
  payload: X402V2PaymentPayload;
  integrityHash: string;
  issuedAt: string;
}

/**
 * Constrained Simulation Signer for Phase 4.
 *
 * Independently validates execution parameters against immutable server-side approval snapshots
 * and cryptographically verifies server-issued ExecutionPermits.
 * Refuses execution in production environments or when kill-switch is active.
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

    if (isKillSwitchActive()) {
      const ks = getKillSwitchStatus();
      throw AppError.forbidden(`ConstrainedSigner: Emergency payment kill switch is active (${ks.reason})`);
    }

    const { executionId, snapshot, intent, requirementItem, permit, fencingToken, requirePermit, resourceId, resourceUrl, db } = request;
    const now = new Date();

    // 0. Independent Execution Permit Verification (Phase 4 Guardian Enforcement)
    if (requirePermit && !permit) {
      throw AppError.badRequest('ConstrainedSigner: Missing required Guardian Execution Permit');
    }

    if (permit) {
      // 0a. Verify HMAC-SHA256 signature and permit expiration
      const permitVerification = verifyExecutionPermit(permit, now);
      if (!permitVerification.valid) {
        throw AppError.badRequest(
          `ConstrainedSigner: Execution permit invalid: ${permitVerification.reason}`
        );
      }

      // 0b. Verify permit execution and snapshot binding
      if (permit.executionId !== executionId) {
        throw AppError.badRequest(
          `ConstrainedSigner: Permit execution binding mismatch (${permit.executionId} != ${executionId})`
        );
      }
      if (permit.snapshotId !== snapshot.id) {
        throw AppError.badRequest(
          `ConstrainedSigner: Permit snapshot binding mismatch (${permit.snapshotId} != ${snapshot.id})`
        );
      }
      if (permit.intentId !== intent.id) {
        throw AppError.badRequest(
          `ConstrainedSigner: Permit intent binding mismatch (${permit.intentId} != ${intent.id})`
        );
      }
      if (BigInt(permit.amount) !== BigInt(requirementItem.amount)) {
        throw AppError.badRequest(
          `ConstrainedSigner: Permit amount mismatch (${permit.amount} != ${requirementItem.amount})`
        );
      }
      if (permit.recipientAddress.toLowerCase() !== requirementItem.payTo.toLowerCase()) {
        throw AppError.badRequest(
          `ConstrainedSigner: Permit recipient mismatch (${permit.recipientAddress} != ${requirementItem.payTo})`
        );
      }

      // 0c. Verify worker fencing token against permit if provided
      if (fencingToken !== undefined && permit.fencingToken !== fencingToken) {
        throw AppError.conflict(
          `ConstrainedSigner: Worker fencing token mismatch. Permit has token ${permit.fencingToken}, current worker has ${fencingToken}`,
          'STALE_WORKER_FENCING_TOKEN'
        );
      }

      // 0d. Check active approval snapshot, spending reservation, and worker generation in DB if db instance provided
      if (db) {
        // 0d-1: Verify Current Approval Snapshot State in Database
        const [dbSnapshot] = await db
          .select()
          .from(approvalSnapshots)
          .where(eq(approvalSnapshots.id, snapshot.id))
          .limit(1);

        if (!dbSnapshot || dbSnapshot.status !== 'active') {
          throw AppError.badRequest(
            `ConstrainedSigner: Approval snapshot ${snapshot.id} is not active in database (status: ${dbSnapshot?.status || 'NOT_FOUND'})`
          );
        }
        if (new Date(dbSnapshot.expiresAt) < now) {
          throw AppError.badRequest(`ConstrainedSigner: Approval snapshot ${snapshot.id} has expired in database`);
        }
        if (dbSnapshot.approvalVersion !== intent.version) {
          throw AppError.badRequest(
            `ConstrainedSigner: Database approval version mismatch (${dbSnapshot.approvalVersion} != ${intent.version})`
          );
        }

        // 0d-2: Verify Current Spending Reservation State in Database
        const [resRecord] = await db
          .select()
          .from(spendingReservations)
          .where(eq(spendingReservations.id, permit.reservationId))
          .limit(1);

        if (!resRecord || (resRecord.reservationStatus !== 'RESERVED' && resRecord.reservationStatus !== 'COMMITTED')) {
          throw AppError.badRequest(
            `ConstrainedSigner: Spending reservation ${permit.reservationId} is not active (status: ${resRecord?.reservationStatus || 'NOT_FOUND'})`
          );
        }

        // 0d-3: Verify Current Execution State, Worker Lease, and Fencing in Database
        const [execRecord] = await db
          .select()
          .from(paymentExecutions)
          .where(eq(paymentExecutions.id, executionId))
          .limit(1);

        if (execRecord) {
          const terminalStatuses = ['SIMULATION_COMPLETED', 'SETTLED', 'BLOCKED', 'CANCELLED', 'REJECTED', 'FAILED'];
          if (terminalStatuses.includes(execRecord.executionStatus)) {
            throw AppError.conflict(
              `ConstrainedSigner: Execution ${executionId} is in terminal status (${execRecord.executionStatus}). Signing refused.`,
              'EXECUTION_STATE_INVALID'
            );
          }

          if (execRecord.workerLeaseExpiresAt && new Date(execRecord.workerLeaseExpiresAt) < now) {
            throw AppError.conflict(
              `ConstrainedSigner: Worker lease for execution ${executionId} expired at ${execRecord.workerLeaseExpiresAt}`,
              'STALE_WORKER_LEASE'
            );
          }

          if (fencingToken !== undefined && execRecord.fencingToken !== fencingToken) {
            throw AppError.conflict(
              `ConstrainedSigner: Stale worker fencing token in database (${execRecord.fencingToken} != ${fencingToken}). Lease superseded.`,
              'STALE_WORKER_FENCING_TOKEN'
            );
          }
        }
      }
    }

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
    // Binds authorizationId, executionId, snapshotId, exactAmount, recipient, network, expiresAt, and permitId if present
    const canonicalPayloadString = [
      authorizationId,
      executionId,
      snapshot.id,
      permit?.permitId || 'no_permit',
      permit?.reservationId || 'no_reservation',
      fencingToken !== undefined ? fencingToken.toString() : '1',
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
          permitId: permit?.permitId || null,
          reservationId: permit?.reservationId || null,
          fencingToken: fencingToken ?? null,
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
