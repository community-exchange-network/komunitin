/*
  Warnings:

  - A unique constraint covering the columns `[disabledAccountsPoolKeyId]` on the table `Currency` will be added. If there are existing duplicate values, this will fail.

*/

-- AlterTable
ALTER TABLE "Currency" ADD COLUMN     "disabledAccountsPoolKeyId" VARCHAR(255);

-- CreateIndex
CREATE UNIQUE INDEX "Currency_disabledAccountsPoolKeyId_key" ON "Currency"("disabledAccountsPoolKeyId");

-- AddForeignKey
ALTER TABLE "Currency" ADD CONSTRAINT "Currency_disabledAccountsPoolKeyId_fkey" FOREIGN KEY ("disabledAccountsPoolKeyId") REFERENCES "EncryptedSecret"("id") ON DELETE SET NULL ON UPDATE CASCADE;
