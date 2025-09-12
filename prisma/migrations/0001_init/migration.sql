-- CreateTable
CREATE TABLE "Tenant" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'Europe/Rome',
  "config" JSONB,
  "features" JSONB,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "Tenant_name_idx" ON "Tenant"("name");

CREATE TABLE "User" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "name" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "User_tenantId_phone_key" ON "User"("tenantId","phone");
CREATE INDEX "User_tenantId_phone_idx" ON "User"("tenantId","phone");

CREATE TABLE "Booking" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "userPhone" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "people" INTEGER NOT NULL,
  "startAt" TIMESTAMP NOT NULL,
  "endAt" TIMESTAMP NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'confirmed',
  "calendarId" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Booking_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Booking_tenant_user_fkey" FOREIGN KEY ("tenantId","userPhone") REFERENCES "User"("tenantId","phone") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "Booking_tenantId_startAt_idx" ON "Booking"("tenantId","startAt");
CREATE INDEX "Booking_tenantId_userPhone_idx" ON "Booking"("tenantId","userPhone");

CREATE TABLE "Conversation" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "userPhone" TEXT NOT NULL,
  "flow" TEXT NOT NULL,
  "context" JSONB NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Conversation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Conversation_user_fkey" FOREIGN KEY ("tenantId","userPhone") REFERENCES "User"("tenantId","phone") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "Conversation_tenantId_userPhone_idx" ON "Conversation"("tenantId","userPhone");
CREATE INDEX "Conversation_tenantId_createdAt_idx" ON "Conversation"("tenantId","createdAt");
