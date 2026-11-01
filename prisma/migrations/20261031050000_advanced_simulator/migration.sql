-- CreateTable
CREATE TABLE "LabWorkspace" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sandboxId" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,

    CONSTRAINT "LabWorkspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabEnvironment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sandboxId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "ruleVersion" TEXT NOT NULL,
    "initial" JSONB NOT NULL,
    "clock" INTEGER NOT NULL DEFAULT 0,
    "head" INTEGER NOT NULL DEFAULT 0,
    "eventSequence" INTEGER NOT NULL DEFAULT 0,
    "purchaseSequence" INTEGER NOT NULL DEFAULT 0,
    "eventHash" TEXT NOT NULL DEFAULT 'genesis',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabEnvironment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabWallet" (
    "id" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "transactionNonce" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LabWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabBalance" (
    "id" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "amount" DECIMAL(78,0) NOT NULL,

    CONSTRAINT "LabBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabLedger" (
    "id" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "transactionId" TEXT,
    "walletId" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "delta" DECIMAL(78,0) NOT NULL,
    "kind" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,

    CONSTRAINT "LabLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabAllowance" (
    "id" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "spender" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "amount" TEXT NOT NULL,

    CONSTRAINT "LabAllowance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabProduct" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "merchantName" TEXT NOT NULL,
    "merchantRole" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "keywords" JSONB NOT NULL,

    CONSTRAINT "LabProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabTask" (
    "id" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "budget" TEXT NOT NULL,
    "dailyLimit" TEXT NOT NULL,
    "authorizedBy" TEXT NOT NULL,
    "createdAt" INTEGER NOT NULL,

    CONSTRAINT "LabTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabPurchase" (
    "id" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "productId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'AWAITING_APPROVAL',
    "trusted" JSONB NOT NULL,
    "requirements" JSONB NOT NULL,
    "amount" TEXT NOT NULL,
    "error" TEXT,
    "attackId" TEXT,
    "transactionId" TEXT,
    "createdAt" INTEGER NOT NULL,
    "updatedAt" INTEGER NOT NULL,

    CONSTRAINT "LabPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabAuthorization" (
    "id" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "buyer" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "scheme" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "createdAt" INTEGER NOT NULL,
    "expiresAt" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "digest" TEXT NOT NULL,

    CONSTRAINT "LabAuthorization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabAttack" (
    "id" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "targetKind" TEXT NOT NULL,
    "targetId" TEXT,
    "injectionStage" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "expiresAt" INTEGER NOT NULL,
    "triggeredPurchaseId" TEXT,
    "original" JSONB,
    "modified" JSONB,
    "result" JSONB,
    "createdAt" INTEGER NOT NULL,

    CONSTRAINT "LabAttack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabAttempt" (
    "id" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "attackId" TEXT,
    "key" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "original" JSONB NOT NULL,
    "modified" JSONB NOT NULL,
    "headers" JSONB NOT NULL,
    "verification" JSONB,
    "result" JSONB,
    "latency" INTEGER NOT NULL DEFAULT 0,
    "createdAt" INTEGER NOT NULL,

    CONSTRAINT "LabAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabDecision" (
    "id" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "ruleVersion" TEXT NOT NULL,
    "binding" TEXT NOT NULL,
    "createdAt" INTEGER NOT NULL,

    CONSTRAINT "LabDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabRuleResult" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "evaluated" JSONB NOT NULL,
    "expected" JSONB NOT NULL,
    "explanation" TEXT NOT NULL,
    "evidenceRef" TEXT NOT NULL,

    CONSTRAINT "LabRuleResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabSigning" (
    "id" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "authorizationId" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "binding" TEXT NOT NULL,
    "typedData" JSONB NOT NULL,
    "payload" JSONB NOT NULL,
    "signatureKind" TEXT NOT NULL,
    "createdAt" INTEGER NOT NULL,

    CONSTRAINT "LabSigning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabNonce" (
    "id" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "signingId" TEXT NOT NULL,
    "authorizer" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,

    CONSTRAINT "LabNonce_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabSettlement" (
    "id" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "signingId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "verification" JSONB NOT NULL,
    "response" JSONB NOT NULL,
    "transactionId" TEXT,

    CONSTRAINT "LabSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabBlock" (
    "id" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "parentHash" TEXT NOT NULL,
    "timestamp" INTEGER NOT NULL,
    "canonical" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "LabBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabTransaction" (
    "id" TEXT NOT NULL,
    "tokenSender" TEXT NOT NULL,
    "tokenRecipient" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "purchaseId" TEXT,
    "blockId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "contract" TEXT NOT NULL,
    "tokenAmount" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "nonce" INTEGER NOT NULL,
    "gasLimit" TEXT NOT NULL,
    "gasUsed" TEXT NOT NULL,
    "feePerGas" TEXT NOT NULL,
    "calldata" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "confirmations" INTEGER NOT NULL,
    "timestamp" INTEGER NOT NULL,
    "authorizationRef" TEXT NOT NULL,
    "operation" TEXT NOT NULL,

    CONSTRAINT "LabTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabLog" (
    "id" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "contract" TEXT NOT NULL,
    "topics" JSONB NOT NULL,
    "data" TEXT NOT NULL,
    "decoded" JSONB NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "LabLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabCheckpoint" (
    "environmentId" TEXT NOT NULL,
    "blockNumber" INTEGER NOT NULL,
    "blockHash" TEXT NOT NULL,
    "eventSequence" INTEGER NOT NULL,

    CONSTRAINT "LabCheckpoint_pkey" PRIMARY KEY ("environmentId")
);

-- CreateTable
CREATE TABLE "LabIncident" (
    "id" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "purchaseId" TEXT,
    "attackId" TEXT,
    "classification" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" INTEGER NOT NULL,

    CONSTRAINT "LabIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabFlowEdge" (
    "id" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "logId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "timestamp" INTEGER NOT NULL,
    "confidence" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,

    CONSTRAINT "LabFlowEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabExchangeCase" (
    "id" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "request" JSONB NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" INTEGER NOT NULL,

    CONSTRAINT "LabExchangeCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabEvent" (
    "id" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "purchaseId" TEXT,
    "actor" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "relatedId" TEXT,
    "timestamp" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "metadata" JSONB NOT NULL,
    "previousHash" TEXT NOT NULL,
    "integrity" TEXT NOT NULL,

    CONSTRAINT "LabEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sandboxId" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "snapshot" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "semanticDigest" TEXT NOT NULL,
    "replayOf" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabSnapshot" (
    "id" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "digest" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabConversation" (
    "id" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" INTEGER NOT NULL,

    CONSTRAINT "LabConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabMessage" (
    "id" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "purchaseId" TEXT,
    "sequence" INTEGER NOT NULL,

    CONSTRAINT "LabMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabMovementAuthorization" (
    "id" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "fromRole" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "signatureKind" TEXT NOT NULL,
    "approvedBy" TEXT NOT NULL,
    "createdAt" INTEGER NOT NULL,

    CONSTRAINT "LabMovementAuthorization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabExecution" (
    "id" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "authorizationRef" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "receipt" JSONB NOT NULL,

    CONSTRAINT "LabExecution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LabWorkspace_userId_sandboxId_key" ON "LabWorkspace"("userId", "sandboxId");

-- CreateIndex
CREATE INDEX "LabEnvironment_userId_sandboxId_idx" ON "LabEnvironment"("userId", "sandboxId");

-- CreateIndex
CREATE UNIQUE INDEX "LabWallet_environmentId_role_key" ON "LabWallet"("environmentId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "LabWallet_environmentId_address_key" ON "LabWallet"("environmentId", "address");

-- CreateIndex
CREATE UNIQUE INDEX "LabBalance_walletId_asset_key" ON "LabBalance"("walletId", "asset");

-- CreateIndex
CREATE INDEX "LabLedger_walletId_asset_idx" ON "LabLedger"("walletId", "asset");

-- CreateIndex
CREATE UNIQUE INDEX "LabLedger_environmentId_sequence_key" ON "LabLedger"("environmentId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "LabPurchase_environmentId_clientKey_key" ON "LabPurchase"("environmentId", "clientKey");

-- CreateIndex
CREATE UNIQUE INDEX "LabPurchase_environmentId_ordinal_key" ON "LabPurchase"("environmentId", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "LabAuthorization_purchaseId_key" ON "LabAuthorization"("purchaseId");

-- CreateIndex
CREATE INDEX "LabAttack_environmentId_status_idx" ON "LabAttack"("environmentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LabAttempt_purchaseId_key_key" ON "LabAttempt"("purchaseId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "LabRuleResult_decisionId_ruleId_key" ON "LabRuleResult"("decisionId", "ruleId");

-- CreateIndex
CREATE UNIQUE INDEX "LabSigning_attemptId_key" ON "LabSigning"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "LabSigning_authorizationId_key" ON "LabSigning"("authorizationId");

-- CreateIndex
CREATE UNIQUE INDEX "LabSigning_environmentId_nonce_key" ON "LabSigning"("environmentId", "nonce");

-- CreateIndex
CREATE UNIQUE INDEX "LabNonce_signingId_key" ON "LabNonce"("signingId");

-- CreateIndex
CREATE UNIQUE INDEX "LabNonce_environmentId_authorizer_nonce_key" ON "LabNonce"("environmentId", "authorizer", "nonce");

-- CreateIndex
CREATE UNIQUE INDEX "LabSettlement_attemptId_key" ON "LabSettlement"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "LabSettlement_signingId_key" ON "LabSettlement"("signingId");

-- CreateIndex
CREATE UNIQUE INDEX "LabSettlement_transactionId_key" ON "LabSettlement"("transactionId");

-- CreateIndex
CREATE INDEX "LabBlock_environmentId_number_idx" ON "LabBlock"("environmentId", "number");

-- CreateIndex
CREATE INDEX "LabTransaction_environmentId_timestamp_idx" ON "LabTransaction"("environmentId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "LabTransaction_environmentId_reference_key" ON "LabTransaction"("environmentId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "LabLog_transactionId_index_key" ON "LabLog"("transactionId", "index");

-- CreateIndex
CREATE UNIQUE INDEX "LabFlowEdge_logId_key" ON "LabFlowEdge"("logId");

-- CreateIndex
CREATE UNIQUE INDEX "LabEvent_environmentId_sequence_key" ON "LabEvent"("environmentId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "LabConversation_environmentId_clientKey_key" ON "LabConversation"("environmentId", "clientKey");

-- CreateIndex
CREATE UNIQUE INDEX "LabMessage_conversationId_clientKey_key" ON "LabMessage"("conversationId", "clientKey");

-- CreateIndex
CREATE UNIQUE INDEX "LabMessage_environmentId_sequence_key" ON "LabMessage"("environmentId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "LabExecution_transactionId_key" ON "LabExecution"("transactionId");
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

CREATE UNIQUE INDEX IF NOT EXISTS lab_wallet_evm_address_unique ON "LabWallet"("environmentId",lower(address));
