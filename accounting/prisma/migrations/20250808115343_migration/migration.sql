-- CreateTable
CREATE TABLE "Migration" (
    "tenantId" VARCHAR(31) NOT NULL DEFAULT (current_setting('app.current_tenant_id'))::text,
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "code" VARCHAR(255) NOT NULL,
    "status" VARCHAR(31) NOT NULL DEFAULT 'new',
    "kind" VARCHAR(31) NOT NULL,
    "data" JSONB,
    "log" JSONB,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Migration_pkey" PRIMARY KEY ("id")
);

-- Row Level Security
ALTER TABLE "Migration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Migration" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "Migration"    USING ("tenantId" = current_setting('app.current_tenant_id', TRUE)::text);
CREATE POLICY bypass_rls_policy ON "Migration"          USING (current_setting('app.bypass_rls', TRUE)::text = 'on');

