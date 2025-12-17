-- CreateTable
CREATE TABLE "NewsletterLog" (
    "id" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "memberId" TEXT,
    "groupId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "content" JSONB NOT NULL,

    CONSTRAINT "NewsletterLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NewsletterLog_userId_idx" ON "NewsletterLog"("userId");

-- CreateIndex
CREATE INDEX "NewsletterLog_groupId_idx" ON "NewsletterLog"("groupId");

-- CreateIndex
CREATE INDEX "NewsletterLog_sentAt_idx" ON "NewsletterLog"("sentAt");
