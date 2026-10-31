import { auditEvents } from '@x402/database/schema';
import type { CreateAuditEventDto } from '@x402/shared';

export async function recordAuditEvent(
  db: any,
  event: CreateAuditEventDto
): Promise<void> {
  try {
    await db.insert(auditEvents).values({
      userId: event.userId || null,
      eventType: event.eventType,
      actorType: event.actorType,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      payload: event.payload || {},
      ipAddress: event.ipAddress || null,
      userAgent: event.userAgent || null,
    });
  } catch (err) {
    // We log but never swallow fatal DB errors in security flows
    console.error('[AUDIT ERROR] Failed to record audit event:', err, event);
    throw err;
  }
}
