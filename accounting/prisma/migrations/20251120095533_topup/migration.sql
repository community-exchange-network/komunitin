-- CreateTable
CREATE TABLE "public"."Topup" (
    "tenantId" VARCHAR(31) NOT NULL DEFAULT (current_setting('app.current_tenant_id'))::text,
    "id" TEXT NOT NULL,
    "status" VARCHAR(31) NOT NULL DEFAULT 'new',
    "depositAmount" BIGINT NOT NULL,
    "depositCurrency" VARCHAR(31) NOT NULL,
    "receiveAmount" BIGINT NOT NULL,
    "meta" JSONB,
    "paymentProvider" VARCHAR(255) NOT NULL,
    "paymentData" JSONB,
    "accountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "transferId" TEXT,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Topup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Topup_tenantId_transferId_key" ON "public"."Topup"("tenantId", "transferId");

-- AddForeignKey
ALTER TABLE "public"."Topup" ADD CONSTRAINT "Topup_tenantId_accountId_fkey" FOREIGN KEY ("tenantId", "accountId") REFERENCES "public"."Account"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;  

-- AddForeignKey
ALTER TABLE "public"."Topup" ADD CONSTRAINT "Topup_tenantId_userId_fkey" FOREIGN KEY ("tenantId", "userId") REFERENCES "public"."User"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Topup" ADD CONSTRAINT "Topup_tenantId_transferId_fkey" FOREIGN KEY ("tenantId", "transferId") REFERENCES "public"."Transfer"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
