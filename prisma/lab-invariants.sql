-- Simulator records are separate from all real-chain tables.
CREATE OR REPLACE FUNCTION lab_append_only() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Simulation evidence is append-only' USING ERRCODE='23514'; END $$ LANGUAGE plpgsql;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['LabLedger','LabEvent','LabSigning','LabMovementAuthorization','LabTask'] LOOP
 EXECUTE format('DROP TRIGGER IF EXISTS lab_append_only ON %I',t);
 EXECUTE format('CREATE TRIGGER lab_append_only BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION lab_append_only()',t);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION lab_protect_authorization() RETURNS trigger AS $$ BEGIN
 IF (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') THEN RAISE EXCEPTION 'Trusted simulation authorization is immutable' USING ERRCODE='23514'; END IF;
 IF OLD."status" <> 'ACTIVE' AND NEW."status" <> OLD."status" THEN RAISE EXCEPTION 'Consumed authorization cannot be reactivated' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS lab_immutable_authorization ON "LabAuthorization";
CREATE TRIGGER lab_immutable_authorization BEFORE UPDATE ON "LabAuthorization" FOR EACH ROW EXECUTE FUNCTION lab_protect_authorization();
CREATE OR REPLACE FUNCTION lab_protect_purchase() RETURNS trigger AS $$ BEGIN
 IF NEW."trusted" IS DISTINCT FROM OLD."trusted" OR NEW."requirements" IS DISTINCT FROM OLD."requirements" OR NEW."environmentId" <> OLD."environmentId" OR NEW."taskId" <> OLD."taskId" OR NEW."userId" <> OLD."userId" OR NEW."productId" <> OLD."productId" OR NEW."amount" <> OLD."amount" OR NEW."ordinal" <> OLD."ordinal" OR NEW."clientKey" <> OLD."clientKey" THEN RAISE EXCEPTION 'Trusted purchase fields are immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS lab_immutable_purchase ON "LabPurchase";
CREATE TRIGGER lab_immutable_purchase BEFORE UPDATE ON "LabPurchase" FOR EACH ROW EXECUTE FUNCTION lab_protect_purchase();
CREATE OR REPLACE FUNCTION lab_protect_environment() RETURNS trigger AS $$ BEGIN
 IF NEW."seed" <> OLD."seed" OR NEW."kind" <> OLD."kind" OR NEW."initial" IS DISTINCT FROM OLD."initial" OR NEW."userId" <> OLD."userId" OR NEW."sandboxId" <> OLD."sandboxId" OR NEW."engineVersion" <> OLD."engineVersion" OR NEW."ruleVersion" <> OLD."ruleVersion" THEN RAISE EXCEPTION 'Simulation isolation and fixture configuration are immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS lab_immutable_environment ON "LabEnvironment";
CREATE TRIGGER lab_immutable_environment BEFORE UPDATE ON "LabEnvironment" FOR EACH ROW EXECUTE FUNCTION lab_protect_environment();
DO $$ DECLARE t text; c text; BEGIN
 FOREACH t IN ARRAY ARRAY['LabWallet','LabBalance','LabLedger','LabTask','LabPurchase','LabAuthorization','LabAttack','LabAttempt','LabDecision','LabSigning','LabNonce','LabSettlement','LabBlock','LabTransaction','LabLog','LabCheckpoint','LabIncident','LabFlowEdge','LabExchangeCase','LabEvent','LabRun','LabSnapshot','LabConversation','LabMessage','LabAllowance','LabMovementAuthorization','LabExecution'] LOOP
 c := lower(t)||'_environment_fk';
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname=c AND conrelid=format('%I',t)::regclass) THEN
 EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("environmentId") REFERENCES "LabEnvironment"(id) DEFERRABLE INITIALLY DEFERRED',t,c);
 END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='lab_balance_nonnegative' AND conrelid='"LabBalance"'::regclass) THEN ALTER TABLE "LabBalance" ADD CONSTRAINT lab_balance_nonnegative CHECK(amount>=0); END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='lab_auth_status' AND conrelid='"LabAuthorization"'::regclass) THEN ALTER TABLE "LabAuthorization" ADD CONSTRAINT lab_auth_status CHECK(status IN ('ACTIVE','CONSUMED','REVOKED')); END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='lab_positive_amount' AND conrelid='"LabPurchase"'::regclass) THEN ALTER TABLE "LabPurchase" ADD CONSTRAINT lab_positive_amount CHECK(amount ~ '^[1-9][0-9]{0,77}$' AND amount::numeric<2::numeric^256); END IF;
END $$;
DO $$ DECLARE spec text[]; specs text[][] := ARRAY[
 ARRAY['LabBalance','walletId','LabWallet'],ARRAY['LabLedger','walletId','LabWallet'],ARRAY['LabPurchase','taskId','LabTask'],ARRAY['LabAuthorization','purchaseId','LabPurchase'],ARRAY['LabAttempt','purchaseId','LabPurchase'],ARRAY['LabAttempt','attackId','LabAttack'],ARRAY['LabDecision','attemptId','LabAttempt'],ARRAY['LabRuleResult','decisionId','LabDecision'],ARRAY['LabSigning','authorizationId','LabAuthorization'],ARRAY['LabSigning','attemptId','LabAttempt'],ARRAY['LabSettlement','signingId','LabSigning'],ARRAY['LabSettlement','transactionId','LabTransaction'],ARRAY['LabTransaction','blockId','LabBlock'],ARRAY['LabLog','transactionId','LabTransaction'],ARRAY['LabFlowEdge','logId','LabLog'],ARRAY['LabExecution','transactionId','LabTransaction']]; c text;
BEGIN
 FOREACH spec SLICE 1 IN ARRAY specs LOOP
 c:=lower(spec[1]||'_'||spec[2]||'_fk');
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname=c AND conrelid=format('%I',spec[1])::regclass) THEN EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) DEFERRABLE INITIALLY DEFERRED',spec[1],c,spec[2],spec[3]);END IF;
 END LOOP;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS lab_canonical_block_number ON "LabBlock"("environmentId",number) WHERE canonical;
CREATE OR REPLACE FUNCTION lab_execution_authorization() RETURNS trigger AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM "LabSigning" s WHERE s.id=NEW."authorizationRef" AND s."environmentId"=NEW."environmentId") AND NOT EXISTS(SELECT 1 FROM "LabMovementAuthorization" m WHERE m.id=NEW."authorizationRef" AND m."environmentId"=NEW."environmentId") THEN RAISE EXCEPTION 'No persisted authorization for virtual transaction' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS lab_authorized_execution ON "LabTransaction";
CREATE TRIGGER lab_authorized_execution BEFORE INSERT ON "LabTransaction" FOR EACH ROW EXECUTE FUNCTION lab_execution_authorization();

-- EVM addresses are case-insensitive; checksum variants cannot split one account into two balances.
CREATE UNIQUE INDEX IF NOT EXISTS lab_wallet_evm_address_unique ON "LabWallet"("environmentId",lower(address));
