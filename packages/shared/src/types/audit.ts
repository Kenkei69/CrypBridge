export type ActorType = 'user' | 'guardian' | 'system' | 'admin';

export type AuditEventType =
  | 'AUTH_LOGIN'
  | 'AUTH_LOGOUT'
  | 'AUTH_TOKEN_ISSUED'
  | 'CONVERSATION_CREATED'
  | 'MESSAGE_SENT'
  | 'PURCHASE_INTENT_CREATED'
  | 'PURCHASE_INTENT_UPDATED'
  | 'PAYMENT_OPTION_CHANGED'
  | 'PURCHASE_INTENT_REJECTED'
  | 'APPROVAL_SNAPSHOT_CREATED'
  | 'APPROVAL_SNAPSHOT_SUPERSEDED'
  | 'GUARDIAN_EVALUATED'
  | 'PAYMENT_ATTEMPT_INITIATED'
  | 'PAYMENT_SETTLED_SIMULATED'
  | 'PAYMENT_EXECUTION_QUEUED'
  | 'PAYMENT_REQUIREMENTS_PARSED'
  | 'PAYMENT_AUTHORIZATION_GATED'
  | 'PAYMENT_SIMULATION_SIGNED'
  | 'PAYMENT_SIMULATION_SETTLED'
  | 'PAYMENT_SIMULATION_BLOCKED'
  | 'PAYMENT_SIMULATION_FAILED'
  | 'PAYMENT_RECONCILIATION_ATTEMPTED'
  | 'DEMO_RESOURCE_DELIVERED'
  | 'DEMO_RESOURCE_DELIVERY_FAILED'
  | 'KILL_SWITCH_TRIGGERED'
  | 'SECURITY_ALERT_TRIGGERED'
  | 'GUARDIAN_POLICY_UPDATED'
  | 'USER_PROFILE_UPDATED';

export interface AuditEvent {
  id: string;
  userId: string | null;
  eventType: AuditEventType;
  actorType: ActorType;
  resourceType: string;
  resourceId: string;
  payload: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface CreateAuditEventDto {
  userId?: string | null;
  eventType: AuditEventType;
  actorType: ActorType;
  resourceType: string;
  resourceId: string;
  payload?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}
