-- CreateTable
CREATE TABLE "ChainWallet" (
    "role" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChainWallet_pkey" PRIMARY KEY ("role")
);

-- CreateTable
CREATE TABLE "LiveIntent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "buyer" TEXT NOT NULL,
    "payTo" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'AWAITING_APPROVAL',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "nonce" TEXT NOT NULL,
    "requirements" JSONB NOT NULL,
    "payload" JSONB,
    "txHash" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveDecision" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "intentId" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    "rules" JSONB NOT NULL,
    "binding" TEXT NOT NULL,
    "attack" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveSigning" (
    "intentId" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "binding" TEXT NOT NULL,
    "consumedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveSigning_pkey" PRIMARY KEY ("intentId")
);

-- CreateTable
CREATE TABLE "LiveSettlement" (
    "nonce" TEXT NOT NULL,
    "fromBlock" BIGINT NOT NULL,
    "payer" TEXT NOT NULL,
    "requirements" JSONB NOT NULL,
    "payload" JSONB NOT NULL,
    "state" TEXT NOT NULL,
    "txHash" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveSettlement_pkey" PRIMARY KEY ("nonce")
);

-- CreateTable
CREATE TABLE "ChainTransaction" (
    "hash" TEXT NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "blockHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "confirmations" INTEGER NOT NULL,

    CONSTRAINT "ChainTransaction_pkey" PRIMARY KEY ("hash")
);

-- CreateTable
CREATE TABLE "UsdcTransfer" (
    "id" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "blockHash" TEXT NOT NULL,
    "contract" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "UsdcTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChainCheckpoint" (
    "id" TEXT NOT NULL,
    "startBlock" BIGINT NOT NULL DEFAULT 0,
    "blockHash" TEXT,
    "nextBlock" BIGINT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChainCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveWatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "caseId" TEXT NOT NULL DEFAULT '',
    "startBlock" BIGINT NOT NULL,

    CONSTRAINT "LiveWatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScamCase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "suspect" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScamCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestigationEdge" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "hop" INTEGER NOT NULL,
    "evidenceSource" TEXT NOT NULL,
    "attribution" TEXT NOT NULL DEFAULT 'Confirmed transfer relationship; ownership and stolen-fund attribution unknown',

    CONSTRAINT "InvestigationEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveNotification" (
    "sequence" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveNotification_pkey" PRIMARY KEY ("sequence")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChainWallet_address_key" ON "ChainWallet"("address");

-- CreateIndex
CREATE UNIQUE INDEX "LiveIntent_nonce_key" ON "LiveIntent"("nonce");

-- CreateIndex
CREATE UNIQUE INDEX "LiveIntent_txHash_key" ON "LiveIntent"("txHash");

-- CreateIndex
CREATE UNIQUE INDEX "LiveIntent_userId_clientKey_key" ON "LiveIntent"("userId", "clientKey");

-- CreateIndex
CREATE UNIQUE INDEX "LiveSigning_nonce_key" ON "LiveSigning"("nonce");

-- CreateIndex
CREATE UNIQUE INDEX "LiveSettlement_txHash_key" ON "LiveSettlement"("txHash");

-- CreateIndex
CREATE INDEX "UsdcTransfer_blockNumber_idx" ON "UsdcTransfer"("blockNumber");

-- CreateIndex
CREATE INDEX "UsdcTransfer_sender_idx" ON "UsdcTransfer"("sender");

-- CreateIndex
CREATE INDEX "UsdcTransfer_recipient_idx" ON "UsdcTransfer"("recipient");

-- CreateIndex
CREATE UNIQUE INDEX "UsdcTransfer_txHash_logIndex_key" ON "UsdcTransfer"("txHash", "logIndex");

-- CreateIndex
CREATE UNIQUE INDEX "LiveWatch_userId_address_caseId_key" ON "LiveWatch"("userId", "address", "caseId");

-- CreateIndex
CREATE UNIQUE INDEX "InvestigationEdge_caseId_transferId_key" ON "InvestigationEdge"("caseId", "transferId");

-- CreateIndex
CREATE UNIQUE INDEX "LiveNotification_key_key" ON "LiveNotification"("key");

-- CreateIndex
CREATE INDEX "LiveNotification_userId_sequence_idx" ON "LiveNotification"("userId", "sequence");
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
