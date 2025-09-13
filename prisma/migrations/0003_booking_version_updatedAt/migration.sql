-- AlterTable
ALTER TABLE "Booking"
  ADD COLUMN     "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN     "version"   INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Booking_tenantId_status_idx" ON "Booking"("tenantId","status");
