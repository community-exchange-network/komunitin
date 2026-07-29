-- CreateTable
CREATE TABLE "SigningKey" (
    "id" UUID NOT NULL,
    "kid" TEXT NOT NULL,
    "jwk" JSONB NOT NULL,
    "retireAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SigningKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SigningKey_kid_key" ON "SigningKey"("kid");

-- CreateIndex
CREATE INDEX "SigningKey_retireAt_idx" ON "SigningKey"("retireAt");

-- CreateIndex
CREATE INDEX "SigningKey_createdAt_idx" ON "SigningKey"("createdAt");
