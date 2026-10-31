/**
 * x402 Wire Types
 * Represents the wire formats specified by the x402 specification (draft-v1).
 *
 * CRITICAL ARCHITECTURAL BOUNDARY:
 * These wire types MUST remain strictly separated from internal domain entities
 * (e.g. PurchaseIntent, ApprovalSnapshot). External untrusted wire responses
 * are validated, normalized, and mapped to internal models only after passing
 * guardian security rules and trusted catalog reconciliation.
 */

export interface X402PaymentRequirement {
  version: string; // e.g. "draft-v1"
  scheme: string; // e.g. "exact-payment-v1"
  network: string; // e.g. "eip155:84532"
  asset: string; // e.g. "USDC"
  amount: string; // Base-unit integer string
  payTo: string; // Merchant proposed recipient address
  maxTimeoutSeconds?: number;
  data?: Record<string, unknown>;
}

export interface X402ChallengeHeader {
  x402Version: string;
  requirements: X402PaymentRequirement[];
}

export interface X402PaymentAuthorization {
  version: string;
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  recipient: string;
  signature: string;
  approvalReference: string;
  simulated?: boolean;
}

export interface X402SettlementResult {
  settled: boolean;
  settlementType: 'simulated' | 'onchain';
  settlementId: string;
  network: string;
  asset: string;
  amount: string;
  timestamp: string;
}
