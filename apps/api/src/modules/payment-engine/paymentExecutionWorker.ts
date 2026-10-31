import crypto from 'node:crypto';
import { eq, and, or, lt, isNull, sql } from 'drizzle-orm';
import {
  AppError,
  encodeX402Header,
  decodeX402Header,
  PHASE3_PINNED_EXECUTION,
  type X402V2SettlementResponse,
  type ExecutionPermit,
  type SpendingReservation,
} from '@x402/shared';
import {
  paymentExecutions,
  purchaseIntents,
  approvalSnapshots,
  products,
  mockMerchantResources,
} from '@x402/database/schema';
import { recordAuditEvent } from '../audit/auditService.js';
import { GuardianEngine } from '../guardian/guardianEngine.js';
import { commitSpendingReservation, releaseSpendingReservation } from '../guardian/reservationService.js';
import { parseAndValidatePaymentRequirements } from './requirementsParser.js';
import { ConstrainedSimulationSigner } from './constrainedSigner.js';
import { MockMerchantService, type MockMerchantRequest } from '../mock-merchant/mockMerchantService.js';
import { SimulationSettlementEngine } from './simulationSettlementAdapter.js';

export interface ProcessExecutionOptions {
  workerId?: string;
  leaseDurationMs?: number;
  mockMerchantFault?: MockMerchantRequest['faultInjection'];
  simulateTamperedAmount?: string;
  simulateTamperedRecipient?: string;
  simulateStaleWorkerFencingToken?: boolean;
}

export interface ExecutionRunResult {
  executionId: string;
  executionStatus: string;
  fulfillmentStatus: string;
  fencingToken?: number;
  permitId?: string | null;
  guardianDecisionId?: string | null;
  spendingReservationId?: string | null;
  settlementReference?: string | null;
  deliveredResource?: any;
  failureCode?: string | null;
  failureReason?: string | null;
  reconciliationPending?: boolean;
}

/**
 * Payment Execution Worker for Phase 4.
 *
 * Implements a durable, atomic, fencing-token-bounded state machine:
 * QUEUED -> VALIDATING -> SIMULATING_AUTHORIZATION -> SETTLING_SIMULATION -> SIMULATION_COMPLETED (or BLOCKED / FAILED / RECONCILIATION_REQUIRED).
 *
 * Every payment passes through Guardian deterministic policy & atomic budget reservation gates.
 * Worker mutations enforce monotonically increasing fencing tokens.
 */
export class PaymentExecutionWorker {
  private readonly db: any;
  private readonly appEnv: string;
  private readonly guardianEngine: GuardianEngine;
  private readonly constrainedSigner: ConstrainedSimulationSigner;
  private readonly mockMerchant: MockMerchantService;
  private readonly settlementEngine: SimulationSettlementEngine;

  constructor(db: any, appEnv = 'development') {
    this.db = db;
    this.appEnv = appEnv;
    this.guardianEngine = new GuardianEngine(db, appEnv);
    this.constrainedSigner = new ConstrainedSimulationSigner(appEnv);
    this.mockMerchant = new MockMerchantService(db, appEnv);
    this.settlementEngine = new SimulationSettlementEngine(db, appEnv);
  }

  /**
   * Helper to ensure execution updates only succeed if this worker still holds the valid lease
   * and current monotonic fencing token. If superseded or expired, safely aborts with STALE_WORKER_FENCING_TOKEN.
   */
  private async updateExecutionWithLease(
    executionId: string,
    workerId: string,
    fencingTokenOrData: number | Record<string, any>,
    maybeUpdateData?: Record<string, any>
  ): Promise<any> {
    let fencingToken: number | undefined;
    let updateData: Record<string, any>;

    if (typeof fencingTokenOrData === 'number') {
      fencingToken = fencingTokenOrData;
      updateData = maybeUpdateData || {};
    } else {
      updateData = fencingTokenOrData;
    }

    const conditions = [
      eq(paymentExecutions.id, executionId),
      eq(paymentExecutions.workerId, workerId),
    ];
    if (fencingToken !== undefined) {
      conditions.push(eq(paymentExecutions.fencingToken, fencingToken));
    }

    const [updated] = await this.db
      .update(paymentExecutions)
      .set({
        ...updateData,
        updatedAt: new Date(),
      })
      .where(and(...conditions))
      .returning();

    if (!updated) {
      throw AppError.conflict(
        `Worker lease lost or superseded by newer generation (worker: ${workerId}${fencingToken !== undefined ? ', fencingToken: ' + fencingToken : ''}) for execution ${executionId}. Operation aborted to preserve execution state integrity.`,
        'WORKER_LEASE_LOST'
      );
    }
    return updated;
  }

  /**
   * Processes a single payment execution record through the Phase 4 lifecycle.
   */
  async processExecution(
    executionId: string,
    options?: ProcessExecutionOptions
  ): Promise<ExecutionRunResult> {
    const workerId = options?.workerId || `worker_${crypto.randomUUID()}`;
    const leaseMs = options?.leaseDurationMs || 30000;
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + leaseMs);

    // 1. Atomic Lease Claim: Acquire lock on the execution record and increment fencing token
    const claimedList = await this.db
      .update(paymentExecutions)
      .set({
        workerId,
        workerLeaseExpiresAt: leaseExpiresAt,
        fencingToken: sql`${paymentExecutions.fencingToken} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(paymentExecutions.id, executionId),
          or(
            eq(paymentExecutions.executionStatus, 'QUEUED'),
            eq(paymentExecutions.executionStatus, 'VALIDATING'),
            eq(paymentExecutions.executionStatus, 'SIMULATING_AUTHORIZATION'),
            eq(paymentExecutions.executionStatus, 'SETTLING_SIMULATION'),
            eq(paymentExecutions.executionStatus, 'RECONCILIATION_REQUIRED')
          ),
          or(
            eq(paymentExecutions.workerId, workerId),
            isNull(paymentExecutions.workerLeaseExpiresAt),
            lt(paymentExecutions.workerLeaseExpiresAt, now)
          )
        )
      )
      .returning();

    if (claimedList.length === 0) {
      // Could not claim lease - check if already completed
      const [existing] = await this.db
        .select()
        .from(paymentExecutions)
        .where(eq(paymentExecutions.id, executionId))
        .limit(1);

      if (!existing) {
        throw AppError.notFound('Payment Execution');
      }

      return {
        executionId: existing.id,
        executionStatus: existing.executionStatus,
        fulfillmentStatus: existing.fulfillmentStatus,
        fencingToken: existing.fencingToken,
        permitId: existing.permitId,
        guardianDecisionId: existing.guardianDecisionId,
        spendingReservationId: existing.spendingReservationId,
        settlementReference: existing.settlementReference,
        deliveredResource: existing.deliveredResource,
        failureCode: existing.failureCode,
        failureReason: existing.failureReason,
        reconciliationPending: existing.executionStatus === 'RECONCILIATION_REQUIRED',
      };
    }

    const execution = claimedList[0];
    const fencingToken = execution.fencingToken;

    let activeReservation: SpendingReservation | undefined;
    let activePermit: ExecutionPermit | undefined;

    try {
      // 2. Fetch related entities
      const [intent] = await this.db
        .select()
        .from(purchaseIntents)
        .where(eq(purchaseIntents.id, execution.purchaseIntentId))
        .limit(1);

      const [snapshot] = await this.db
        .select()
        .from(approvalSnapshots)
        .where(eq(approvalSnapshots.id, execution.approvalSnapshotId))
        .limit(1);

      const [product] = await this.db
        .select()
        .from(products)
        .where(eq(products.id, intent.productId))
        .limit(1);

      // Find demonstration resource associated with product
      const [resource] = await this.db
        .select()
        .from(mockMerchantResources)
        .where(eq(mockMerchantResources.productId, product.id))
        .limit(1);

      const resourceId = resource ? resource.id : 'res_gpu_h100_compute';

      // 3. Handle RECONCILIATION_REQUIRED state
      if (execution.executionStatus === 'RECONCILIATION_REQUIRED') {
        const reconciliationResult = await this.settlementEngine.reconcileOutcome(
          execution.id,
          execution.authorizationId
        );

        if (reconciliationResult.settled) {
          // Settlement was completed on the adapter! Commit reservation if present
          if (execution.spendingReservationId) {
            await commitSpendingReservation(this.db, execution.spendingReservationId, execution.id);
          }

          const resId = execution.resourceId || 'res_gpu_h100_compute';
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(resId);
          const whereClause = isUuid
            ? or(eq(mockMerchantResources.id, resId), eq(mockMerchantResources.productId, resId))
            : eq(mockMerchantResources.id, resId);

          const [resRecord] = await this.db
            .select()
            .from(mockMerchantResources)
            .where(whereClause)
            .limit(1);

          let deliveredPayload: any = null;
          if (resRecord) {
            try {
              deliveredPayload = JSON.parse(resRecord.content);
            } catch {
              deliveredPayload = resRecord.content;
            }
          }

          const deliveredResource = resRecord
            ? {
                success: true,
                resourceId: resRecord.id,
                title: resRecord.name,
                description: resRecord.description,
                mimeType: resRecord.mimeType,
                deliveredPayload,
                accessGrantedAt: new Date().toISOString(),
                settlementReference: reconciliationResult.settlementReference,
                notice: 'Demonstration Resource — Delivered following successful settlement reconciliation.',
              }
            : null;

          const updated = await this.updateExecutionWithLease(execution.id, workerId, fencingToken, {
            executionStatus: 'SIMULATION_COMPLETED',
            fulfillmentStatus: deliveredResource ? 'DELIVERED' : 'DELIVERY_FAILED',
            settlementReference: reconciliationResult.settlementReference,
            deliveredResource,
            lastReconciledAt: new Date(),
            workerLeaseExpiresAt: null,
          });

          await recordAuditEvent(this.db, {
            userId: execution.userId,
            eventType: 'PAYMENT_SIMULATION_SETTLED',
            actorType: 'system',
            resourceType: 'payment_execution',
            resourceId: execution.id,
            payload: {
              reconciled: true,
              settlementReference: reconciliationResult.settlementReference,
              spendingReservationCommitted: !!execution.spendingReservationId,
            },
          });

          return {
            executionId: updated.id,
            executionStatus: updated.executionStatus,
            fulfillmentStatus: updated.fulfillmentStatus,
            fencingToken,
            settlementReference: updated.settlementReference,
            deliveredResource: updated.deliveredResource,
          };
        } else {
          // Still unconfirmed
          return {
            executionId: execution.id,
            executionStatus: 'RECONCILIATION_REQUIRED',
            fulfillmentStatus: execution.fulfillmentStatus,
            fencingToken,
            reconciliationPending: true,
            failureReason: 'Settlement status pending confirmation from simulation ledger',
          };
        }
      }

      // 4. State: VALIDATING - Run Blue Team Guardian Gate & Budget Reservation
      await this.updateExecutionWithLease(execution.id, workerId, fencingToken, {
        executionStatus: 'VALIDATING',
      });

      const proposedPayment = {
        amount: options?.simulateTamperedAmount || execution.amount,
        recipientAddress: options?.simulateTamperedRecipient || execution.recipientAddress,
        networkIdentifier: execution.networkIdentifier,
        assetIdentifier: execution.assetIdentifier,
        scheme: 'exact',
      };

      const guardianGate = await this.guardianEngine.evaluateAndAuthorize({
        userId: execution.userId,
        intent,
        snapshot,
        paymentExecutionId: execution.id,
        fencingToken,
        taskId: execution.purchaseIntentId,
        proposedPayment,
        now,
        appEnv: this.appEnv,
      });

      await recordAuditEvent(this.db, {
        userId: execution.userId,
        eventType: 'PAYMENT_AUTHORIZATION_GATED',
        actorType: 'guardian',
        resourceType: 'payment_execution',
        resourceId: execution.id,
        payload: {
          allowed: guardianGate.allowed,
          outcome: guardianGate.outcome,
          reasonCode: guardianGate.reasonCode,
          decisionId: guardianGate.decision.id,
          fencingToken,
        },
      });

      if (!guardianGate.allowed) {
        // Block execution
        const blocked = await this.updateExecutionWithLease(execution.id, workerId, fencingToken, {
          executionStatus: 'BLOCKED',
          failureCode: guardianGate.reasonCode,
          failureReason: guardianGate.reason,
          guardianDecisionId: guardianGate.decision.id,
          workerLeaseExpiresAt: null,
        });

        await recordAuditEvent(this.db, {
          userId: execution.userId,
          eventType: 'PAYMENT_SIMULATION_BLOCKED',
          actorType: 'guardian',
          resourceType: 'payment_execution',
          resourceId: execution.id,
          payload: {
            reasonCode: guardianGate.reasonCode,
            failureReason: guardianGate.reason,
            decisionId: guardianGate.decision.id,
          },
        });

        return {
          executionId: blocked.id,
          executionStatus: blocked.executionStatus,
          fulfillmentStatus: blocked.fulfillmentStatus,
          fencingToken,
          guardianDecisionId: guardianGate.decision.id,
          failureCode: blocked.failureCode,
          failureReason: blocked.failureReason,
        };
      }

      activePermit = guardianGate.permit;
      activeReservation = guardianGate.reservation;

      // 5. State: SIMULATING_AUTHORIZATION - Request requirements from Mock Merchant
      await this.updateExecutionWithLease(execution.id, workerId, fencingToken, {
        executionStatus: 'SIMULATING_AUTHORIZATION',
        permitId: activePermit?.permitId || null,
        guardianDecisionId: guardianGate.decision.id,
        spendingReservationId: activeReservation?.id || null,
      });

      const initialMerchantResp = await this.mockMerchant.handleResourceRequest({
        resourceId,
        ...(options?.mockMerchantFault === 'corrupt_requirements' || options?.mockMerchantFault === 'price_tamper'
          ? { faultInjection: options.mockMerchantFault }
          : {}),
      });

      if (initialMerchantResp.status !== 402) {
        throw AppError.badRequest('Expected HTTP 402 Payment Required from paywalled mock merchant');
      }

      const paymentRequiredHeader = initialMerchantResp.headers['payment-required'] || '';

      // Parse and strictly validate requirements against approved terms
      let parsedRequirements;
      try {
        parsedRequirements = parseAndValidatePaymentRequirements(paymentRequiredHeader, {
          scheme: snapshot.networkIdentifier === PHASE3_PINNED_EXECUTION.network ? 'exact' : 'exact-payment-v1',
          networkIdentifier: snapshot.networkIdentifier,
          assetIdentifier: snapshot.assetIdentifier,
          exactAmount: snapshot.exactAmount,
          trustedRecipientAddress: snapshot.trustedRecipientAddress,
          resourceId,
        });
      } catch (parseErr) {
        // Requirements validation failed -> safely release budget reservation
        if (activeReservation) {
          await releaseSpendingReservation(this.db, activeReservation.id, 'REQUIREMENTS_MISMATCH');
        }

        const blocked = await this.updateExecutionWithLease(execution.id, workerId, fencingToken, {
          executionStatus: 'BLOCKED',
          failureCode: 'REQUIREMENTS_MISMATCH',
          failureReason: (parseErr as Error).message,
          workerLeaseExpiresAt: null,
        });

        await recordAuditEvent(this.db, {
          userId: execution.userId,
          eventType: 'PAYMENT_SIMULATION_BLOCKED',
          actorType: 'guardian',
          resourceType: 'payment_execution',
          resourceId: execution.id,
          payload: {
            reasonCode: 'REQUIREMENTS_MISMATCH',
            failureReason: (parseErr as Error).message,
            reservationReleased: !!activeReservation,
          },
        });

        return {
          executionId: blocked.id,
          executionStatus: blocked.executionStatus,
          fulfillmentStatus: blocked.fulfillmentStatus,
          fencingToken,
          failureCode: 'REQUIREMENTS_MISMATCH',
          failureReason: blocked.failureReason,
        };
      }

      await recordAuditEvent(this.db, {
        userId: execution.userId,
        eventType: 'PAYMENT_REQUIREMENTS_PARSED',
        actorType: 'system',
        resourceType: 'payment_execution',
        resourceId: execution.id,
        payload: {
          x402Version: 2,
          network: parsedRequirements.matchedRequirement.network,
          asset: parsedRequirements.matchedRequirement.asset,
          amount: parsedRequirements.matchedRequirement.amount,
        },
      });

      // 6. Constrained Simulation Signer: Independent Validation and Signing
      // Stale worker test injection support
      const effectiveFencingToken = options?.simulateStaleWorkerFencingToken
        ? fencingToken + 999
        : fencingToken;

      const signingParams: {
        executionId: string;
        snapshot: any;
        intent: any;
        requirementItem: any;
        permit?: ExecutionPermit | undefined;
        fencingToken: number;
        requirePermit: boolean;
        db: any;
        resourceId: string;
        resourceUrl?: string | undefined;
      } = {
        executionId: execution.id,
        snapshot,
        intent,
        requirementItem: parsedRequirements.matchedRequirement,
        fencingToken: effectiveFencingToken,
        requirePermit: true,
        db: this.db,
        resourceId,
      };
      if (activePermit) signingParams.permit = activePermit;
      if (parsedRequirements.resource.url) signingParams.resourceUrl = parsedRequirements.resource.url;

      const signingResult = await this.constrainedSigner.signSimulationAuthorization(signingParams);

      // Persist authorizationId
      await this.updateExecutionWithLease(execution.id, workerId, fencingToken, {
        authorizationId: signingResult.authorizationId,
        executionStatus: 'SETTLING_SIMULATION',
      });

      await recordAuditEvent(this.db, {
        userId: execution.userId,
        eventType: 'PAYMENT_SIMULATION_SIGNED',
        actorType: 'guardian',
        resourceType: 'payment_execution',
        resourceId: execution.id,
        payload: {
          authorizationId: signingResult.authorizationId,
          snapshotId: snapshot.id,
          permitId: activePermit?.permitId,
          fencingToken,
        },
      });

      // Pre-settlement lease verification: confirm worker still holds valid lease and fencing token
      const [preSettlementRecord] = await this.db
        .select()
        .from(paymentExecutions)
        .where(eq(paymentExecutions.id, execution.id))
        .limit(1);

      if (
        !preSettlementRecord ||
        preSettlementRecord.workerId !== workerId ||
        preSettlementRecord.fencingToken !== fencingToken
      ) {
        throw AppError.conflict(
          'Worker lease lost or superseded prior to settlement submission. Settlement aborted to prevent duplicate settlement.',
          'STALE_WORKER_FENCING_TOKEN'
        );
      }

      // 7. State: SETTLING_SIMULATION - Submit PAYMENT-SIGNATURE to Mock Merchant
      const signatureHeader = encodeX402Header(signingResult.payload);

      let merchantSettlementResp;
      try {
        merchantSettlementResp = await this.mockMerchant.handleResourceRequest({
          resourceId,
          paymentSignatureHeader: signatureHeader,
          ...(options?.mockMerchantFault ? { faultInjection: options.mockMerchantFault } : {}),
        });
      } catch (networkOrTimeoutErr) {
        // Network timeout or lost response scenario -> Enter RECONCILIATION_REQUIRED
        // Invariant: Reservation remains RESERVED (held until reconciled)
        const reconcileReq = await this.updateExecutionWithLease(execution.id, workerId, fencingToken, {
          executionStatus: 'RECONCILIATION_REQUIRED',
          failureReason: (networkOrTimeoutErr as Error).message,
          lastReconciledAt: new Date(),
          reconciliationAttempts: execution.reconciliationAttempts + 1,
          workerLeaseExpiresAt: null,
        });

        await recordAuditEvent(this.db, {
          userId: execution.userId,
          eventType: 'PAYMENT_RECONCILIATION_ATTEMPTED',
          actorType: 'system',
          resourceType: 'payment_execution',
          resourceId: execution.id,
          payload: {
            reason: (networkOrTimeoutErr as Error).message,
            reservationStatus: 'RESERVED_HELD',
          },
        });

        return {
          executionId: reconcileReq.id,
          executionStatus: 'RECONCILIATION_REQUIRED',
          fulfillmentStatus: reconcileReq.fulfillmentStatus,
          fencingToken,
          reconciliationPending: true,
          failureReason: reconcileReq.failureReason,
        };
      }

      // 8. Handle Merchant Response
      if (merchantSettlementResp.status === 200) {
        // Simulation settled and resource delivered successfully!
        // Invariant: Commit spending reservation upon successful settlement
        if (activeReservation) {
          await commitSpendingReservation(this.db, activeReservation.id, execution.id);
        }

        const paymentRespHeader = merchantSettlementResp.headers['payment-response'];
        let settlementRef = `sim_settlement_${signingResult.authorizationId}`;
        if (paymentRespHeader) {
          try {
            const decodedSettlement = decodeX402Header<X402V2SettlementResponse>(paymentRespHeader);
            if (decodedSettlement.transactionHash) {
              settlementRef = decodedSettlement.transactionHash;
            }
          } catch {
            // Use stable ref
          }
        }

        const completed = await this.updateExecutionWithLease(execution.id, workerId, fencingToken, {
          executionStatus: 'SIMULATION_COMPLETED',
          fulfillmentStatus: 'DELIVERED',
          settlementReference: settlementRef,
          deliveredResource: merchantSettlementResp.body,
          workerLeaseExpiresAt: null,
        });

        await recordAuditEvent(this.db, {
          userId: execution.userId,
          eventType: 'PAYMENT_SIMULATION_SETTLED',
          actorType: 'system',
          resourceType: 'payment_execution',
          resourceId: execution.id,
          payload: {
            settlementReference: settlementRef,
            amount: snapshot.exactAmount,
            network: snapshot.networkIdentifier,
            reservationCommitted: !!activeReservation,
          },
        });

        await recordAuditEvent(this.db, {
          userId: execution.userId,
          eventType: 'DEMO_RESOURCE_DELIVERED',
          actorType: 'system',
          resourceType: 'payment_execution',
          resourceId: execution.id,
          payload: {
            resourceId,
          },
        });

        return {
          executionId: completed.id,
          executionStatus: completed.executionStatus,
          fulfillmentStatus: completed.fulfillmentStatus,
          fencingToken,
          settlementReference: completed.settlementReference,
          deliveredResource: completed.deliveredResource,
        };
      }

      // Check if simulation was settled, but resource delivery failed
      if (merchantSettlementResp.body?.settled) {
        // Invariant: Commit spending reservation because payment settled on the ledger!
        if (activeReservation) {
          await commitSpendingReservation(this.db, activeReservation.id, execution.id);
        }

        const settlementRef = merchantSettlementResp.body.settlementReference || `sim_settlement_${signingResult.authorizationId}`;
        const delivFailed = await this.updateExecutionWithLease(execution.id, workerId, fencingToken, {
          executionStatus: 'SIMULATION_COMPLETED',
          fulfillmentStatus: 'DELIVERY_FAILED',
          settlementReference: settlementRef,
          failureReason: merchantSettlementResp.body.error,
          workerLeaseExpiresAt: null,
        });

        await recordAuditEvent(this.db, {
          userId: execution.userId,
          eventType: 'DEMO_RESOURCE_DELIVERY_FAILED',
          actorType: 'system',
          resourceType: 'payment_execution',
          resourceId: execution.id,
          payload: {
            error: merchantSettlementResp.body.error,
            reservationCommitted: !!activeReservation,
          },
        });

        return {
          executionId: delivFailed.id,
          executionStatus: delivFailed.executionStatus,
          fulfillmentStatus: delivFailed.fulfillmentStatus,
          fencingToken,
          settlementReference: delivFailed.settlementReference,
          failureReason: delivFailed.failureReason,
        };
      }

      // Otherwise: Definitive failure / settlement rejected
      // Invariant: Release spending reservation safely
      const failureMsg = merchantSettlementResp.body?.error || merchantSettlementResp.body?.details || 'Payment settlement rejected';
      if (activeReservation) {
        await releaseSpendingReservation(this.db, activeReservation.id, failureMsg);
      }

      const failed = await this.updateExecutionWithLease(execution.id, workerId, fencingToken, {
        executionStatus: 'FAILED',
        failureCode: 'SETTLEMENT_REJECTED',
        failureReason: failureMsg,
        workerLeaseExpiresAt: null,
      });

      await recordAuditEvent(this.db, {
        userId: execution.userId,
        eventType: 'PAYMENT_SIMULATION_FAILED',
        actorType: 'system',
        resourceType: 'payment_execution',
        resourceId: execution.id,
        payload: {
          failureReason: failureMsg,
          reservationReleased: !!activeReservation,
        },
      });

      return {
        executionId: failed.id,
        executionStatus: failed.executionStatus,
        fulfillmentStatus: failed.fulfillmentStatus,
        fencingToken,
        failureCode: failed.failureCode,
        failureReason: failed.failureReason,
      };
    } catch (unexpectedErr) {
      // Clear lease on unhandled exception ONLY if this worker still holds the lease and fencing token
      await this.db
        .update(paymentExecutions)
        .set({
          workerLeaseExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(paymentExecutions.id, execution.id),
            eq(paymentExecutions.workerId, workerId),
            eq(paymentExecutions.fencingToken, fencingToken)
          )
        );

      throw unexpectedErr;
    }
  }

  /**
   * Safe retry:
   * 1. If in RECONCILIATION_REQUIRED -> Reconciles outcome without charging again.
   * 2. If in SIMULATION_COMPLETED + DELIVERY_FAILED -> Retries resource delivery without charging again.
   */
  async retryExecution(executionId: string, userId: string): Promise<ExecutionRunResult> {
    const [execution] = await this.db
      .select()
      .from(paymentExecutions)
      .where(and(eq(paymentExecutions.id, executionId), eq(paymentExecutions.userId, userId)))
      .limit(1);

    if (!execution) {
      throw AppError.notFound('Payment Execution');
    }

    if (execution.executionStatus === 'RECONCILIATION_REQUIRED') {
      return this.processExecution(executionId);
    }

    if (execution.executionStatus === 'SIMULATION_COMPLETED' && execution.fulfillmentStatus === 'DELIVERY_FAILED') {
      // Fetch resource from DB directly since payment was already settled
      const resId = execution.resourceId || 'res_gpu_h100_compute';
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(resId);
      const whereClause = isUuid
        ? or(eq(mockMerchantResources.id, resId), eq(mockMerchantResources.productId, resId))
        : eq(mockMerchantResources.id, resId);

      const [resource] = await this.db
        .select()
        .from(mockMerchantResources)
        .where(whereClause)
        .limit(1);

      if (resource) {
        let parsedContent = resource.content;
        try {
          parsedContent = JSON.parse(resource.content);
        } catch {}

        const deliveredResource = {
          success: true,
          resourceId: resource.id,
          title: resource.name,
          description: resource.description,
          mimeType: resource.mimeType,
          deliveredPayload: parsedContent,
          accessGrantedAt: new Date().toISOString(),
          settlementReference: execution.settlementReference,
          notice: 'Demonstration Resource — Re-delivered successfully after verification.',
        };

        const [updated] = await this.db
          .update(paymentExecutions)
          .set({
            fulfillmentStatus: 'DELIVERED',
            deliveredResource,
            failureReason: null,
            updatedAt: new Date(),
          })
          .where(eq(paymentExecutions.id, execution.id))
          .returning();

        await recordAuditEvent(this.db, {
          userId,
          eventType: 'DEMO_RESOURCE_DELIVERED',
          actorType: 'system',
          resourceType: 'payment_execution',
          resourceId: execution.id,
          payload: {
            retrySuccess: true,
          },
        });

        return {
          executionId: updated.id,
          executionStatus: updated.executionStatus,
          fulfillmentStatus: updated.fulfillmentStatus,
          fencingToken: updated.fencingToken,
          settlementReference: updated.settlementReference,
          deliveredResource: updated.deliveredResource,
        };
      }
    }

    throw AppError.badRequest(
      `Cannot retry execution in status ${execution.executionStatus} / ${execution.fulfillmentStatus}`
    );
  }
}
