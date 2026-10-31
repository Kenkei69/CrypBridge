import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import {
  AppError,
  SpendingPolicyUpdateSchema,
  GuardianDecisionQuerySchema,
  BudgetQuerySchema,
} from '@x402/shared';
import { guardianPolicies } from '@x402/database/schema';
import { getEffectivePolicy, getUserBudgetSummary } from './reservationService.js';
import { listGuardianDecisions, getGuardianDecisionById } from './decisionRepository.js';
import { recordAuditEvent } from '../audit/auditService.js';

export async function guardianRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/guardian/policy - Effective policy for authenticated user
  app.get(
    '/api/v1/guardian/policy',
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest) => {
      const authUser = request.user;
      const query = request.query as Record<string, string>;
      const asset = query['asset'] || query['assetIdentifier'] || 'USDC';
      const network = query['network'] || query['networkIdentifier'] || 'eip155:84532';

      const policy = await getEffectivePolicy(app.db, authUser.id, asset, network);
      return { policy };
    }
  );

  // GET /api/v1/guardian/budget - Current budget summary & limits for user
  app.get(
    '/api/v1/guardian/budget',
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest) => {
      const authUser = request.user;
      const parsed = BudgetQuerySchema.safeParse(request.query);
      const asset = parsed.success ? parsed.data.assetIdentifier : 'USDC';
      const network = parsed.success ? parsed.data.networkIdentifier : 'eip155:84532';

      const summary = await getUserBudgetSummary(app.db, authUser.id, asset, network);
      return { budget: summary };
    }
  );

  // GET /api/v1/guardian/decisions - Explainable decision history (user-isolated)
  app.get(
    '/api/v1/guardian/decisions',
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest) => {
      const authUser = request.user;
      const parsed = GuardianDecisionQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw parsed.error;
      }

      const { outcome, limit, offset, intentId, executionId } = parsed.data;
      const queryParams: {
        userId: string;
        outcome: 'ALLOW' | 'BLOCK' | 'ALL';
        limit: number;
        offset: number;
        purchaseIntentId?: string | undefined;
        paymentExecutionId?: string | undefined;
      } = {
        userId: authUser.id,
        outcome,
        limit,
        offset,
      };
      if (intentId) queryParams.purchaseIntentId = intentId;
      if (executionId) queryParams.paymentExecutionId = executionId;

      const result = await listGuardianDecisions(app.db, queryParams);

      return {
        decisions: result.decisions,
        pagination: {
          total: result.totalCount,
          limit,
          offset,
        },
      };
    }
  );

  // GET /api/v1/guardian/decisions/:id - Decision detail inspection (user-isolated)
  app.get<{ Params: { id: string } }>(
    '/api/v1/guardian/decisions/:id',
    { preHandler: [app.authenticate] },
    async (request) => {
      const authUser = request.user;
      const { id } = request.params;

      const decision = await getGuardianDecisionById(app.db, id, authUser.id);
      if (!decision) {
        throw AppError.notFound(`Guardian Decision '${id}'`);
      }

      return { decision };
    }
  );

  // PUT /api/v1/admin/guardian/policy - Administrator spending policy update (Admin only)
  app.put(
    '/api/v1/admin/guardian/policy',
    { preHandler: [app.requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authUser = request.user;
      const parsed = SpendingPolicyUpdateSchema.safeParse(request.body);
      if (!parsed.success) {
        throw parsed.error;
      }

      const {
        assetIdentifier,
        networkIdentifier,
        maxAmountPerPayment,
        maxAmountPerTask,
        maxAmountPerDailyWindow,
        dailyWindowSeconds,
        isActive,
      } = parsed.data;

      // Find existing active global policy or create next version
      const existing = await app.db
        .select()
        .from(guardianPolicies)
        .where(
          sql`${guardianPolicies.userId} IS NULL AND ${guardianPolicies.assetIdentifier} = ${assetIdentifier} AND ${guardianPolicies.networkIdentifier} = ${networkIdentifier}`
        )
        .limit(1);

      let updatedPolicy;
      const current = existing[0];

      if (current) {
        const nextVersion = current.policyVersion + 1;
        const [updated] = await app.db
          .update(guardianPolicies)
          .set({
            policyVersion: nextVersion,
            maxAmountPerPayment,
            maxAmountPerTask,
            maxAmountPerDailyWindow,
            dailyWindowSeconds,
            isActive,
            updatedAt: new Date(),
          })
          .where(eq(guardianPolicies.id, current.id))
          .returning();
        updatedPolicy = updated;
      } else {
        const [inserted] = await app.db
          .insert(guardianPolicies)
          .values({
            userId: null,
            policyVersion: 1,
            assetIdentifier,
            networkIdentifier,
            maxAmountPerPayment,
            maxAmountPerTask,
            maxAmountPerDailyWindow,
            dailyWindowSeconds,
            isActive,
          })
          .returning();
        updatedPolicy = inserted;
      }

      await recordAuditEvent(app.db, {
        userId: authUser.id,
        eventType: 'GUARDIAN_POLICY_UPDATED',
        actorType: 'admin',
        resourceType: 'guardian_policy',
        resourceId: updatedPolicy ? updatedPolicy.id : 'unknown',
        payload: {
          action: 'update_spending_policy',
          policyVersion: updatedPolicy ? updatedPolicy.policyVersion : 1,
          assetIdentifier,
          networkIdentifier,
          maxAmountPerPayment,
          maxAmountPerDailyWindow,
        },
        ipAddress: request.ip || null,
        userAgent: (request.headers['user-agent'] as string) || null,
      });

      return reply.status(200).send({
        policy: updatedPolicy,
        notice: 'Spending policy updated successfully.',
      });
    }
  );
}
