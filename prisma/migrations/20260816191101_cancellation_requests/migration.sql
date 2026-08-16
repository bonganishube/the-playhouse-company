-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "cancellationRequestReason" TEXT,
ADD COLUMN     "cancellationRequestedAt" TIMESTAMP(3);
