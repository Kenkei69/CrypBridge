export type PaymentAttemptStatus = 'initiated' | 'in_progress' | 'succeeded' | 'failed';

export type SettlementType = 'simulated' | 'onchain_testnet' | 'onchain_mainnet';

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
  paymentAttemptId: string;
  purchaseIntentId: string;
  assetIdentifier: string;
  networkIdentifier: string;
  amount: string;
  recipientAddress: string;
  settlementType: SettlementType;
  settlementReference: string | null;
  settledAt: string;
  createdAt: string;
}
