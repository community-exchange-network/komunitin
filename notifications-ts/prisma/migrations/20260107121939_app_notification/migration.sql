-- CreateTable
CREATE TABLE "AppNotification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT,
    "eventName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "image" TEXT,
    "data" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppNotification_tenantId_userId_createdAt_idx" ON "AppNotification"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "AppNotification_tenantId_userId_readAt_idx" ON "AppNotification"("tenantId", "userId", "readAt");
