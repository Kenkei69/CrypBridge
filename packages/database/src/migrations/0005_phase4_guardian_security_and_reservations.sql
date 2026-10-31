-- Migration 0005: Phase 4 Blue Team Guardian Security, Atomic Spending Reservations, and Worker Fencing
-- Monotonically increasing worker fencing token, spending policies, atomic reservations, explainable decisions

-- 1. Add worker fencing token and guardian references to payment_executions
ALTER TABLE payment_executions
  ADD COLUMN IF NOT EXISTS fencing_token integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS permit_id text,
  ADD COLUMN IF NOT EXISTS guardian_decision_id uuid,
  ADD COLUMN IF NOT EXISTS spending_reservation_id uuid;

CREATE INDEX IF NOT EXISTS payment_executions_fencing_idx ON payment_executions (fencing_token);

-- 2. Guardian Spending Policies
CREATE TABLE IF NOT EXISTS guardian_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  policy_version integer NOT NULL DEFAULT 1,
  asset_identifier text NOT NULL DEFAULT 'USDC',
  network_identifier text NOT NULL DEFAULT 'eip155:84532',
  max_amount_per_payment numeric(78, 0) NOT NULL,
  max_amount_per_task numeric(78, 0) NOT NULL,
  max_amount_per_daily_window numeric(78, 0) NOT NULL,
  daily_window_seconds integer NOT NULL DEFAULT 86400,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guardian_policies_scope_idx ON guardian_policies (user_id, asset_identifier, network_identifier);
CREATE INDEX IF NOT EXISTS guardian_policies_active_idx ON guardian_policies (is_active);

-- 3. Spending Reservations
CREATE TABLE IF NOT EXISTS spending_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  purchase_intent_id uuid NOT NULL REFERENCES purchase_intents(id) ON DELETE CASCADE,
  payment_execution_id uuid REFERENCES payment_executions(id) ON DELETE CASCADE,
  policy_id uuid NOT NULL REFERENCES guardian_policies(id) ON DELETE RESTRICT,
  policy_version integer NOT NULL DEFAULT 1,
  asset_identifier text NOT NULL DEFAULT 'USDC',
  network_identifier text NOT NULL DEFAULT 'eip155:84532',
  amount numeric(78, 0) NOT NULL,
  reservation_status text NOT NULL DEFAULT 'RESERVED',
  task_id text,
  window_started_at timestamp with time zone NOT NULL,
  window_expires_at timestamp with time zone NOT NULL,
  release_reason text,
  committed_at timestamp with time zone,
  released_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Partial unique constraints: At most ONE active (RESERVED or COMMITTED) reservation per execution & per purchase intent
CREATE UNIQUE INDEX IF NOT EXISTS spending_reservations_execution_active_idx
  ON spending_reservations (payment_execution_id)
  WHERE reservation_status IN ('RESERVED', 'COMMITTED');

CREATE UNIQUE INDEX IF NOT EXISTS spending_reservations_intent_active_idx
  ON spending_reservations (purchase_intent_id)
  WHERE reservation_status IN ('RESERVED', 'COMMITTED');

CREATE INDEX IF NOT EXISTS spending_reservations_user_window_idx
  ON spending_reservations (user_id, asset_identifier, network_identifier, reservation_status, window_started_at);

CREATE INDEX IF NOT EXISTS spending_reservations_task_idx
  ON spending_reservations (task_id, reservation_status);

-- 4. Extend Guardian Decisions
ALTER TABLE guardian_decisions
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS approval_snapshot_id uuid REFERENCES approval_snapshots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_execution_id uuid REFERENCES payment_executions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reservation_id uuid REFERENCES spending_reservations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS permit_id text,
  ADD COLUMN IF NOT EXISTS policy_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS outcome text NOT NULL DEFAULT 'ALLOW',
  ADD COLUMN IF NOT EXISTS reason_code text NOT NULL DEFAULT 'AUTHORIZED',
  ADD COLUMN IF NOT EXISTS canonical_terms jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS proposed_terms jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS correlation_id text;

CREATE INDEX IF NOT EXISTS guardian_decisions_user_idx ON guardian_decisions (user_id);
CREATE INDEX IF NOT EXISTS guardian_decisions_execution_idx ON guardian_decisions (payment_execution_id);
CREATE INDEX IF NOT EXISTS guardian_decisions_outcome_idx ON guardian_decisions (outcome);
CREATE INDEX IF NOT EXISTS guardian_decisions_reason_code_idx ON guardian_decisions (reason_code);
CREATE INDEX IF NOT EXISTS guardian_decisions_correlation_idx ON guardian_decisions (correlation_id);

-- 5. Foreign keys back to payment_executions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payment_executions_guardian_decision_fk'
  ) THEN
    ALTER TABLE payment_executions
      ADD CONSTRAINT payment_executions_guardian_decision_fk
      FOREIGN KEY (guardian_decision_id) REFERENCES guardian_decisions(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payment_executions_spending_reservation_fk'
  ) THEN
    ALTER TABLE payment_executions
      ADD CONSTRAINT payment_executions_spending_reservation_fk
      FOREIGN KEY (spending_reservation_id) REFERENCES spending_reservations(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 6. Row Level Security Policies
ALTER TABLE guardian_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE spending_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardian_decisions ENABLE ROW LEVEL SECURITY;

-- Guardian Policies: Read-only for authenticated users; admins modify
DROP POLICY IF EXISTS "Users can view active policies" ON guardian_policies;
CREATE POLICY "Users can view active policies"
  ON guardian_policies
  FOR SELECT
  USING (
    is_active = true AND (
      user_id IS NULL OR
      user_id = NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
    )
  );

-- Spending Reservations: Users can view their own reservations
DROP POLICY IF EXISTS "Users can view own spending reservations" ON spending_reservations;
CREATE POLICY "Users can view own spending reservations"
  ON spending_reservations
  FOR SELECT
  USING (user_id = NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid);

-- Guardian Decisions: Users can view their own decisions
DROP POLICY IF EXISTS "Users can view own guardian decisions" ON guardian_decisions;
CREATE POLICY "Users can view own guardian decisions"
  ON guardian_decisions
  FOR SELECT
  USING (
    user_id IS NULL OR
    user_id = NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
  );
