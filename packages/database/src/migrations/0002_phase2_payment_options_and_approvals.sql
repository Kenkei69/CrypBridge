-- Migration: 0002_phase2_payment_options_and_approvals
-- Phase 2 payment options, optimistic locking versions, rejection reasons, idempotency, and expiration

-- 1. Product Payment Options Table
CREATE TABLE IF NOT EXISTS product_payment_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  network_identifier TEXT NOT NULL,
  asset_identifier TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USDC',
  amount NUMERIC(78, 0) NOT NULL,
  decimals INTEGER NOT NULL DEFAULT 6,
  trusted_recipient_address TEXT NOT NULL,
  product_version INTEGER NOT NULL DEFAULT 1,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS product_payment_options_product_id_idx ON product_payment_options(product_id);
CREATE INDEX IF NOT EXISTS product_payment_options_merchant_id_idx ON product_payment_options(merchant_id);
CREATE INDEX IF NOT EXISTS product_payment_options_is_active_idx ON product_payment_options(is_active);

-- 2. Alter purchase_intents table to support payment options, optimistic versioning, rejection reasons, idempotency, and expiration
ALTER TABLE purchase_intents
  ADD COLUMN IF NOT EXISTS selected_payment_option_id UUID REFERENCES product_payment_options(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS purchase_intents_idempotency_idx ON purchase_intents(idempotency_key);

-- 3. Alter approval_snapshots table to link payment_option_id
ALTER TABLE approval_snapshots
  ADD COLUMN IF NOT EXISTS payment_option_id UUID REFERENCES product_payment_options(id) ON DELETE SET NULL;
