-- AlterEnum
ALTER TYPE "EmailStatus" ADD VALUE 'PREVIEW';

-- AlterTable
ALTER TABLE "email_logs" ADD COLUMN     "previewUrl" TEXT;
