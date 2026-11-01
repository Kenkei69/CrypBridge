DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='live_intent_amount' AND conrelid='"LiveIntent"'::regclass) THEN
 ALTER TABLE "LiveIntent" ADD CONSTRAINT "live_intent_amount" CHECK ("amount" ~ '^[0-9]+$' AND "amount"::numeric > 0 AND "amount"::numeric <= 1000000);
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='live_intent_state' AND conrelid='"LiveIntent"'::regclass) THEN
 ALTER TABLE "LiveIntent" ADD CONSTRAINT "live_intent_state" CHECK ("state" IN ('AWAITING_APPROVAL','RESERVED','SIGNED','SUBMITTED','CONFIRMING','CONFIRMED','RECONCILING','BLOCKED','FAILED','REORGANIZED'));
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='usdc_amount' AND conrelid='"UsdcTransfer"'::regclass) THEN
 ALTER TABLE "UsdcTransfer" ADD CONSTRAINT "usdc_amount" CHECK ("amount" ~ '^[0-9]+$');
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='settlement_state' AND conrelid='"LiveSettlement"'::regclass) THEN
 ALTER TABLE "LiveSettlement" ADD CONSTRAINT "settlement_state" CHECK ("state" IN ('SUBMITTED','CONFIRMING','CONFIRMED','RECONCILING','REJECTED'));
 END IF;
END $$;
CREATE OR REPLACE FUNCTION protect_live_intent() RETURNS trigger AS $$
BEGIN
 IF NEW."userId" IS DISTINCT FROM OLD."userId" OR NEW."buyer" IS DISTINCT FROM OLD."buyer" OR NEW."payTo" IS DISTINCT FROM OLD."payTo" OR NEW."amount" IS DISTINCT FROM OLD."amount" OR NEW."resource" IS DISTINCT FROM OLD."resource" OR NEW."nonce" IS DISTINCT FROM OLD."nonce" OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt" OR (OLD."approvedAt" IS NOT NULL AND NEW."approvedAt" IS DISTINCT FROM OLD."approvedAt") THEN
 RAISE EXCEPTION 'Trusted live payment authorization is immutable' USING ERRCODE='23514';
 END IF;
 IF OLD."state" <> 'AWAITING_APPROVAL' AND NEW."state" = 'AWAITING_APPROVAL' THEN
 RAISE EXCEPTION 'A consumed payment cannot be reapproved' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS immutable_live_intent ON "LiveIntent";
CREATE TRIGGER immutable_live_intent BEFORE UPDATE ON "LiveIntent" FOR EACH ROW EXECUTE FUNCTION protect_live_intent();
CREATE OR REPLACE FUNCTION protect_live_signing() RETURNS trigger AS $$
BEGIN
 RAISE EXCEPTION 'Signing authorization consumption is immutable' USING ERRCODE='23514';
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS immutable_live_signing ON "LiveSigning";
CREATE TRIGGER immutable_live_signing BEFORE UPDATE OR DELETE ON "LiveSigning" FOR EACH ROW EXECUTE FUNCTION protect_live_signing();
