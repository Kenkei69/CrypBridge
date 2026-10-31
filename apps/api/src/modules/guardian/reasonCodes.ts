import type { GuardianReasonCode } from '@x402/shared';

export interface ReasonCodeMetadata {
  code: GuardianReasonCode;
  title: string;
  defaultMessage: string;
  isTerminalBlock: boolean;
  userFacingExplanation: string;
}

export const GUARDIAN_REASON_CODES: Record<GuardianReasonCode, ReasonCodeMetadata> = {
  AUTHORIZED: {
    code: 'AUTHORIZED',
    title: 'Authorization Granted',
    defaultMessage: 'All deterministic security rules, terms verification, and spending limits validated successfully.',
    isTerminalBlock: false,
    userFacingExplanation: 'Purchase authorization validated. Ready for simulated execution.',
  },
  OWNER_MISMATCH: {
    code: 'OWNER_MISMATCH',
    title: 'Identity Ownership Mismatch',
    defaultMessage: 'The authenticated user identity does not own the target purchase intent or approval snapshot.',
    isTerminalBlock: true,
    userFacingExplanation: 'You do not have permission to execute this purchase intent.',
  },
  SNAPSHOT_MISSING: {
    code: 'SNAPSHOT_MISSING',
    title: 'Approval Snapshot Missing',
    defaultMessage: 'No authoritative approval snapshot was found for this purchase intent.',
    isTerminalBlock: true,
    userFacingExplanation: 'No valid user approval exists for this purchase. Review and approve the item first.',
  },
  SNAPSHOT_EXPIRED: {
    code: 'SNAPSHOT_EXPIRED',
    title: 'Approval Expired',
    defaultMessage: 'The explicit user approval expired before execution was initiated.',
    isTerminalBlock: true,
    userFacingExplanation: 'The approval for this purchase has expired. Please review and approve a new quote.',
  },
  SNAPSHOT_SUPERSEDED: {
    code: 'SNAPSHOT_SUPERSEDED',
    title: 'Approval Superseded',
    defaultMessage: 'The approval snapshot has been superseded by an updated intent version or canceled.',
    isTerminalBlock: true,
    userFacingExplanation: 'This approval is no longer active because the purchase terms changed.',
  },
  VERSION_MISMATCH: {
    code: 'VERSION_MISMATCH',
    title: 'Version Alignment Failure',
    defaultMessage: 'Purchase intent version does not match the approved snapshot version.',
    isTerminalBlock: true,
    userFacingExplanation: 'Purchase terms were modified after approval was granted. Fresh approval required.',
  },
  INTENT_NOT_APPROVED: {
    code: 'INTENT_NOT_APPROVED',
    title: 'Intent Not Approved',
    defaultMessage: 'The purchase intent is not in approved status.',
    isTerminalBlock: true,
    userFacingExplanation: 'This purchase has not received explicit user approval.',
  },
  AMOUNT_MISMATCH: {
    code: 'AMOUNT_MISMATCH',
    title: 'Exact Amount Discrepancy',
    defaultMessage: 'The requested payment amount differs from the exact integer base units approved by the user.',
    isTerminalBlock: true,
    userFacingExplanation: 'Payment amount does not match the approved price. Transaction blocked.',
  },
  RECIPIENT_MISMATCH: {
    code: 'RECIPIENT_MISMATCH',
    title: 'Unauthorized Recipient Address',
    defaultMessage: 'The requested recipient address does not match the trusted merchant address in the approved terms.',
    isTerminalBlock: true,
    userFacingExplanation: 'Recipient address does not match the trusted merchant configuration. Transaction blocked.',
  },
  TERMS_MISMATCH: {
    code: 'TERMS_MISMATCH',
    title: 'Commercial Terms Mismatch',
    defaultMessage: 'The proposed payment terms do not match the backend-authoritative approval snapshot.',
    isTerminalBlock: true,
    userFacingExplanation: 'Proposed payment parameters conflict with approved snapshot terms.',
  },
  UNSUPPORTED_EXECUTION_COMBINATION: {
    code: 'UNSUPPORTED_EXECUTION_COMBINATION',
    title: 'Unsupported Network or Asset',
    defaultMessage: 'The requested network/asset combination is outside the pinned simulation allowlist (Base Sepolia USDC).',
    isTerminalBlock: true,
    userFacingExplanation: 'Only USDC on Base Sepolia is supported for simulation execution.',
  },
  UNSUPPORTED_SCHEME: {
    code: 'UNSUPPORTED_SCHEME',
    title: 'Unsupported Payment Scheme',
    defaultMessage: 'The merchant requested an unsupported payment scheme. Only exact scheme is permitted.',
    isTerminalBlock: true,
    userFacingExplanation: 'Unsupported payment scheme. Only exact fixed-price scheme is authorized.',
  },
  BUDGET_EXCEEDED_PER_PAYMENT: {
    code: 'BUDGET_EXCEEDED_PER_PAYMENT',
    title: 'Single Payment Budget Exceeded',
    defaultMessage: 'The proposed transaction amount exceeds the configured single-payment budget limit.',
    isTerminalBlock: true,
    userFacingExplanation: 'Payment amount exceeds your single-transaction spending limit.',
  },
  BUDGET_EXCEEDED_PER_TASK: {
    code: 'BUDGET_EXCEEDED_PER_TASK',
    title: 'Purchasing Task Budget Exceeded',
    defaultMessage: 'Cumulative spending for this purchasing task exceeds the configured per-task budget limit.',
    isTerminalBlock: true,
    userFacingExplanation: 'Total spend for this purchasing task exceeds your task spending limit.',
  },
  BUDGET_EXCEEDED_DAILY: {
    code: 'BUDGET_EXCEEDED_DAILY',
    title: 'Daily Spending Allowance Exceeded',
    defaultMessage: 'Total committed and reserved spending for the current 24-hour UTC window exceeds the daily policy limit.',
    isTerminalBlock: true,
    userFacingExplanation: 'Daily spending limit reached for this asset and network. Limit resets at 00:00 UTC.',
  },
  DUPLICATE_SETTLEMENT: {
    code: 'DUPLICATE_SETTLEMENT',
    title: 'Duplicate Settlement Prevented',
    defaultMessage: 'A completed settlement already exists for this purchase intent. Re-settlement prohibited.',
    isTerminalBlock: true,
    userFacingExplanation: 'This purchase has already settled. Replay attempt prevented.',
  },
  KILL_SWITCH_ACTIVE: {
    code: 'KILL_SWITCH_ACTIVE',
    title: 'Emergency Kill Switch Active',
    defaultMessage: 'All simulated payment authorization and settlement processing is paused by administrator kill switch.',
    isTerminalBlock: true,
    userFacingExplanation: 'Payment processing is temporarily paused for system maintenance or security inspection.',
  },
  PRODUCTION_REFUSAL: {
    code: 'PRODUCTION_REFUSAL',
    title: 'Production Environment Refusal',
    defaultMessage: 'Simulated payment engine components are strictly prohibited from executing in production environments.',
    isTerminalBlock: true,
    userFacingExplanation: 'Simulation engine cannot execute in production environment.',
  },
  STALE_WORKER_FENCING_TOKEN: {
    code: 'STALE_WORKER_FENCING_TOKEN',
    title: 'Stale Worker Lease / Fencing Token',
    defaultMessage: 'The worker lease was reassigned or superseded by a newer execution generation.',
    isTerminalBlock: true,
    userFacingExplanation: 'Execution generation token expired or superseded by another worker process.',
  },
  PERMIT_INVALID: {
    code: 'PERMIT_INVALID',
    title: 'Invalid Execution Permit',
    defaultMessage: 'The cryptographic execution permit HMAC signature is invalid or bound terms were altered.',
    isTerminalBlock: true,
    userFacingExplanation: 'Security permit signature verification failed. Signing rejected.',
  },
  PERMIT_EXPIRED: {
    code: 'PERMIT_EXPIRED',
    title: 'Execution Permit Expired',
    defaultMessage: 'The narrow execution permit expired prior to signing.',
    isTerminalBlock: true,
    userFacingExplanation: 'Execution permit expired before simulated signing. Re-authorization required.',
  },
  AUTHENTICATION_REQUIRED: {
    code: 'AUTHENTICATION_REQUIRED',
    title: 'Authentication Required',
    defaultMessage: 'Operation requires a verified cryptographic user session.',
    isTerminalBlock: true,
    userFacingExplanation: 'Please log in to continue.',
  },
  ADMIN_REQUIRED: {
    code: 'ADMIN_REQUIRED',
    title: 'Administrator Access Required',
    defaultMessage: 'Operation requires verified server-side administrator authorization.',
    isTerminalBlock: true,
    userFacingExplanation: 'Administrator privileges required.',
  },
  INFRASTRUCTURE_ERROR: {
    code: 'INFRASTRUCTURE_ERROR',
    title: 'Infrastructure Evaluation Error',
    defaultMessage: 'A database or persistence error occurred during policy evaluation. Fail closed.',
    isTerminalBlock: true,
    userFacingExplanation: 'A system error occurred during security evaluation. Payment safely prevented.',
  },
};
