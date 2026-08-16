-- CreateEnum
CREATE TYPE "RateBasis" AS ENUM ('HOURLY', 'DAILY');

-- CreateEnum
CREATE TYPE "VenueCategory" AS ENUM ('THEATRE', 'FUNCTION_VENUE', 'REHEARSAL_VENUE', 'RECORDING_STUDIO');

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "vatAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 15.00;

-- AlterTable
ALTER TABLE "venues" ADD COLUMN     "category" "VenueCategory" NOT NULL DEFAULT 'THEATRE',
ADD COLUMN     "rateBasis" "RateBasis" NOT NULL DEFAULT 'HOURLY';
