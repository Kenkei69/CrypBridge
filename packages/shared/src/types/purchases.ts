import type { PaymentOption } from './catalog.js';

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
  selectedPaymentOptionId?: string | null;
  proposedAmount: string; // Base-units integer string, e.g. "5000000"
  currency: string;
  assetIdentifier: string;
  networkIdentifier: string;
  version: number;
  status: PurchaseIntentStatus;
  rejectionReason?: string | null;
  idempotencyKey?: string | null;
  expiresAt?: string | null;
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
  selectedPaymentOption?: PaymentOption | null;
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
  paymentOptionId?: string | null;
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

export interface ApprovalPreview {
  intentId: string;
  version: number;
  productId: string;
  productName: string;
  productDescription: string;
  merchantId: string;
  merchantName: string;
  trustedRecipientAddress: string;
  amount: string; // Base-units integer string
  displayAmount: string; // Human-readable e.g. "$5.00"
  assetIdentifier: string;
  currency: string;
  networkIdentifier: string;
  paymentOptionId: string;
  availablePaymentOptions: PaymentOption[];
  expiresAt: string;
  status: PurchaseIntentStatus;
  isExpired: boolean;
  canApprove: boolean;
  activeApprovalSnapshot?: ApprovalSnapshot | null;
  simulatedNotice: string;
}

export interface ApprovePurchaseIntentDto {
  expectedVersion: number;
  idempotencyKey?: string;
}

export interface SelectPaymentOptionDto {
  paymentOptionId: string;
}

export interface RejectPurchaseIntentDto {
  reason?: string;
}
