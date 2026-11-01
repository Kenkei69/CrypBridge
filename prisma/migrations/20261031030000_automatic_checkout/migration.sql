-- AlterTable
ALTER TABLE "WorkspaceSession" ADD COLUMN     "sandboxId" TEXT;

-- AlterTable
ALTER TABLE "MockResource" ADD COLUMN     "description" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Simulation" ADD COLUMN     "automatic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sandboxId" TEXT;

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "sandboxId" TEXT;

-- CreateTable
CREATE TABLE "TestSandbox" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestSandbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShoppingSelection" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sandboxId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "discoveryId" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'PRODUCT_SELECTED',
    "method" JSONB,
    "simulationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShoppingSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentJob" (
    "id" TEXT NOT NULL,
    "simulationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttackPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sandboxId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "category" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "targetKind" TEXT NOT NULL,
    "targetId" TEXT,
    "triggeredSimulationId" TEXT,
    "attackId" TEXT,
    "result" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttackPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttackPlanEvent" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttackPlanEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sandboxId" TEXT NOT NULL,
    "simulationId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'BLOCKED_PAYMENT',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "evidence" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentAction" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AddressWatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sandboxId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AddressWatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AddressObservation" (
    "id" TEXT NOT NULL,
    "watchId" TEXT NOT NULL,
    "simulationId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AddressObservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TestSandbox_tokenHash_key" ON "TestSandbox"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "ShoppingSelection_simulationId_key" ON "ShoppingSelection"("simulationId");

-- CreateIndex
CREATE UNIQUE INDEX "ShoppingSelection_conversationId_clientKey_key" ON "ShoppingSelection"("conversationId", "clientKey");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentJob_simulationId_key" ON "PaymentJob"("simulationId");

-- CreateIndex
CREATE UNIQUE INDEX "AttackPlan_triggeredSimulationId_key" ON "AttackPlan"("triggeredSimulationId");

-- CreateIndex
CREATE INDEX "AttackPlan_userId_sandboxId_status_createdAt_idx" ON "AttackPlan"("userId", "sandboxId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Incident_simulationId_key" ON "Incident"("simulationId");

-- CreateIndex
CREATE UNIQUE INDEX "IncidentAction_incidentId_kind_key" ON "IncidentAction"("incidentId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "AddressWatch_userId_sandboxId_address_network_key" ON "AddressWatch"("userId", "sandboxId", "address", "network");

-- CreateIndex
CREATE UNIQUE INDEX "AddressObservation_watchId_simulationId_key" ON "AddressObservation"("watchId", "simulationId");

-- AddForeignKey
ALTER TABLE "AttackPlanEvent" ADD CONSTRAINT "AttackPlanEvent_planId_fkey" FOREIGN KEY ("planId") REFERENCES "AttackPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentAction" ADD CONSTRAINT "IncidentAction_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

