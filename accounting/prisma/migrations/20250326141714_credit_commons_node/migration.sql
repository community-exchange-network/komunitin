-- CreateTable
CREATE TABLE "CreditCommonsNode" (
    "tenantId" VARCHAR(31) NOT NULL DEFAULT (current_setting('app.current_tenant_id'))::text,
    "peerNodePath" VARCHAR(255) NOT NULL,
    "ourNodePath" VARCHAR(255) NOT NULL,
    "lastHash" VARCHAR(255) NOT NULL,
    "url" VARCHAR(255) NOT NULL,
    "vostroId" TEXT NOT NULL,

    CONSTRAINT "CreditCommonsNode_pkey" PRIMARY KEY ("tenantId","peerNodePath")
);

-- Enable Row Level Security
ALTER TABLE "CreditCommonsNode" ENABLE ROW LEVEL SECURITY;

-- Force Row Level Security for table owners
ALTER TABLE "CreditCommonsNode" FORCE ROW LEVEL SECURITY;

-- Create row security policies
CREATE POLICY tenant_isolation_policy ON "CreditCommonsNode" USING ("tenantId" = current_setting('app.current_tenant_id', TRUE)::text);

-- Create policies to bypass RLS
CREATE POLICY bypass_rls_policy ON "CreditCommonsNode" USING (current_setting('app.bypass_rls', TRUE)::text = 'on');

-- CreateIndex
CREATE UNIQUE INDEX "Account_id_tenantId_key" ON "Account"("id", "tenantId");

-- AddForeignKey
ALTER TABLE "CreditCommonsNode" ADD CONSTRAINT "CreditCommonsNode_vostroId_tenantId_fkey" FOREIGN KEY ("vostroId", "tenantId") REFERENCES "Account"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
