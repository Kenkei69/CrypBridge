ALTER TABLE "Guard" ADD COLUMN "authenticationReference" TEXT;
-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspace" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL DEFAULT 6,

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MockResource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" TEXT NOT NULL,
    "keywords" JSONB NOT NULL,
    "content" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,

    CONSTRAINT "MockResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuardianPolicy" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuardianPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Simulation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'AWAITING_CONFIRMATION',
    "proposal" JSONB NOT NULL,
    "original" JSONB,
    "modified" JSONB,
    "delivery" JSONB,
    "windowExpiresAt" TIMESTAMP(3),
    "retryOf" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Simulation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseAuthorization" (
    "id" TEXT NOT NULL,
    "simulationId" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "scheme" TEXT NOT NULL,
    "resourceUrl" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "digest" TEXT NOT NULL,

    CONSTRAINT "PurchaseAuthorization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuardDecision" (
    "id" TEXT NOT NULL,
    "simulationId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "rules" JSONB NOT NULL,
    "explanation" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "policyVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuardDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MockSigning" (
    "id" TEXT NOT NULL,
    "simulationId" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "proofHash" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "authorization" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MockSigning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MockAccount" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "balance" DECIMAL(78,0) NOT NULL,

    CONSTRAINT "MockAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MockTransfer" (
    "id" TEXT NOT NULL,
    "simulationId" TEXT,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "amount" DECIMAL(78,0) NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'payment',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MockTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimulationAttack" (
    "id" TEXT NOT NULL,
    "simulationId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "original" JSONB NOT NULL,
    "modified" JSONB NOT NULL,
    "deliveryStatus" TEXT NOT NULL DEFAULT 'delivered',
    "objective" TEXT NOT NULL DEFAULT 'pending',
    "defenderDecision" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SimulationAttack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimulationEvent" (
    "sequence" SERIAL NOT NULL,
    "id" TEXT NOT NULL,
    "simulationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SimulationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceSession_tokenHash_key" ON "WorkspaceSession"("tokenHash");

-- CreateIndex
CREATE INDEX "WorkspaceSession_expiresAt_idx" ON "WorkspaceSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "GuardianPolicy_version_key" ON "GuardianPolicy"("version");

-- CreateIndex
CREATE INDEX "Simulation_userId_createdAt_idx" ON "Simulation"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Simulation_stage_idx" ON "Simulation"("stage");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseAuthorization_simulationId_key" ON "PurchaseAuthorization"("simulationId");

-- CreateIndex
CREATE INDEX "GuardDecision_simulationId_createdAt_idx" ON "GuardDecision"("simulationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MockSigning_proofHash_key" ON "MockSigning"("proofHash");

-- CreateIndex
CREATE UNIQUE INDEX "MockAccount_address_key" ON "MockAccount"("address");

-- CreateIndex
CREATE UNIQUE INDEX "MockTransfer_simulationId_key" ON "MockTransfer"("simulationId");

-- CreateIndex
CREATE INDEX "SimulationAttack_simulationId_idx" ON "SimulationAttack"("simulationId");

-- CreateIndex
CREATE UNIQUE INDEX "SimulationEvent_sequence_key" ON "SimulationEvent"("sequence");

-- CreateIndex
CREATE INDEX "SimulationEvent_simulationId_createdAt_idx" ON "SimulationEvent"("simulationId", "createdAt");

-- AddForeignKey
ALTER TABLE "WorkspaceSession" ADD CONSTRAINT "WorkspaceSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MockResource" ADD CONSTRAINT "MockResource_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Simulation" ADD CONSTRAINT "Simulation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Simulation" ADD CONSTRAINT "Simulation_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "MockResource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseAuthorization" ADD CONSTRAINT "PurchaseAuthorization_simulationId_fkey" FOREIGN KEY ("simulationId") REFERENCES "Simulation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardDecision" ADD CONSTRAINT "GuardDecision_simulationId_fkey" FOREIGN KEY ("simulationId") REFERENCES "Simulation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MockSigning" ADD CONSTRAINT "MockSigning_simulationId_fkey" FOREIGN KEY ("simulationId") REFERENCES "Simulation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MockSigning" ADD CONSTRAINT "MockSigning_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "GuardDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MockTransfer" ADD CONSTRAINT "MockTransfer_simulationId_fkey" FOREIGN KEY ("simulationId") REFERENCES "Simulation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MockTransfer" ADD CONSTRAINT "MockTransfer_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "MockAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MockTransfer" ADD CONSTRAINT "MockTransfer_toId_fkey" FOREIGN KEY ("toId") REFERENCES "MockAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimulationAttack" ADD CONSTRAINT "SimulationAttack_simulationId_fkey" FOREIGN KEY ("simulationId") REFERENCES "Simulation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimulationEvent" ADD CONSTRAINT "SimulationEvent_simulationId_fkey" FOREIGN KEY ("simulationId") REFERENCES "Simulation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
