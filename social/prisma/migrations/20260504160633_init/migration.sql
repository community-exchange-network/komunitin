-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" VARCHAR(255),
    "settings" JSONB,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "tenantId" VARCHAR(31) NOT NULL DEFAULT (current_setting('app.current_tenant_id', true))::text,
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" VARCHAR(31) NOT NULL DEFAULT 'pending',
    "access" VARCHAR(31) NOT NULL DEFAULT 'public',
    "image" JSONB,
    "address" JSONB,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "contacts" JSONB,
    "settings" JSONB,
    "meta" JSONB,
    "currencyId" TEXT,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,
    "deleted" TIMESTAMP(3),

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupAdminUser" (
    "tenantId" VARCHAR(31) NOT NULL DEFAULT (current_setting('app.current_tenant_id', true))::text,
    "groupId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" VARCHAR(31) NOT NULL DEFAULT 'admin',

    CONSTRAINT "GroupAdminUser_pkey" PRIMARY KEY ("groupId","userId")
);

-- CreateTable
CREATE TABLE "Member" (
    "tenantId" VARCHAR(31) NOT NULL DEFAULT (current_setting('app.current_tenant_id', true))::text,
    "id" UUID NOT NULL,
    "code" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "type" VARCHAR(31) NOT NULL DEFAULT 'personal',
    "status" VARCHAR(31) NOT NULL DEFAULT 'draft',
    "access" VARCHAR(31) NOT NULL DEFAULT 'public',
    "description" TEXT NOT NULL DEFAULT '',
    "image" JSONB,
    "address" JSONB,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "contacts" JSONB,
    "meta" JSONB,
    "accountId" UUID,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,
    "deleted" TIMESTAMP(3),
    "groupId" UUID NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberUser" (
    "tenantId" VARCHAR(31) NOT NULL DEFAULT (current_setting('app.current_tenant_id', true))::text,
    "memberId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" VARCHAR(31) NOT NULL DEFAULT 'admin',

    CONSTRAINT "MemberUser_pkey" PRIMARY KEY ("memberId","userId")
);

-- CreateTable
CREATE TABLE "Category" (
    "tenantId" VARCHAR(31) NOT NULL DEFAULT (current_setting('app.current_tenant_id', true))::text,
    "id" UUID NOT NULL,
    "code" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "access" VARCHAR(31) NOT NULL DEFAULT 'public',
    "icon" JSONB,
    "meta" JSONB,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,
    "groupId" UUID NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "tenantId" VARCHAR(31) NOT NULL DEFAULT (current_setting('app.current_tenant_id', true))::text,
    "id" UUID NOT NULL,
    "type" VARCHAR(31) NOT NULL,
    "code" VARCHAR(255) NOT NULL,
    "title" VARCHAR(255),
    "description" TEXT NOT NULL DEFAULT '',
    "images" JSONB,
    "value" VARCHAR(255),
    "status" VARCHAR(31) NOT NULL DEFAULT 'draft',
    "access" VARCHAR(31) NOT NULL DEFAULT 'public',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "expires" TIMESTAMP(3) NOT NULL,
    "deleted" TIMESTAMP(3),
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,
    "memberId" UUID NOT NULL,
    "categoryId" UUID,
    "groupId" UUID NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Group_tenantId_key" ON "Group"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Group_id_tenantId_key" ON "Group"("id", "tenantId");

-- CreateIndex
CREATE INDEX "GroupAdminUser_tenantId_userId_idx" ON "GroupAdminUser"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "Member_tenantId_groupId_status_idx" ON "Member"("tenantId", "groupId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Member_tenantId_code_key" ON "Member"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Member_id_tenantId_key" ON "Member"("id", "tenantId");

-- CreateIndex
CREATE INDEX "MemberUser_tenantId_userId_idx" ON "MemberUser"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "Category_tenantId_groupId_idx" ON "Category"("tenantId", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_tenantId_code_key" ON "Category"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Category_id_tenantId_key" ON "Category"("id", "tenantId");

-- CreateIndex
CREATE INDEX "Post_tenantId_type_categoryId_idx" ON "Post"("tenantId", "type", "categoryId");

-- CreateIndex
CREATE INDEX "Post_tenantId_memberId_idx" ON "Post"("tenantId", "memberId");

-- CreateIndex
CREATE INDEX "Post_tenantId_status_idx" ON "Post"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Post_tenantId_expires_idx" ON "Post"("tenantId", "expires");

-- CreateIndex
CREATE INDEX "Post_tenantId_updated_idx" ON "Post"("tenantId", "updated");

-- CreateIndex
CREATE UNIQUE INDEX "Post_tenantId_code_key" ON "Post"("tenantId", "code");

-- AddForeignKey
ALTER TABLE "GroupAdminUser" ADD CONSTRAINT "GroupAdminUser_groupId_tenantId_fkey" FOREIGN KEY ("groupId", "tenantId") REFERENCES "Group"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupAdminUser" ADD CONSTRAINT "GroupAdminUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_groupId_tenantId_fkey" FOREIGN KEY ("groupId", "tenantId") REFERENCES "Group"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberUser" ADD CONSTRAINT "MemberUser_memberId_tenantId_fkey" FOREIGN KEY ("memberId", "tenantId") REFERENCES "Member"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberUser" ADD CONSTRAINT "MemberUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_groupId_tenantId_fkey" FOREIGN KEY ("groupId", "tenantId") REFERENCES "Group"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_memberId_tenantId_fkey" FOREIGN KEY ("memberId", "tenantId") REFERENCES "Member"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_categoryId_tenantId_fkey" FOREIGN KEY ("categoryId", "tenantId") REFERENCES "Category"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_groupId_tenantId_fkey" FOREIGN KEY ("groupId", "tenantId") REFERENCES "Group"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
