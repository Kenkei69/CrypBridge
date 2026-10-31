import { z } from 'zod';

export const BaseUnitAmountRegex = /^[1-9]\d*$|^0$/;

export const BaseUnitAmountSchema = z
  .string()
  .min(1, 'Amount string cannot be empty')
  .max(78, 'Amount exceeds maximum supported base-unit length')
  .regex(BaseUnitAmountRegex, 'Amount must be an integer string of base units with no decimals or leading zeros');

export const UuidSchema = z.string().uuid('Invalid UUID format');

export const CreateConversationSchema = z.object({
  title: z.string().trim().min(1, 'Title cannot be empty').max(120, 'Title cannot exceed 120 characters'),
});

export const CreateMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']).default('user'),
  content: z.string().trim().min(1, 'Content cannot be empty').max(8000, 'Message content cannot exceed 8000 characters'),
  metadata: z.record(z.unknown()).optional(),
});

export const CreateDraftPurchaseIntentSchema = z.object({
  productId: UuidSchema,
  conversationId: UuidSchema.optional(),
  paymentOptionId: UuidSchema.optional(),
  // Note: Client MUST NOT supply price, merchant, recipient, asset, or network.
  // These are derived authoritatively from the backend catalog.
});

export const SelectPaymentOptionSchema = z.object({
  paymentOptionId: UuidSchema,
});

export const ApprovePurchaseIntentSchema = z.object({
  expectedVersion: z.number().int().positive('Expected version must be a positive integer'),
  idempotencyKey: z.string().trim().min(1).max(128).optional(),
  mockMerchantFault: z
    .enum([
      'timeout',
      'lost_response',
      'settlement_rejected',
      'resource_delivery_fail',
      'corrupt_requirements',
      'price_tamper',
    ])
    .optional(),
});

export const RejectPurchaseIntentSchema = z.object({
  reason: z.string().trim().max(500, 'Rejection reason cannot exceed 500 characters').optional(),
});

export const CatalogSearchQuerySchema = z.object({
  query: z.string().trim().max(200).optional(),
  maxPrice: z.string().trim().optional(),
  network: z.string().trim().optional(),
  category: z.string().trim().optional(),
});

export const UpdatePurchaseIntentStatusSchema = z.object({
  status: z.enum(['rejected', 'superseded']),
  reason: z.string().max(500).optional(),
});

export const PaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const TestTokenRequestSchema = z.object({
  userId: UuidSchema.optional(),
  email: z.string().email(),
  displayName: z.string().max(80).optional(),
  expiresInSeconds: z.number().int().min(10).max(86400).default(3600),
});

export const ProcessPaymentExecutionSchema = z.object({
  idempotencyKey: z.string().trim().min(1).max(128).optional(),
  mockMerchantFault: z
    .enum([
      'timeout',
      'lost_response',
      'settlement_rejected',
      'resource_delivery_fail',
      'corrupt_requirements',
      'price_tamper',
    ])
    .optional(),
});

export const RetryPaymentExecutionSchema = z.object({
  mode: z.enum(['reconcile', 'resource_delivery']).default('reconcile'),
});

export const KillSwitchSchema = z.object({
  enabled: z.boolean(),
  reason: z.string().max(200).optional(),
});

export const X402V2RequirementItemSchema = z.object({
  scheme: z.string().min(1).max(50),
  network: z.string().min(1).max(50),
  amount: BaseUnitAmountSchema,
  asset: z.string().min(1).max(100),
  payTo: z.string().min(1).max(120),
  maxTimeoutSeconds: z.number().int().positive().max(3600).optional(),
  extra: z.record(z.unknown()).optional(),
});

export const X402V2PaymentRequiredSchema = z.object({
  x402Version: z.literal(2),
  error: z.string().max(500).optional(),
  resource: z.object({
    url: z.string().max(2048),
    description: z.string().max(500).optional(),
    mimeType: z.string().max(100).optional(),
  }),
  accepts: z.array(X402V2RequirementItemSchema).min(1),
  extensions: z.record(z.unknown()).optional(),
});

export const X402V2PaymentPayloadSchema = z.object({
  x402Version: z.literal(2),
  accepted: X402V2RequirementItemSchema,
  payload: z.object({
    authorizationId: z.string().min(1),
    signature: z.string().min(1),
    timestamp: z.string(),
    intentId: UuidSchema,
    approvalSnapshotId: UuidSchema,
    approvalVersion: z.number().int().positive(),
    simulated: z.literal(true),
    extra: z.record(z.unknown()).optional(),
  }),
  resource: z.object({
    url: z.string(),
  }).optional(),
  extensions: z.record(z.unknown()).optional(),
});

export const SpendingPolicyUpdateSchema = z.object({
  assetIdentifier: z.string().min(1).max(100).default('USDC'),
  networkIdentifier: z.string().min(1).max(50).default('eip155:84532'),
  maxAmountPerPayment: BaseUnitAmountSchema,
  maxAmountPerTask: BaseUnitAmountSchema,
  maxAmountPerDailyWindow: BaseUnitAmountSchema,
  dailyWindowSeconds: z.number().int().min(60).max(604800).default(86400),
  isActive: z.boolean().default(true),
});

export const GuardianDecisionQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  outcome: z.enum(['ALLOW', 'BLOCK', 'ALL']).default('ALL'),
  intentId: UuidSchema.optional(),
  executionId: UuidSchema.optional(),
});

export const BudgetQuerySchema = z.object({
  assetIdentifier: z.string().min(1).max(100).default('USDC'),
  networkIdentifier: z.string().min(1).max(50).default('eip155:84532'),
});

export const UpdateUserProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
});
