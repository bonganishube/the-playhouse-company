-- CreateEnum
CREATE TYPE "BotChannel" AS ENUM ('WEB', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "BotRole" AS ENUM ('USER', 'MODEL', 'TOOL');

-- CreateTable
CREATE TABLE "bot_conversations" (
    "id" TEXT NOT NULL,
    "channel" "BotChannel" NOT NULL,
    "externalId" TEXT NOT NULL,
    "userId" TEXT,
    "cartId" TEXT,
    "contactName" TEXT,
    "handedOverAt" TIMESTAMP(3),
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bot_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bot_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "BotRole" NOT NULL,
    "content" TEXT NOT NULL,
    "toolName" TEXT,
    "toolPayload" JSONB,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bot_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bot_conversations_lastActiveAt_idx" ON "bot_conversations"("lastActiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "bot_conversations_channel_externalId_key" ON "bot_conversations"("channel", "externalId");

-- CreateIndex
CREATE INDEX "bot_messages_conversationId_createdAt_idx" ON "bot_messages"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "bot_messages_createdAt_idx" ON "bot_messages"("createdAt");

-- AddForeignKey
ALTER TABLE "bot_messages" ADD CONSTRAINT "bot_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "bot_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
