import type { X402PaymentRequirement, X402PaymentAuthorization, X402SettlementResult } from './x402.js';
import type { ApprovalSnapshot } from './purchases.js';
import type { GuardianDecision, GuardianEvaluationRequest } from './guardian.js';

export interface ControlledDestinationPolicy {
  allowedHosts: string[];
  allowedProtocols: ('https:' | 'http:')[];
  allowLocalhost: boolean;
  validateUrl(rawUrl: string): { allowed: boolean; reason?: string; sanitizedUrl?: string };
}

export interface IMerchantPaymentRequirementService {
  getPaymentRequirements(merchantId: string, endpointUrl: string): Promise<X402PaymentRequirement[]>;
}

export interface IGuardianEvaluationEngine {
  evaluate(request: GuardianEvaluationRequest, snapshot: ApprovalSnapshot): Promise<GuardianDecision>;
}

export interface SigningRequest {
  snapshotId: string;
  exactAmount: string;
  recipientAddress: string;
  networkIdentifier: string;
  assetIdentifier: string;
  approvalVersion: number;
}

export interface IPaymentSigner {
  isSimulation: boolean;
  signAuthorization(request: SigningRequest, snapshot: ApprovalSnapshot): Promise<X402PaymentAuthorization>;
}

export interface ISettlementAdapter {
  isSimulation: boolean;
  submitSettlement(authorization: X402PaymentAuthorization): Promise<X402SettlementResult>;
  reconcileSettlement(settlementId: string): Promise<X402SettlementResult>;
}
