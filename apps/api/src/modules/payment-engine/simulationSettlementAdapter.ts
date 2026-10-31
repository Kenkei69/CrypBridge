import { eq, or } from 'drizzle-orm';
import {
  AppError,
  type X402V2PaymentPayload,
  type X402V2SettlementResponse,
} from '@x402/shared';
import { settlementRecords } from '@x402/database/schema';

export interface SettlementSubmissionOptions {
  faultInjection?: 'timeout' | 'lost_response' | 'settlement_rejected' | 'network_drop';
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
    if (appEnv === 'production') {
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
    if (this.appEnv === 'production') {
      throw AppError.simulationForbidden('Cannot settle simulation payment in production');
    }

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

    const authId = payload.payload.authorizationId;
    const executionId = (payload.payload.extra?.executionId as string) || null;
    const intentId = payload.payload.intentId;
    const accepted = payload.accepted;

    if (!authId || !intentId) {
      throw AppError.badRequest('Payload missing required authorization or intent identity');
    }

    // 3. Replay Protection: Check if this authorization has already been settled
    const existing = await this.db
      .select()
      .from(settlementRecords)
      .where(
        or(
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

    // 5. Persist Settlement Record
    const [record] = await this.db
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
