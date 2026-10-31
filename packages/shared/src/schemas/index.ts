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
  // Note: Client MUST NOT supply price, merchant, recipient, asset, or network.
  // These are derived authoritatively from the backend catalog.
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
