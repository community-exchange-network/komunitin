-- CreateTable
CREATE TABLE "PushNotification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "clickedAction" TEXT,
    "meta" JSONB,

    CONSTRAINT "PushNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PushNotification_tenantId_userId_createdAt_idx" ON "PushNotification"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "PushNotification_subscriptionId_idx" ON "PushNotification"("subscriptionId");

-- CreateIndex
CREATE INDEX "PushNotification_eventId_idx" ON "PushNotification"("eventId");
