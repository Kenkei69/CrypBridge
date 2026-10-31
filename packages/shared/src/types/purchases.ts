export type PurchaseIntentStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'superseded'
  | 'expired';

export type ApprovalSnapshotStatus = 'active' | 'superseded' | 'expired' | 'consumed';

export interface PurchaseIntent {
  id: string;
  userId: string;
  conversationId: string | null;
  productId: string;
  merchantId: string;
  proposedAmount: string; // Base-units integer string, e.g. "5000000"
  currency: string;
  assetIdentifier: string;
  networkIdentifier: string;
  status: PurchaseIntentStatus;
  product?: {
    id: string;
    name: string;
    description: string;
  };
  merchant?: {
    id: string;
    name: string;
    trustedRecipientAddress: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalSnapshotSchemeParameters {
  maxFee?: string;
  validAfter?: number;
  nonce?: string;
  signatureScheme?: string;
  [key: string]: unknown;
}

export interface ApprovalSnapshot {
  id: string;
  userId: string;
  purchaseIntentId: string;
  productId: string;
  merchantId: string;
  trustedRecipientAddress: string;
  exactAmount: string; // Base units integer string
  assetIdentifier: string;
  networkIdentifier: string;
  approvalVersion: number;
  schemeParameters: ApprovalSnapshotSchemeParameters;
  status: ApprovalSnapshotStatus;
  expiresAt: string;
  approvedAt: string;
  createdAt: string;
  updatedAt: string;
}
