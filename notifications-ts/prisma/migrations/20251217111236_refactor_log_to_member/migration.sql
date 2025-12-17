/*
  Warnings:

  - You are about to drop the column `email` on the `NewsletterLog` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `NewsletterLog` table. All the data in the column will be lost.
  - Added the required column `recipients` to the `NewsletterLog` table without a default value. This is not possible if the table is not empty.
  - Made the column `memberId` on table `NewsletterLog` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "NewsletterLog_userId_idx";

-- AlterTable
ALTER TABLE "NewsletterLog" DROP COLUMN "email",
DROP COLUMN "userId",
ADD COLUMN     "recipients" JSONB NOT NULL,
ALTER COLUMN "memberId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "NewsletterLog_memberId_idx" ON "NewsletterLog"("memberId");
