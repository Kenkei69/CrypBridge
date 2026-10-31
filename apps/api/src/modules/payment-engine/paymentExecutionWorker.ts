import crypto from 'node:crypto';
import { eq, and, or, lt, isNull } from 'drizzle-orm';
import {
  AppError,
  encodeX402Header,
  decodeX402Header,
  PHASE3_PINNED_EXECUTION,
  type X402V2SettlementResponse,
} from '@x402/shared';
import {
  paymentExecutions,
  purchaseIntents,
  approvalSnapshots,
  products,
  mockMerchantResources,
} from '@x402/database/schema';
import { recordAuditEvent } from '../audit/auditService.js';
import { evaluateAuthorizationGate } from './authorizationGate.js';
import { parseAndValidatePaymentRequirements } from './requirementsParser.js';
import { ConstrainedSimulationSigner } from './constrainedSigner.js';
import { MockMerchantService, type MockMerchantRequest } from '../mock-merchant/mockMerchantService.js';
import { SimulationSettlementEngine } from './simulationSettlementAdapter.js';

export interface ProcessExecutionOptions {
  workerId?: string;
  leaseDurationMs?: number;
  mockMerchantFault?: MockMerchantRequest['faultInjection'];
}

export interface ExecutionRunResult {
  executionId: string;
  executionStatus: string;
  fulfillmentStatus: string;
  settlementReference?: string | null;
  deliveredResource?: any;
  failureReason?: string | null;
  reconciliationPending?: boolean;
}

/**
 * Payment Execution Worker for Phase 3.
 *
 * Implements a durable, atomic, lease-bounded state machine:
 * QUEUED -> VALIDATING -> SIMULATING_AUTHORIZATION -> SETTLING_SIMULATION -> SIMULATION_COMPLETED (or BLOCKED / FAILED / RECONCILIATION_REQUIRED).
 */
export class PaymentExecutionWorker {
  private readonly db: any;
  private readonly appEnv: string;
  private readonly constrainedSigner: ConstrainedSimulationSigner;
  private readonly mockMerchant: MockMerchantService;
  private readonly settlementEngine: SimulationSettlementEngine;

  constructor(db: any, appEnv = 'development') {
    this.db = db;
    this.appEnv = appEnv;
    this.constrainedSigner = new ConstrainedSimulationSigner(appEnv);
    this.mockMerchant = new MockMerchantService(db, appEnv);
    this.settlementEngine = new SimulationSettlementEngine(db, appEnv);
  }

  /**
   * Helper to ensure execution updates only succeed if this worker still holds the lease.
   * If a lease expired and was claimed by another worker, this will safely fail with WORKER_LEASE_LOST
   * rather than overwriting newer state.
   */
  private async updateExecutionWithLease(
    executionId: string,
    workerId: string,
    updateData: Record<string, any>
  ): Promise<any> {
    const [updated] = await this.db
      .update(paymentExecutions)
      .set({
        ...updateData,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(paymentExecutions.id, executionId),
          eq(paymentExecutions.workerId, workerId)
        )
      )
      .returning();

    if (!updated) {
      throw AppError.conflict(
        `Worker lease lost or reassigned to another worker for execution ${executionId}. Operation aborted to preserve execution state integrity.`,
        'WORKER_LEASE_LOST'
      );
    }
    return updated;
  }

  /**
   * Processes a single payment execution record through the Phase 3 lifecycle.
   */
  async processExecution(
    executionId: string,
    options?: ProcessExecutionOptions
  ): Promise<ExecutionRunResult> {
    const workerId = options?.workerId || `worker_${crypto.randomUUID()}`;
    const leaseMs = options?.leaseDurationMs || 30000;
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + leaseMs);

    // 1. Atomic Lease Claim: Acquire lock on the execution record
    // Only claim if unleased or previous lease expired, and not already completed/canceled
    const claimedList = await this.db
      .update(paymentExecutions)
      .set({
        workerId,
        workerLeaseExpiresAt: leaseExpiresAt,
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
        settlementReference: existing.settlementReference,
        deliveredResource: existing.deliveredResource,
        failureReason: existing.failureReason,
        reconciliationPending: existing.executionStatus === 'RECONCILIATION_REQUIRED',
      };
    }

    const execution = claimedList[0];

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
          // Settlement was completed on the adapter! Fetch resource and complete.
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

          const updated = await this.updateExecutionWithLease(execution.id, workerId, {
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
            },
          });

          return {
            executionId: updated.id,
            executionStatus: updated.executionStatus,
            fulfillmentStatus: updated.fulfillmentStatus,
            settlementReference: updated.settlementReference,
            deliveredResource: updated.deliveredResource,
          };
        } else {
          // Still unconfirmed
          return {
            executionId: execution.id,
            executionStatus: 'RECONCILIATION_REQUIRED',
            fulfillmentStatus: execution.fulfillmentStatus,
            reconciliationPending: true,
            failureReason: 'Settlement status pending confirmation from simulation ledger',
          };
        }
      }

      // 4. State: VALIDATING - Run Authorization Gate
      await this.updateExecutionWithLease(execution.id, workerId, {
        executionStatus: 'VALIDATING',
      });

      const gateDecision = evaluateAuthorizationGate(
        {
          userId: execution.userId,
          intent,
          snapshot,
        },
        this.appEnv
      );

      await recordAuditEvent(this.db, {
        userId: execution.userId,
        eventType: 'PAYMENT_AUTHORIZATION_GATED',
        actorType: 'guardian',
        resourceType: 'payment_execution',
        resourceId: execution.id,
        payload: {
          allowed: gateDecision.allowed,
          reasonCode: gateDecision.reasonCode,
          message: gateDecision.message,
        },
      });

      if (!gateDecision.allowed) {
        // Block execution
        const blocked = await this.updateExecutionWithLease(execution.id, workerId, {
          executionStatus: 'BLOCKED',
          failureCode: gateDecision.reasonCode,
          failureReason: gateDecision.message,
          workerLeaseExpiresAt: null,
        });

        await recordAuditEvent(this.db, {
          userId: execution.userId,
          eventType: 'PAYMENT_SIMULATION_BLOCKED',
          actorType: 'guardian',
          resourceType: 'payment_execution',
          resourceId: execution.id,
          payload: {
            reasonCode: gateDecision.reasonCode,
            failureReason: gateDecision.message,
          },
        });

        return {
          executionId: blocked.id,
          executionStatus: blocked.executionStatus,
          fulfillmentStatus: blocked.fulfillmentStatus,
          failureReason: blocked.failureReason,
        };
      }

      // 5. State: SIMULATING_AUTHORIZATION - Request requirements from Mock Merchant
      await this.updateExecutionWithLease(execution.id, workerId, {
        executionStatus: 'SIMULATING_AUTHORIZATION',
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
        // Requirements validation failed
        const blocked = await this.updateExecutionWithLease(execution.id, workerId, {
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
          },
        });

        return {
          executionId: blocked.id,
          executionStatus: blocked.executionStatus,
          fulfillmentStatus: blocked.fulfillmentStatus,
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
      const signingResult = await this.constrainedSigner.signSimulationAuthorization({
        executionId: execution.id,
        snapshot,
        intent,
        requirementItem: parsedRequirements.matchedRequirement,
        resourceId,
        resourceUrl: parsedRequirements.resource.url,
      });

      // Persist authorizationId
      await this.updateExecutionWithLease(execution.id, workerId, {
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
        },
      });

      // Pre-settlement lease verification: confirm worker still holds valid lease before initiating settlement
      const [preSettlementRecord] = await this.db
        .select()
        .from(paymentExecutions)
        .where(eq(paymentExecutions.id, execution.id))
        .limit(1);

      if (!preSettlementRecord || preSettlementRecord.workerId !== workerId) {
        throw AppError.conflict(
          'Worker lease lost or reassigned prior to settlement submission. Settlement aborted to prevent duplicate settlement.',
          'WORKER_LEASE_LOST'
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
        const reconcileReq = await this.updateExecutionWithLease(execution.id, workerId, {
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
          },
        });

        return {
          executionId: reconcileReq.id,
          executionStatus: 'RECONCILIATION_REQUIRED',
          fulfillmentStatus: reconcileReq.fulfillmentStatus,
          reconciliationPending: true,
          failureReason: reconcileReq.failureReason,
        };
      }

      // 8. Handle Merchant Response
      if (merchantSettlementResp.status === 200) {
        // Simulation settled and resource delivered successfully!
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

        const completed = await this.updateExecutionWithLease(execution.id, workerId, {
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
          settlementReference: completed.settlementReference,
          deliveredResource: completed.deliveredResource,
        };
      }

      // Check if simulation was settled, but resource delivery failed
      if (merchantSettlementResp.body?.settled) {
        const settlementRef = merchantSettlementResp.body.settlementReference || `sim_settlement_${signingResult.authorizationId}`;
        const delivFailed = await this.updateExecutionWithLease(execution.id, workerId, {
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
          },
        });

        return {
          executionId: delivFailed.id,
          executionStatus: delivFailed.executionStatus,
          fulfillmentStatus: delivFailed.fulfillmentStatus,
          settlementReference: delivFailed.settlementReference,
          failureReason: delivFailed.failureReason,
        };
      }

      // Otherwise: Definitive failure
      const failureMsg = merchantSettlementResp.body?.error || merchantSettlementResp.body?.details || 'Payment settlement rejected';
      const failed = await this.updateExecutionWithLease(execution.id, workerId, {
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
        },
      });

      return {
        executionId: failed.id,
        executionStatus: failed.executionStatus,
        fulfillmentStatus: failed.fulfillmentStatus,
        failureReason: failed.failureReason,
      };
    } catch (unexpectedErr) {
      // Clear lease on unhandled exception ONLY if this worker still holds the lease
      await this.db
        .update(paymentExecutions)
        .set({
          workerLeaseExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(paymentExecutions.id, execution.id),
            eq(paymentExecutions.workerId, workerId)
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
