-- AlterTable
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_tenant_user_fkey";
ALTER TABLE "Booking" ALTER COLUMN "userPhone" DROP NOT NULL;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_tenant_user_fkey" FOREIGN KEY ("tenantId","userPhone") REFERENCES "User"("tenantId","phone") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Conversation" DROP CONSTRAINT "Conversation_user_fkey";
ALTER TABLE "Conversation" ALTER COLUMN "userPhone" DROP NOT NULL;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_user_fkey" FOREIGN KEY ("tenantId","userPhone") REFERENCES "User"("tenantId","phone") ON DELETE SET NULL ON UPDATE CASCADE;
