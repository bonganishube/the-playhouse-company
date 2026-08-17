-- AlterTable
ALTER TABLE "bot_messages" ADD COLUMN     "externalId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "bot_messages_externalId_key" ON "bot_messages"("externalId");

