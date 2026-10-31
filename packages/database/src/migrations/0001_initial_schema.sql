-- x402 Guardian Initial Database Schema & RLS Setup
-- Migration: 0001_initial_schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Profiles Table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS profiles_email_idx ON profiles(email);

-- 2. Conversations Table
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS conversations_user_id_idx ON conversations(user_id);
CREATE INDEX IF NOT EXISTS conversations_created_at_idx ON conversations(created_at);

-- 3. Messages Table
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS messages_conversation_id_idx ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS messages_user_id_idx ON messages(user_id);
CREATE INDEX IF NOT EXISTS messages_created_at_idx ON messages(created_at);

-- 4. Merchants Table
CREATE TABLE IF NOT EXISTS merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  trusted_recipient_address TEXT NOT NULL,
  payment_network TEXT NOT NULL,
  is_trusted BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS merchants_slug_idx ON merchants(slug);
CREATE INDEX IF NOT EXISTS merchants_is_trusted_idx ON merchants(is_trusted);

-- 5. Products Table
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  price_amount NUMERIC(78, 0) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USDC',
  asset_identifier TEXT NOT NULL DEFAULT 'USDC',
  network_identifier TEXT NOT NULL DEFAULT 'eip155:84532',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS products_merchant_id_idx ON products(merchant_id);
CREATE INDEX IF NOT EXISTS products_is_active_idx ON products(is_active);

-- 6. Purchase Intents Table
CREATE TABLE IF NOT EXISTS purchase_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  product_id UUID NOT NULL REFERENCES products(id),
  merchant_id UUID NOT NULL REFERENCES merchants(id),
  proposed_amount NUMERIC(78, 0) NOT NULL,
  currency TEXT NOT NULL,
  asset_identifier TEXT NOT NULL,
  network_identifier TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS purchase_intents_user_id_idx ON purchase_intents(user_id);
CREATE INDEX IF NOT EXISTS purchase_intents_product_id_idx ON purchase_intents(product_id);
CREATE INDEX IF NOT EXISTS purchase_intents_status_idx ON purchase_intents(status);
CREATE INDEX IF NOT EXISTS purchase_intents_created_at_idx ON purchase_intents(created_at);

-- 7. Approval Snapshots Table (Immutable authorization records)
CREATE TABLE IF NOT EXISTS approval_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  purchase_intent_id UUID NOT NULL REFERENCES purchase_intents(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  merchant_id UUID NOT NULL REFERENCES merchants(id),
  trusted_recipient_address TEXT NOT NULL,
  exact_amount NUMERIC(78, 0) NOT NULL,
  asset_identifier TEXT NOT NULL,
  network_identifier TEXT NOT NULL,
  approval_version INTEGER NOT NULL DEFAULT 1,
  scheme_parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ NOT NULL,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS approval_snapshots_intent_version_idx 
  ON approval_snapshots(purchase_intent_id, approval_version);
CREATE INDEX IF NOT EXISTS approval_snapshots_user_id_idx ON approval_snapshots(user_id);
CREATE INDEX IF NOT EXISTS approval_snapshots_intent_id_idx ON approval_snapshots(purchase_intent_id);
CREATE INDEX IF NOT EXISTS approval_snapshots_status_idx ON approval_snapshots(status);

-- 8. Guardian Decisions Table
CREATE TABLE IF NOT EXISTS guardian_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_intent_id UUID NOT NULL REFERENCES purchase_intents(id) ON DELETE CASCADE,
  decision TEXT NOT NULL,
  reason TEXT NOT NULL,
  risk_score INTEGER NOT NULL DEFAULT 0,
  rules_evaluated JSONB NOT NULL DEFAULT '[]'::jsonb,
  simulated BOOLEAN NOT NULL DEFAULT TRUE,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS guardian_decisions_intent_id_idx ON guardian_decisions(purchase_intent_id);
CREATE INDEX IF NOT EXISTS guardian_decisions_decision_idx ON guardian_decisions(decision);

-- 9. Payment Attempts Table
CREATE TABLE IF NOT EXISTS payment_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_intent_id UUID NOT NULL REFERENCES purchase_intents(id) ON DELETE CASCADE,
  approval_snapshot_id UUID REFERENCES approval_snapshots(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'initiated',
  simulated BOOLEAN NOT NULL DEFAULT TRUE,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS payment_attempts_intent_id_idx ON payment_attempts(purchase_intent_id);
CREATE INDEX IF NOT EXISTS payment_attempts_status_idx ON payment_attempts(status);

-- 10. Settlement Records Table
CREATE TABLE IF NOT EXISTS settlement_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_attempt_id UUID NOT NULL REFERENCES payment_attempts(id) ON DELETE CASCADE,
  purchase_intent_id UUID NOT NULL REFERENCES purchase_intents(id) ON DELETE CASCADE,
  asset_identifier TEXT NOT NULL,
  network_identifier TEXT NOT NULL,
  amount NUMERIC(78, 0) NOT NULL,
  recipient_address TEXT NOT NULL,
  settlement_type TEXT NOT NULL DEFAULT 'simulated',
  settlement_reference TEXT,
  settled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS settlement_records_payment_attempt_idx ON settlement_records(payment_attempt_id);
CREATE INDEX IF NOT EXISTS settlement_records_intent_id_idx ON settlement_records(purchase_intent_id);

-- 11. Audit Events Table (Append-only)
CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_events_user_id_idx ON audit_events(user_id);
CREATE INDEX IF NOT EXISTS audit_events_event_type_idx ON audit_events(event_type);
CREATE INDEX IF NOT EXISTS audit_events_created_at_idx ON audit_events(created_at);

-- ROW LEVEL SECURITY (RLS) POLICIES
-- Enables RLS on all user-scoped tables

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardian_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlement_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

-- Helper function to extract user_id from session context or JWT claim
CREATE OR REPLACE FUNCTION app_user_id() RETURNS UUID AS $$
BEGIN
  RETURN COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID,
    NULLIF(current_setting('app.current_user_id', true), '')::UUID
  );
EXCEPTION
  WHEN OTHERS THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- Profiles Policies
DROP POLICY IF EXISTS profiles_select_own ON profiles;
CREATE POLICY profiles_select_own ON profiles FOR SELECT USING (id = app_user_id());

DROP POLICY IF EXISTS profiles_insert_own ON profiles;
CREATE POLICY profiles_insert_own ON profiles FOR INSERT WITH CHECK (id = app_user_id());

DROP POLICY IF EXISTS profiles_update_own ON profiles;
CREATE POLICY profiles_update_own ON profiles FOR UPDATE USING (id = app_user_id());

-- Conversations Policies
DROP POLICY IF EXISTS conversations_select_own ON conversations;
CREATE POLICY conversations_select_own ON conversations FOR SELECT USING (user_id = app_user_id());

DROP POLICY IF EXISTS conversations_insert_own ON conversations;
CREATE POLICY conversations_insert_own ON conversations FOR INSERT WITH CHECK (user_id = app_user_id());

DROP POLICY IF EXISTS conversations_update_own ON conversations;
CREATE POLICY conversations_update_own ON conversations FOR UPDATE USING (user_id = app_user_id());

DROP POLICY IF EXISTS conversations_delete_own ON conversations;
CREATE POLICY conversations_delete_own ON conversations FOR DELETE USING (user_id = app_user_id());

-- Messages Policies
DROP POLICY IF EXISTS messages_select_own ON messages;
CREATE POLICY messages_select_own ON messages FOR SELECT USING (user_id = app_user_id());

DROP POLICY IF EXISTS messages_insert_own ON messages;
CREATE POLICY messages_insert_own ON messages FOR INSERT WITH CHECK (user_id = app_user_id());

-- Purchase Intents Policies
DROP POLICY IF EXISTS purchase_intents_select_own ON purchase_intents;
CREATE POLICY purchase_intents_select_own ON purchase_intents FOR SELECT USING (user_id = app_user_id());

DROP POLICY IF EXISTS purchase_intents_insert_own ON purchase_intents;
CREATE POLICY purchase_intents_insert_own ON purchase_intents FOR INSERT WITH CHECK (user_id = app_user_id());

DROP POLICY IF EXISTS purchase_intents_update_own ON purchase_intents;
CREATE POLICY purchase_intents_update_own ON purchase_intents FOR UPDATE USING (user_id = app_user_id());

-- Approval Snapshots Policies
DROP POLICY IF EXISTS approval_snapshots_select_own ON approval_snapshots;
CREATE POLICY approval_snapshots_select_own ON approval_snapshots FOR SELECT USING (user_id = app_user_id());

-- Audit Events Policies: SELECT own, INSERT allowed, NO UPDATE OR DELETE for standard users (append-only)
DROP POLICY IF EXISTS audit_events_select_own ON audit_events;
CREATE POLICY audit_events_select_own ON audit_events FOR SELECT USING (user_id = app_user_id());

DROP POLICY IF EXISTS audit_events_insert ON audit_events;
CREATE POLICY audit_events_insert ON audit_events FOR INSERT WITH CHECK (user_id IS NULL OR user_id = app_user_id());

-- Explicitly disallow UPDATE and DELETE on audit_events for non-superusers
REVOKE UPDATE, DELETE ON audit_events FROM PUBLIC;
