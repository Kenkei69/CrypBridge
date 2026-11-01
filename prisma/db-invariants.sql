CREATE OR REPLACE FUNCTION protect_purchase_authorization() RETURNS trigger AS $$
BEGIN
 RAISE EXCEPTION 'Confirmed purchase authorization is immutable' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS immutable_purchase_authorization ON "PurchaseAuthorization";
CREATE TRIGGER immutable_purchase_authorization BEFORE UPDATE OR DELETE ON "PurchaseAuthorization" FOR EACH ROW EXECUTE FUNCTION protect_purchase_authorization();
CREATE OR REPLACE FUNCTION protect_simulation_trust() RETURNS trigger AS $$
BEGIN
 IF NEW."proposal" IS DISTINCT FROM OLD."proposal" OR NEW."userId" IS DISTINCT FROM OLD."userId" OR NEW."resourceId" IS DISTINCT FROM OLD."resourceId" OR NEW."walletId" IS DISTINCT FROM OLD."walletId" OR NEW."prompt" IS DISTINCT FROM OLD."prompt" OR (OLD."original" IS NOT NULL AND NEW."original" IS DISTINCT FROM OLD."original") THEN
 RAISE EXCEPTION 'Simulation trust fields are immutable' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS immutable_simulation_trust ON "Simulation";
CREATE TRIGGER immutable_simulation_trust BEFORE UPDATE ON "Simulation" FOR EACH ROW EXECUTE FUNCTION protect_simulation_trust();
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='mock_balance_nonnegative' AND conrelid='"MockAccount"'::regclass) THEN ALTER TABLE "MockAccount" ADD CONSTRAINT mock_balance_nonnegative CHECK (balance >= 0); END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='mock_transfer_positive' AND conrelid='"MockTransfer"'::regclass) THEN ALTER TABLE "MockTransfer" ADD CONSTRAINT mock_transfer_positive CHECK (amount > 0); END IF;
END; $$;
