
-- Rename index first to match new column name convention (optional but cleaner)
ALTER INDEX "NewsletterLog_groupId_idx" RENAME TO "NewsletterLog_tenantId_idx";

-- Rename the column instead of dropping it
ALTER TABLE "NewsletterLog" RENAME COLUMN "groupId" TO "tenantId";
