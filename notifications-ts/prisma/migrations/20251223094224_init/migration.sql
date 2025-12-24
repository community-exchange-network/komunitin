-- CreateTable
CREATE TABLE "NewsletterLog" (
    "id" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "memberId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "recipients" JSONB NOT NULL,
    "content" JSONB NOT NULL,

    CONSTRAINT "NewsletterLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NewsletterLog_memberId_idx" ON "NewsletterLog"("memberId");

-- CreateIndex
CREATE INDEX "NewsletterLog_groupId_idx" ON "NewsletterLog"("groupId");

-- CreateIndex
CREATE INDEX "NewsletterLog_sentAt_idx" ON "NewsletterLog"("sentAt");
