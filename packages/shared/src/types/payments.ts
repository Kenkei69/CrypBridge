export type PaymentAttemptStatus = 'initiated' | 'in_progress' | 'succeeded' | 'failed';

export type SettlementType = 'simulated' | 'onchain_testnet' | 'onchain_mainnet';

export type ExecutionStatus =
  | 'QUEUED'
  | 'VALIDATING'
  | 'SIMULATING_AUTHORIZATION'
  | 'SETTLING_SIMULATION'
  | 'SIMULATION_COMPLETED'
  | 'BLOCKED'
  | 'FAILED'
  | 'EXPIRED'
  | 'CANCELED'
  | 'RECONCILIATION_REQUIRED';

export type FulfillmentStatus = 'NOT_STARTED' | 'DELIVERED' | 'DELIVERY_FAILED';

export interface PaymentExecution {
  id: string;
  userId: string;
  purchaseIntentId: string;
  approvalSnapshotId: string;
  executionStatus: ExecutionStatus;
  fulfillmentStatus: FulfillmentStatus;
  networkIdentifier: string;
  assetIdentifier: string;
  amount: string; // Base units integer string
  recipientAddress: string;
  merchantId: string;
  resourceId?: string | null;
  authorizationId?: string | null;
  settlementReference?: string | null;
  idempotencyKey?: string | null;
  failureCode?: string | null;
  failureReason?: string | null;
  fencingToken?: number | null;
  permitId?: string | null;
  guardianDecisionId?: string | null;
  spendingReservationId?: string | null;
  reconciliationAttempts: number;
  lastReconciledAt?: string | null;
  deliveredResource?: {
    resourceId: string;
    title: string;
    description?: string;
    content?: string;
    deliveredPayload?: any;
    mimeType: string;
    accessGrantedAt: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface DemonstrationResource {
  id: string;
  productId: string;
  merchantId: string;
  name: string;
  description: string;
  content: string;
  mimeType: string;
  createdAt: string;
}

export interface PaymentAttempt {
  id: string;
  purchaseIntentId: string;
  approvalSnapshotId: string | null;
  status: PaymentAttemptStatus;
  simulated: boolean;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SettlementRecord {
  id: string;
  paymentAttemptId?: string | null;
  purchaseIntentId: string;
  paymentExecutionId?: string | null;
  assetIdentifier: string;
  networkIdentifier: string;
  amount: string;
  recipientAddress: string;
  settlementType: SettlementType;
  settlementReference: string | null;
  settledAt: string;
  createdAt: string;
}
