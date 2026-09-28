CREATE TABLE "File" (
  "tenantId" VARCHAR(31) NOT NULL DEFAULT (current_setting('app.current_tenant_id', true))::text,
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "mime" VARCHAR(255) NOT NULL,
  "key" VARCHAR(1024) NOT NULL,
  "url" VARCHAR(2048) NOT NULL,
  "filename" VARCHAR(255) NOT NULL,
  "size" INTEGER NOT NULL,
  "uploaderId" UUID NOT NULL,
  "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resourceType" VARCHAR(31),
  "resourceId" UUID,

  CONSTRAINT "File_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "File_id_tenantId_key" ON "File"("id", "tenantId");
CREATE INDEX "File_tenantId_resourceType_resourceId_idx" ON "File"("tenantId", "resourceType", "resourceId");
CREATE INDEX "File_tenantId_uploaderId_idx" ON "File"("tenantId", "uploaderId");
CREATE INDEX "File_tenantId_url_idx" ON "File"("tenantId", "url");

ALTER TABLE "File"
  ADD CONSTRAINT "File_uploaderId_fkey"
  FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "File" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "File" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "File"
  USING ("tenantId" = current_setting('app.current_tenant_id', TRUE)::text);

CREATE POLICY bypass_rls_policy ON "File"
  USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
