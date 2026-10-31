import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  numeric,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// 1. Profiles (linked to Supabase auth.users or authentication identity)
export const profiles = pgTable(
  'profiles',
  {
    id: uuid('id').primaryKey(), // Matches auth.users id
    email: text('email').notNull().unique(),
    displayName: text('display_name'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('profiles_email_idx').on(table.email),
  ]
);

// 2. Conversations
export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('conversations_user_id_idx').on(table.userId),
    index('conversations_created_at_idx').on(table.createdAt),
  ]
);

// 3. Messages
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    role: text('role').notNull(), // 'user' | 'assistant' | 'system'
    content: text('content').notNull(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('messages_conversation_id_idx').on(table.conversationId),
    index('messages_user_id_idx').on(table.userId),
    index('messages_created_at_idx').on(table.createdAt),
  ]
);

// 4. Merchants
export const merchants = pgTable(
  'merchants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    trustedRecipientAddress: text('trusted_recipient_address').notNull(),
    paymentNetwork: text('payment_network').notNull(),
    isTrusted: boolean('is_trusted').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('merchants_slug_idx').on(table.slug),
    index('merchants_is_trusted_idx').on(table.isTrusted),
  ]
);

// 5. Products
export const products = pgTable(
  'products',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull(),
    priceAmount: numeric('price_amount', { precision: 78, scale: 0 }).notNull(), // Base units integer string
    currency: text('currency').notNull().default('USDC'),
    assetIdentifier: text('asset_identifier').notNull().default('USDC'),
    networkIdentifier: text('network_identifier').notNull().default('eip155:84532'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('products_merchant_id_idx').on(table.merchantId),
    index('products_is_active_idx').on(table.isActive),
  ]
);

// 6. Purchase Intents
export const purchaseIntents = pgTable(
  'purchase_intents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id').references(() => conversations.id, {
      onDelete: 'set null',
    }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id),
    proposedAmount: numeric('proposed_amount', { precision: 78, scale: 0 }).notNull(),
    currency: text('currency').notNull(),
    assetIdentifier: text('asset_identifier').notNull(),
    networkIdentifier: text('network_identifier').notNull(),
    status: text('status').notNull().default('draft'), // 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'superseded' | 'expired'
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('purchase_intents_user_id_idx').on(table.userId),
    index('purchase_intents_product_id_idx').on(table.productId),
    index('purchase_intents_status_idx').on(table.status),
    index('purchase_intents_created_at_idx').on(table.createdAt),
  ]
);

// 7. Approval Snapshots (Immutable records created ONLY on explicit authenticated user approval)
export const approvalSnapshots = pgTable(
  'approval_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    purchaseIntentId: uuid('purchase_intent_id')
      .notNull()
      .references(() => purchaseIntents.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id),
    trustedRecipientAddress: text('trusted_recipient_address').notNull(),
    exactAmount: numeric('exact_amount', { precision: 78, scale: 0 }).notNull(),
    assetIdentifier: text('asset_identifier').notNull(),
    networkIdentifier: text('network_identifier').notNull(),
    approvalVersion: integer('approval_version').notNull().default(1),
    schemeParameters: jsonb('scheme_parameters').notNull().default({}),
    status: text('status').notNull().default('active'), // 'active' | 'superseded' | 'expired' | 'consumed'
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    approvedAt: timestamp('approved_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('approval_snapshots_intent_version_idx').on(table.purchaseIntentId, table.approvalVersion),
    index('approval_snapshots_user_id_idx').on(table.userId),
    index('approval_snapshots_intent_id_idx').on(table.purchaseIntentId),
    index('approval_snapshots_status_idx').on(table.status),
  ]
);

// 8. Guardian Decisions
export const guardianDecisions = pgTable(
  'guardian_decisions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    purchaseIntentId: uuid('purchase_intent_id')
      .notNull()
      .references(() => purchaseIntents.id, { onDelete: 'cascade' }),
    decision: text('decision').notNull(), // 'allow' | 'block' | 'require_reapproval'
    reason: text('reason').notNull(),
    riskScore: integer('risk_score').notNull().default(0),
    rulesEvaluated: jsonb('rules_evaluated').notNull().default([]),
    simulated: boolean('simulated').notNull().default(true),
    evaluatedAt: timestamp('evaluated_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('guardian_decisions_intent_id_idx').on(table.purchaseIntentId),
    index('guardian_decisions_decision_idx').on(table.decision),
  ]
);

// 9. Payment Attempts
export const paymentAttempts = pgTable(
  'payment_attempts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    purchaseIntentId: uuid('purchase_intent_id')
      .notNull()
      .references(() => purchaseIntents.id, { onDelete: 'cascade' }),
    approvalSnapshotId: uuid('approval_snapshot_id').references(() => approvalSnapshots.id, {
      onDelete: 'set null',
    }),
    status: text('status').notNull().default('initiated'), // 'initiated' | 'in_progress' | 'succeeded' | 'failed'
    simulated: boolean('simulated').notNull().default(true),
    failureReason: text('failure_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('payment_attempts_intent_id_idx').on(table.purchaseIntentId),
    index('payment_attempts_status_idx').on(table.status),
  ]
);

// 10. Settlement Records
export const settlementRecords = pgTable(
  'settlement_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    paymentAttemptId: uuid('payment_attempt_id')
      .notNull()
      .references(() => paymentAttempts.id, { onDelete: 'cascade' }),
    purchaseIntentId: uuid('purchase_intent_id')
      .notNull()
      .references(() => purchaseIntents.id, { onDelete: 'cascade' }),
    assetIdentifier: text('asset_identifier').notNull(),
    networkIdentifier: text('network_identifier').notNull(),
    amount: numeric('amount', { precision: 78, scale: 0 }).notNull(),
    recipientAddress: text('recipient_address').notNull(),
    settlementType: text('settlement_type').notNull().default('simulated'), // 'simulated' | 'onchain_testnet' | 'onchain_mainnet'
    settlementReference: text('settlement_reference'),
    settledAt: timestamp('settled_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('settlement_records_payment_attempt_idx').on(table.paymentAttemptId),
    index('settlement_records_intent_id_idx').on(table.purchaseIntentId),
  ]
);

// 11. Audit Events (Append-only for regular users)
export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => profiles.id, { onDelete: 'set null' }),
    eventType: text('event_type').notNull(),
    actorType: text('actor_type').notNull(), // 'user' | 'guardian' | 'system' | 'admin'
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id').notNull(),
    payload: jsonb('payload').notNull().default({}),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('audit_events_user_id_idx').on(table.userId),
    index('audit_events_event_type_idx').on(table.eventType),
    index('audit_events_created_at_idx').on(table.createdAt),
  ]
);

// Relations
export const profilesRelations = relations(profiles, ({ many }) => ({
  conversations: many(conversations),
  messages: many(messages),
  purchaseIntents: many(purchaseIntents),
  approvalSnapshots: many(approvalSnapshots),
  auditEvents: many(auditEvents),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  user: one(profiles, {
    fields: [conversations.userId],
    references: [profiles.id],
  }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  user: one(profiles, {
    fields: [messages.userId],
    references: [profiles.id],
  }),
}));

export const merchantsRelations = relations(merchants, ({ many }) => ({
  products: many(products),
}));

export const productsRelations = relations(products, ({ one }) => ({
  merchant: one(merchants, {
    fields: [products.merchantId],
    references: [merchants.id],
  }),
}));

export const purchaseIntentsRelations = relations(purchaseIntents, ({ one, many }) => ({
  user: one(profiles, {
    fields: [purchaseIntents.userId],
    references: [profiles.id],
  }),
  product: one(products, {
    fields: [purchaseIntents.productId],
    references: [products.id],
  }),
  merchant: one(merchants, {
    fields: [purchaseIntents.merchantId],
    references: [merchants.id],
  }),
  approvalSnapshots: many(approvalSnapshots),
  guardianDecisions: many(guardianDecisions),
  paymentAttempts: many(paymentAttempts),
}));

export const approvalSnapshotsRelations = relations(approvalSnapshots, ({ one, many }) => ({
  user: one(profiles, {
    fields: [approvalSnapshots.userId],
    references: [profiles.id],
  }),
  purchaseIntent: one(purchaseIntents, {
    fields: [approvalSnapshots.purchaseIntentId],
    references: [purchaseIntents.id],
  }),
  product: one(products, {
    fields: [approvalSnapshots.productId],
    references: [products.id],
  }),
  merchant: one(merchants, {
    fields: [approvalSnapshots.merchantId],
    references: [merchants.id],
  }),
  paymentAttempts: many(paymentAttempts),
}));
