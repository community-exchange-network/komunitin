-- CreateIndex
CREATE INDEX "Transfer_payerId_idx" ON "public"."Transfer"("payerId");

-- CreateIndex
CREATE INDEX "Transfer_payeeId_idx" ON "public"."Transfer"("payeeId");

-- CreateIndex
CREATE INDEX "Transfer_tenantId_updated_idx" ON "public"."Transfer"("tenantId", "updated");
