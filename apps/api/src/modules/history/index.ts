import type { FastifyInstance, FastifyRequest } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import { purchaseIntents, approvalSnapshots, auditEvents } from '@x402/database/schema';
import type { EnvConfig } from '../../config/env.js';

export async function historyRoutes(app: FastifyInstance, opts: { config: EnvConfig }): Promise<void> {
  const getSecurityHistory = async (request: FastifyRequest) => {
    const userId = request.user.id;

    const intents = await app.db
      .select()
      .from(purchaseIntents)
      .where(eq(purchaseIntents.userId, userId))
      .orderBy(desc(purchaseIntents.createdAt))
      .limit(50);

    const snapshots = await app.db
      .select()
      .from(approvalSnapshots)
      .where(eq(approvalSnapshots.userId, userId))
      .orderBy(desc(approvalSnapshots.createdAt))
      .limit(50);

    const userAudit = await app.db
      .select({
        id: auditEvents.id,
        eventType: auditEvents.eventType,
        actorType: auditEvents.actorType,
        resourceType: auditEvents.resourceType,
        resourceId: auditEvents.resourceId,
        payload: auditEvents.payload,
        createdAt: auditEvents.createdAt,
      })
      .from(auditEvents)
      .where(eq(auditEvents.userId, userId))
      .orderBy(desc(auditEvents.createdAt))
      .limit(50);

    return {
      simulationMode: opts.config.SIMULATION_MODE,
      disclaimer: 'Simulation mode active. No funds have been settled or signed onchain.',
      history: {
        intents,
        approvals: snapshots,
        auditEvents: userAudit,
      },
    };
  };

  app.get('/api/v1/history', { preHandler: [app.authenticate] }, getSecurityHistory);
  app.get('/api/v1/security/history', { preHandler: [app.authenticate] }, getSecurityHistory);
}
