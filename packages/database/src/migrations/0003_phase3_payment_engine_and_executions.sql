-- Migration: 0003_phase3_payment_engine_and_executions
-- Phase 3 payment executions, mock merchant resources, settlement links, and worker lease indexes

-- 1. Payment Executions Table (Durable execution state machine for approved purchases)
CREATE TABLE IF NOT EXISTS payment_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  purchase_intent_id UUID NOT NULL REFERENCES purchase_intents(id) ON DELETE CASCADE,
  approval_snapshot_id UUID NOT NULL REFERENCES approval_snapshots(id) ON DELETE RESTRICT,
  execution_status TEXT NOT NULL DEFAULT 'QUEUED',
  fulfillment_status TEXT NOT NULL DEFAULT 'NOT_STARTED',
  network_identifier TEXT NOT NULL,
  asset_identifier TEXT NOT NULL,
  amount NUMERIC(78, 0) NOT NULL,
  recipient_address TEXT NOT NULL,
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
  resource_id TEXT,
  authorization_id TEXT,
  settlement_reference TEXT,
  idempotency_key TEXT,
  failure_code TEXT,
  failure_reason TEXT,
  reconciliation_attempts INTEGER NOT NULL DEFAULT 0,
  last_reconciled_at TIMESTAMPTZ,
  delivered_resource JSONB,
  worker_id TEXT,
  worker_lease_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payment_executions_purchase_intent_unique UNIQUE (purchase_intent_id)
);

CREATE INDEX IF NOT EXISTS payment_executions_user_id_idx ON payment_executions(user_id);
CREATE INDEX IF NOT EXISTS payment_executions_status_idx ON payment_executions(execution_status);
CREATE INDEX IF NOT EXISTS payment_executions_lease_idx ON payment_executions(worker_lease_expires_at);
CREATE INDEX IF NOT EXISTS payment_executions_settlement_ref_idx ON payment_executions(settlement_reference);
CREATE INDEX IF NOT EXISTS payment_executions_idempotency_idx ON payment_executions(idempotency_key);

-- 2. Mock Merchant Demonstration Resources Table
CREATE TABLE IF NOT EXISTS mock_merchant_resources (
  id TEXT PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  content TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/json',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mock_merchant_resources_product_id_idx ON mock_merchant_resources(product_id);
CREATE INDEX IF NOT EXISTS mock_merchant_resources_merchant_id_idx ON mock_merchant_resources(merchant_id);

-- 3. Link Settlement Records to Payment Executions
ALTER TABLE settlement_records
  ADD COLUMN IF NOT EXISTS payment_execution_id UUID REFERENCES payment_executions(id) ON DELETE SET NULL;

ALTER TABLE settlement_records
  ALTER COLUMN payment_attempt_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS settlement_records_execution_idx ON settlement_records(payment_execution_id);

-- 4. Row Level Security for Payment Executions
ALTER TABLE payment_executions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'payment_executions' AND policyname = 'payment_executions_select_own'
  ) THEN
    CREATE POLICY payment_executions_select_own ON payment_executions
      FOR SELECT USING (user_id = app_user_id());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'payment_executions' AND policyname = 'payment_executions_insert_own'
  ) THEN
    CREATE POLICY payment_executions_insert_own ON payment_executions
      FOR INSERT WITH CHECK (user_id = app_user_id());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'payment_executions' AND policyname = 'payment_executions_update_own'
  ) THEN
    CREATE POLICY payment_executions_update_own ON payment_executions
      FOR UPDATE USING (user_id = app_user_id());
  END IF;
END $$;
