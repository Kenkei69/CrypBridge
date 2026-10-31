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

/**
 * x402 V2 Wire Protocol Specification Types
 *
 * Implements the official x402 V2 protocol specification:
 * - Integer protocol version: x402Version: 2
 * - HTTP Headers: PAYMENT-REQUIRED, PAYMENT-SIGNATURE, PAYMENT-RESPONSE
 * - Base64 encoded JSON transport
 */

export interface X402V2ResourceMetadata {
  url: string;
  description?: string | undefined;
  mimeType?: string | undefined;
}

export interface X402V2RequirementItem {
  scheme: string; // e.g. "exact"
  network: string; // e.g. "eip155:84532"
  amount: string; // Base-unit integer string, e.g. "5000000"
  asset: string; // e.g. "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
  payTo: string; // Verified merchant recipient address
  maxTimeoutSeconds?: number | undefined;
  extra?: Record<string, unknown> | undefined;
}

export interface X402V2PaymentRequired {
  x402Version: 2;
  error?: string | undefined;
  resource: X402V2ResourceMetadata;
  accepts: X402V2RequirementItem[];
  extensions?: Record<string, unknown> | undefined;
}

export interface X402V2PaymentPayload {
  x402Version: 2;
  accepted: X402V2RequirementItem;
  payload: {
    authorizationId: string;
    signature: string; // Constrained simulation signature
    timestamp: string;
    intentId: string;
    approvalSnapshotId: string;
    approvalVersion: number;
    simulated: true;
    extra?: Record<string, unknown> | undefined;
  };
  resource?: {
    url: string;
  } | undefined;
  extensions?: Record<string, unknown> | undefined;
}

export interface X402V2SettlementResponse {
  success: boolean;
  network: string;
  transactionHash?: string | undefined; // In simulation: "sim_settle_<id>"
  error?: string | undefined;
  simulated?: boolean | undefined;
  settledAt?: string | undefined;
  extensions?: Record<string, unknown> | undefined;
}

/**
 * Encodes an x402 V2 object to a Base64 header string.
 */
export function encodeX402Header(data: unknown): string {
  const json = JSON.stringify(data);
  const g = globalThis as { Buffer?: { from(str: string, enc: string): { toString(enc: string): string } }; btoa?: (str: string) => string };
  if (typeof g.Buffer !== 'undefined') {
    return g.Buffer.from(json, 'utf8').toString('base64');
  }
  if (typeof g.btoa === 'function') {
    return g.btoa(unescape(encodeURIComponent(json)));
  }
  throw new Error('No Base64 encoding provider available in runtime');
}

/**
 * Decodes a Base64 header string to an x402 V2 object.
 */
export function decodeX402Header<T = unknown>(headerValue: string): T {
  const g = globalThis as { Buffer?: { from(str: string, enc: string): { toString(enc: string): string } }; atob?: (str: string) => string };
  let json: string;
  if (typeof g.Buffer !== 'undefined') {
    json = g.Buffer.from(headerValue, 'base64').toString('utf8');
  } else if (typeof g.atob === 'function') {
    json = decodeURIComponent(escape(g.atob(headerValue)));
  } else {
    throw new Error('No Base64 decoding provider available in runtime');
  }
  return JSON.parse(json) as T;
}
