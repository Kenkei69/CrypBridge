import {
  AppError,
  decodeX402Header,
  X402V2PaymentRequiredSchema,
  PHASE3_PINNED_EXECUTION,
  type X402V2PaymentRequired,
  type X402V2RequirementItem,
  type X402V2ResourceMetadata,
} from '@x402/shared';

export interface ExpectedPaymentTerms {
  scheme: string;
  networkIdentifier: string;
  assetIdentifier: string;
  exactAmount: string; // Base units integer string
  trustedRecipientAddress: string;
  resourceId?: string;
}

export interface ParsedRequirementsResult {
  valid: boolean;
  x402Version: 2;
  matchedRequirement: X402V2RequirementItem;
  resource: X402V2ResourceMetadata;
  rawRequirements: X402V2PaymentRequired;
}

const MAX_HEADER_BYTE_LENGTH = 65536; // 64 KB limit

/**
 * Parses and strictly validates incoming x402 V2 payment requirements from merchant PAYMENT-REQUIRED header.
 * Reconciles the offered payment requirements against the user's immutable approval terms.
 */
export function parseAndValidatePaymentRequirements(
  headerValue: string,
  expectedTerms: ExpectedPaymentTerms
): ParsedRequirementsResult {
  if (!headerValue || typeof headerValue !== 'string') {
    throw AppError.badRequest('Missing or empty PAYMENT-REQUIRED header from merchant');
  }

  if (headerValue.length > MAX_HEADER_BYTE_LENGTH) {
    throw AppError.badRequest('PAYMENT-REQUIRED header exceeds maximum supported payload size (64KB)');
  }

  // 1. Decode Base64 and parse JSON
  let decoded: unknown;
  try {
    decoded = decodeX402Header(headerValue);
  } catch (err) {
    throw AppError.badRequest(
      `Malformed PAYMENT-REQUIRED header: unable to decode base64 payload (${(err as Error).message})`
    );
  }

  // 2. Validate against schema
  const parsed = X402V2PaymentRequiredSchema.safeParse(decoded);
  if (!parsed.success) {
    const issueMsg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
    throw AppError.badRequest(`Invalid x402 V2 payment requirement schema: ${issueMsg}`);
  }

  const reqDoc = parsed.data as X402V2PaymentRequired;

  // 3. Validate protocol version
  if (reqDoc.x402Version !== PHASE3_PINNED_EXECUTION.version) {
    throw AppError.badRequest(
      `Unsupported x402 version: ${reqDoc.x402Version}. Expected x402 V${PHASE3_PINNED_EXECUTION.version}`
    );
  }

  // 4. Validate offered payment options against expected approved terms
  const accepts = reqDoc.accepts;
  if (!accepts || accepts.length === 0) {
    throw AppError.badRequest('Merchant returned empty accepts array; no payment methods offered');
  }

  // Find requirement matching expected network and asset
  const matchingCandidates = accepts.filter((opt) => {
    const isNetworkMatch = opt.network.toLowerCase() === expectedTerms.networkIdentifier.toLowerCase();
    const isAssetMatch =
      opt.asset.toLowerCase() === expectedTerms.assetIdentifier.toLowerCase() ||
      opt.asset.toLowerCase() === PHASE3_PINNED_EXECUTION.assetAddress.toLowerCase() ||
      opt.asset.toUpperCase() === 'USDC';
    return isNetworkMatch && isAssetMatch;
  });

  if (matchingCandidates.length === 0) {
    throw AppError.badRequest(
      `No offered payment option matches approved network (${expectedTerms.networkIdentifier}) and asset (${expectedTerms.assetIdentifier})`
    );
  }

  // Exact scheme match check
  const schemeMatch = matchingCandidates.find(
    (opt) => opt.scheme === expectedTerms.scheme || opt.scheme === 'exact' || opt.scheme === 'exact-payment-v1'
  );

  if (!schemeMatch) {
    throw AppError.badRequest(
      `Merchant does not accept exact payment scheme. Offered: ${matchingCandidates.map((m) => m.scheme).join(', ')}`
    );
  }

  // Exact price equality check (no silent price changes, even if lower)
  let offeredAmount: bigint;
  let expectedAmount: bigint;
  try {
    offeredAmount = BigInt(schemeMatch.amount);
    expectedAmount = BigInt(expectedTerms.exactAmount);
  } catch {
    throw AppError.badRequest('Invalid integer representation in requirement amount');
  }

  if (offeredAmount !== expectedAmount) {
    throw AppError.badRequest(
      `Merchant payment amount mismatch: offered ${schemeMatch.amount} base units, but approved amount is ${expectedTerms.exactAmount} base units. Terms must match exactly.`
    );
  }

  // Recipient address equality check
  if (schemeMatch.payTo.toLowerCase() !== expectedTerms.trustedRecipientAddress.toLowerCase()) {
    throw AppError.badRequest(
      `Merchant recipient address mismatch: offered ${schemeMatch.payTo}, but approved recipient is ${expectedTerms.trustedRecipientAddress}`
    );
  }

  // Timeout check: ensure timeout is not negative or zero
  if (schemeMatch.maxTimeoutSeconds !== undefined && schemeMatch.maxTimeoutSeconds <= 0) {
    throw AppError.badRequest('Merchant payment timeout must be a positive integer');
  }

  return {
    valid: true,
    x402Version: 2,
    matchedRequirement: schemeMatch,
    resource: reqDoc.resource,
    rawRequirements: reqDoc,
  };
}
