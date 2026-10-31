import crypto from 'node:crypto';
import type { ExecutionPermit } from '@x402/shared';

const GUARDIAN_PERMIT_SECRET =
  process.env.GUARDIAN_SIGNER_PERMIT_SECRET ||
  process.env.SIMULATION_SIGNER_SECRET ||
  'x402_guardian_internal_permit_signer_secret_s77';

export interface GeneratePermitParams {
  executionId: string;
  intentId: string;
  snapshotId: string;
  approvalVersion: number;
  policyId: string;
  policyVersion: number;
  reservationId: string;
  fencingToken: number;
  recipientAddress: string;
  amount: string;
  assetIdentifier: string;
  networkIdentifier: string;
  snapshotExpiresAt: string;
  now?: Date;
  ttlSeconds?: number;
}

export function computePermitCanonicalString(permit: Omit<ExecutionPermit, 'hmacSignature'>): string {
  return [
    permit.permitId,
    permit.executionId,
    permit.intentId,
    permit.snapshotId,
    permit.approvalVersion.toString(),
    permit.policyId,
    permit.policyVersion.toString(),
    permit.reservationId,
    permit.fencingToken.toString(),
    permit.recipientAddress.toLowerCase().trim(),
    permit.amount,
    permit.assetIdentifier.toUpperCase().trim(),
    permit.networkIdentifier.toLowerCase().trim(),
    permit.issuedAt,
    permit.expiresAt,
  ].join('|');
}

/**
 * Issues a cryptographically bound ExecutionPermit tying an ALLOW evaluation
 * directly to the exact execution, snapshot, budget reservation, and worker fencing token.
 */
export function generateExecutionPermit(params: GeneratePermitParams): ExecutionPermit {
  const now = params.now || new Date();
  const ttlMs = (params.ttlSeconds || 900) * 1000; // 15 minutes default
  const permitExpiresMs = now.getTime() + ttlMs;

  // Bound to the earlier of permit TTL and snapshot expiration
  const snapshotExpiresMs = new Date(params.snapshotExpiresAt).getTime();
  const effectiveExpiresMs = Math.min(permitExpiresMs, snapshotExpiresMs);

  const permitId = `permit_${crypto.randomUUID()}`;
  const issuedAt = now.toISOString();
  const expiresAt = new Date(effectiveExpiresMs).toISOString();

  const unsignedPermit: Omit<ExecutionPermit, 'hmacSignature'> = {
    permitId,
    executionId: params.executionId,
    intentId: params.intentId,
    snapshotId: params.snapshotId,
    approvalVersion: params.approvalVersion,
    policyId: params.policyId,
    policyVersion: params.policyVersion,
    reservationId: params.reservationId,
    fencingToken: params.fencingToken,
    recipientAddress: params.recipientAddress,
    amount: params.amount,
    assetIdentifier: params.assetIdentifier,
    networkIdentifier: params.networkIdentifier,
    issuedAt,
    expiresAt,
  };

  const canonicalString = computePermitCanonicalString(unsignedPermit);
  const hmacSignature = crypto
    .createHmac('sha256', GUARDIAN_PERMIT_SECRET)
    .update(canonicalString)
    .digest('hex');

  return {
    ...unsignedPermit,
    hmacSignature,
  };
}

/**
 * Cryptographically verifies an ExecutionPermit.
 */
export function verifyExecutionPermit(
  permit: ExecutionPermit,
  now = new Date()
): { valid: boolean; reason?: string } {
  if (!permit || !permit.hmacSignature) {
    return { valid: false, reason: 'Missing permit or HMAC signature' };
  }

  // 1. Expiration Check
  if (new Date(permit.expiresAt) < now) {
    return { valid: false, reason: `Permit expired at ${permit.expiresAt}` };
  }

  // 2. Cryptographic HMAC-SHA256 signature verification
  const canonicalString = computePermitCanonicalString(permit);
  const expectedSignature = crypto
    .createHmac('sha256', GUARDIAN_PERMIT_SECRET)
    .update(canonicalString)
    .digest('hex');

  const sigBuffer = Buffer.from(permit.hmacSignature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return { valid: false, reason: 'Permit cryptographic signature mismatch or terms tampered' };
  }

  return { valid: true };
}
