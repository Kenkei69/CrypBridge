-- AlterTable
ALTER TABLE "Simulation" ADD COLUMN     "chatTurnId" TEXT,
ADD COLUMN     "conversationId" TEXT,
ALTER COLUMN "stage" SET DEFAULT 'AWAITING_APPROVAL';

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'New conversation',
    "context" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "sequence" SERIAL NOT NULL,
    "conversationId" TEXT NOT NULL,
    "simulationId" TEXT,
    "eventId" TEXT,
    "dedupKey" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatTurn" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatTurn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Conversation_userId_updatedAt_idx" ON "Conversation"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessage_sequence_key" ON "ChatMessage"("sequence");

-- CreateIndex
CREATE INDEX "ChatMessage_conversationId_sequence_idx" ON "ChatMessage"("conversationId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessage_conversationId_dedupKey_key" ON "ChatMessage"("conversationId", "dedupKey");

-- CreateIndex
CREATE UNIQUE INDEX "ChatTurn_conversationId_clientKey_key" ON "ChatTurn"("conversationId", "clientKey");

-- CreateIndex
CREATE UNIQUE INDEX "Simulation_chatTurnId_key" ON "Simulation"("chatTurnId");

-- AddForeignKey
ALTER TABLE "Simulation" ADD CONSTRAINT "Simulation_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Simulation" ADD CONSTRAINT "Simulation_chatTurnId_fkey" FOREIGN KEY ("chatTurnId") REFERENCES "ChatTurn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_simulationId_fkey" FOREIGN KEY ("simulationId") REFERENCES "Simulation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "SimulationEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatTurn" ADD CONSTRAINT "ChatTurn_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


UPDATE "Simulation" SET stage = CASE stage
 WHEN 'AWAITING_CONFIRMATION' THEN 'AWAITING_APPROVAL'
 WHEN 'MERCHANT_REQUESTING' THEN 'AUTHORIZED'
 WHEN 'ATTACK_WINDOW' THEN 'ATTACK_WINDOW_OPEN'
 WHEN 'AUTHORIZED' THEN 'APPROVED'
 WHEN 'ERROR' THEN 'FAILED'
 ELSE stage END;
