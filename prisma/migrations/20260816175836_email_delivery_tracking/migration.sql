/*
  Warnings:

  - You are about to drop the column `success` on the `email_logs` table. All the data in the column will be lost.
  - Added the required column `html` to the `email_logs` table without a default value. This is not possible if the table is not empty.
  - Added the required column `status` to the `email_logs` table without a default value. This is not possible if the table is not empty.
  - Added the required column `text` to the `email_logs` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('SENT', 'QUEUED', 'FAILED', 'NOT_CONFIGURED');

-- AlterTable
ALTER TABLE "email_logs" DROP COLUMN "success",
ADD COLUMN     "attachments" JSONB,
ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "html" TEXT NOT NULL,
ADD COLUMN     "lastAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "paymentId" TEXT,
ADD COLUMN     "status" "EmailStatus" NOT NULL,
ADD COLUMN     "text" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "email_logs_status_attempts_idx" ON "email_logs"("status", "attempts");
