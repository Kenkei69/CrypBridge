import { assertPersistentKillSwitch } from './killSwitch.js';
import { simulationAllowed } from '../../config/simulation.js';
import { eq, or } from 'drizzle-orm';
import {
  AppError,
  PHASE3_PINNED_EXECUTION,
  type X402V2PaymentPayload,
  type X402V2SettlementResponse,
} from '@x402/shared';
import { settlementRecords, paymentExecutions } from '@x402/database/schema';

export interface SettlementSubmissionOptions {
  faultInjection?: 'timeout' | 'lost_response' | 'settlement_rejected' | 'network_drop';
  fencingToken?: number;
  workerId?: string;
}

export interface SettlementVerificationResult {
  settled: boolean;
  settlementReference: string;
  transactionHash: string;
  network: string;
  amount: string;
  settledAt: string;
}

/**
 * Simulation Settlement Adapter & Verifier for Phase 3.
 *
 * Validates simulation authorization tokens, prevents replay attacks,
 * records settlement in the persistent database, and generates simulated settlement identifiers.
 * Strictly refuses production operation.
 */
export class SimulationSettlementEngine {
  private readonly appEnv: string;
  private readonly db: any;

  constructor(db: any, appEnv = 'development') {
    this.db = db;
    this.appEnv = appEnv;
    if (!simulationAllowed(appEnv)) {
      throw AppError.simulationForbidden('SimulationSettlementEngine is strictly prohibited in production');
    }
  }

  /**
   * Verifies simulation authorization integrity and records atomic settlement in PostgreSQL.
   */
  async processSettlement(
    payload: X402V2PaymentPayload,
    options?: SettlementSubmissionOptions
  ): Promise<X402V2SettlementResponse> {
    if (!simulationAllowed(this.appEnv)) {
      throw AppError.simulationForbidden('Cannot settle simulation payment in production');
    }

    await assertPersistentKillSwitch(this.db);
    const { faultInjection } = options || {};

    // 1. Check fault injection scenarios
    if (faultInjection === 'settlement_rejected') {
      return {
        success: false,
        network: payload.accepted.network,
        error: 'Simulated settlement rejected by settlement simulation engine: Insufficient simulated liquidity',
        simulated: true,
      };
    }

    if (faultInjection === 'timeout') {
      throw new Error('Settlement network timeout: gateway timeout before outcome received');
    }

    // 2. Validate basic structure
    if (payload.x402Version !== 2 || !payload.payload?.simulated) {
      throw AppError.badRequest('Invalid x402 V2 payment payload or missing simulation flag');
    }

    // Strict positive allowlist: permits exclusively the pinned Base Sepolia USDC exact scheme
    const isUsdc =
      payload.accepted.asset.toUpperCase() === 'USDC' ||
      payload.accepted.asset.toLowerCase() === PHASE3_PINNED_EXECUTION.assetAddress.toLowerCase();

    if (
      payload.accepted.network !== 'eip155:84532' ||
      !isUsdc ||
      payload.accepted.scheme !== 'exact'
    ) {
      throw AppError.badRequest(
        `SimulationSettlementEngine: Unsupported execution combination (${payload.accepted.network} - ${payload.accepted.asset}). Permits strictly Base Sepolia (eip155:84532) USDC exact scheme.`
      );
    }

    const authId = payload.payload.authorizationId;
    const executionId = (payload.payload.extra?.executionId as string) || null;
    const intentId = payload.payload.intentId;
    const accepted = payload.accepted;

    if (!authId || !intentId) {
      throw AppError.badRequest('Payload missing required authorization or intent identity');
    }

    // 2b. Boundary Fencing & Worker Lease Enforcement
    // Ensure that expired or superseded workers cannot perform settlement side effects
    if (executionId) {
      const [exec] = await this.db
        .select()
        .from(paymentExecutions)
        .where(eq(paymentExecutions.id, executionId))
        .limit(1);

      if (exec) {
        // Enforce worker lease expiration at settlement adapter boundary
        const now = new Date();
        if (exec.workerLeaseExpiresAt && new Date(exec.workerLeaseExpiresAt) < now) {
          throw AppError.conflict(
            `SimulationSettlementEngine: Worker lease expired at ${exec.workerLeaseExpiresAt}. Settlement side effects refused.`,
            'STALE_WORKER_LEASE'
          );
        }

        // Enforce fencing token monotonic barrier at settlement adapter boundary
        const payloadFencingToken = payload.payload.extra?.fencingToken;
        const callerFencingToken = options?.fencingToken ?? payloadFencingToken;
        if (
          callerFencingToken !== undefined &&
          callerFencingToken !== null &&
          exec.fencingToken !== null &&
          exec.fencingToken !== undefined
        ) {
          if (callerFencingToken < exec.fencingToken) {
            throw AppError.conflict(
              `SimulationSettlementEngine: Stale worker fencing token (${callerFencingToken} < current ${exec.fencingToken}). Superseded worker cannot settle.`,
              'STALE_WORKER_FENCING_TOKEN'
            );
          }
        }
      }
    }

    // 3. Replay Protection: Check if this purchase intent or authorization has already been settled
    const existing = await this.db
      .select()
      .from(settlementRecords)
      .where(
        or(
          eq(settlementRecords.purchaseIntentId, intentId),
          eq(settlementRecords.settlementReference, `sim_settlement_${authId}`),
          executionId ? eq(settlementRecords.paymentExecutionId, executionId) : undefined
        )
      )
      .limit(1);

    if (existing.length > 0) {
      const rec = existing[0];
      // Idempotently return existing settlement
      return {
        success: true,
        network: rec.networkIdentifier,
        transactionHash: rec.settlementReference || `sim_settle_${rec.id}`,
        simulated: true,
        settledAt: rec.settledAt ? rec.settledAt.toISOString() : new Date().toISOString(),
      };
    }

    // 4. Generate Stable Simulated Settlement Identifier
    const settlementReference = `sim_settlement_${authId}`;

    // 5. Persist Settlement Record with purchase-level uniqueness protection
    let record: any;
    try {
      const [insertedRecord] = await this.db
        .insert(settlementRecords)
        .values({
          purchaseIntentId: intentId,
          paymentExecutionId: executionId,
          assetIdentifier: accepted.asset,
          networkIdentifier: accepted.network,
          amount: accepted.amount,
          recipientAddress: accepted.payTo,
          settlementType: 'simulated',
          settlementReference,
          settledAt: new Date(),
        })
        .returning();
      record = insertedRecord;
    } catch (insertErr: any) {
      // If purchase-level unique constraint catches a duplicate attempt, retrieve existing record
      const [existingRec] = await this.db
        .select()
        .from(settlementRecords)
        .where(
          or(
            eq(settlementRecords.purchaseIntentId, intentId),
            eq(settlementRecords.settlementReference, settlementReference)
          )
        )
        .limit(1);
      if (existingRec) {
        return {
          success: true,
          network: existingRec.networkIdentifier,
          transactionHash: existingRec.settlementReference || `sim_settle_${existingRec.id}`,
          simulated: true,
          settledAt: existingRec.settledAt ? existingRec.settledAt.toISOString() : new Date().toISOString(),
        };
      }
      throw insertErr;
    }

    // 6. Handle lost response fault injection (settled in DB, but throws before returning response)
    if (faultInjection === 'lost_response') {
      throw new Error('Network error: settlement completed successfully but HTTP response was dropped in transit');
    }

    return {
      success: true,
      network: accepted.network,
      transactionHash: settlementReference,
      simulated: true,
      settledAt: record.settledAt ? record.settledAt.toISOString() : new Date().toISOString(),
    };
  }

  /**
   * Reconciles an ambiguous settlement status by querying the persistent settlement ledger.
   */
  async reconcileOutcome(
    executionId: string,
    authorizationId?: string | null
  ): Promise<{ settled: boolean; settlementReference?: string; settledAt?: string }> {
    const existing = await this.db
      .select()
      .from(settlementRecords)
      .where(
        or(
          eq(settlementRecords.paymentExecutionId, executionId),
          authorizationId ? eq(settlementRecords.settlementReference, `sim_settlement_${authorizationId}`) : undefined
        )
      )
      .limit(1);

    if (existing.length > 0) {
      const rec = existing[0];
      return {
        settled: true,
        settlementReference: rec.settlementReference || `sim_settle_${rec.id}`,
        settledAt: rec.settledAt ? rec.settledAt.toISOString() : new Date().toISOString(),
      };
    }

    return { settled: false };
  }
}
