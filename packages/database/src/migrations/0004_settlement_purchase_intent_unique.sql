-- Phase 3 Review Fix: Enforce purchase-level uniqueness on settlement_records
-- Guarantees that a single purchase intent cannot ever be settled more than once,
-- even if an attacker or rogue client supplies a new authorization ID or different idempotency key.
CREATE UNIQUE INDEX IF NOT EXISTS settlement_records_intent_unique_idx ON settlement_records (purchase_intent_id);
