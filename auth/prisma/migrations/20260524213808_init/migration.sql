-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserActionToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "targetEmail" TEXT,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserActionToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OidcPayload" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "grantId" TEXT,
    "userCode" TEXT,
    "uid" TEXT,
    "expiresAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OidcPayload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserActionToken_tokenHash_key" ON "UserActionToken"("tokenHash");

-- CreateIndex
CREATE INDEX "UserActionToken_userId_purpose_expiresAt_idx" ON "UserActionToken"("userId", "purpose", "expiresAt");

-- CreateIndex
CREATE INDEX "OidcPayload_expiresAt_idx" ON "OidcPayload"("expiresAt");

-- CreateIndex
CREATE INDEX "OidcPayload_uid_idx" ON "OidcPayload"("uid");

-- CreateIndex
CREATE INDEX "OidcPayload_userCode_idx" ON "OidcPayload"("userCode");

-- CreateIndex
CREATE INDEX "OidcPayload_grantId_idx" ON "OidcPayload"("grantId");

-- AddForeignKey
ALTER TABLE "UserActionToken" ADD CONSTRAINT "UserActionToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
