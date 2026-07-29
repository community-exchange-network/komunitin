-- Enable Row Level Security
ALTER TABLE "Group"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GroupAdminUser" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Member"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MemberUser"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Category"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Post"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User"           ENABLE ROW LEVEL SECURITY;

-- Force Row Level Security for table owners
ALTER TABLE "Group"          FORCE ROW LEVEL SECURITY;
ALTER TABLE "GroupAdminUser" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Member"         FORCE ROW LEVEL SECURITY;
ALTER TABLE "MemberUser"     FORCE ROW LEVEL SECURITY;
ALTER TABLE "Category"       FORCE ROW LEVEL SECURITY;
ALTER TABLE "Post"           FORCE ROW LEVEL SECURITY;
ALTER TABLE "User"           FORCE ROW LEVEL SECURITY;

-- Create row security policies
CREATE POLICY tenant_isolation_policy ON "Group"          USING ("tenantId" = current_setting('app.current_tenant_id', TRUE)::text);
CREATE POLICY tenant_isolation_policy ON "GroupAdminUser" USING ("tenantId" = current_setting('app.current_tenant_id', TRUE)::text);
CREATE POLICY tenant_isolation_policy ON "Member"         USING ("tenantId" = current_setting('app.current_tenant_id', TRUE)::text);
CREATE POLICY tenant_isolation_policy ON "MemberUser"     USING ("tenantId" = current_setting('app.current_tenant_id', TRUE)::text);
CREATE POLICY tenant_isolation_policy ON "Category"       USING ("tenantId" = current_setting('app.current_tenant_id', TRUE)::text);
CREATE POLICY tenant_isolation_policy ON "Post"           USING ("tenantId" = current_setting('app.current_tenant_id', TRUE)::text);

-- "User" is not tenant-scoped. A user is visible only if linked to a member in the current tenant.
CREATE POLICY tenant_isolation_policy ON "User"
  USING (
    EXISTS (
      SELECT 1
      FROM "MemberUser" mu
      WHERE mu."userId" = "User"."id"
        AND mu."tenantId" = current_setting('app.current_tenant_id', TRUE)::text
    )
  );

-- Create policies to bypass RLS
CREATE POLICY bypass_rls_policy ON "Group"          USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
CREATE POLICY bypass_rls_policy ON "GroupAdminUser" USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
CREATE POLICY bypass_rls_policy ON "Member"         USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
CREATE POLICY bypass_rls_policy ON "MemberUser"     USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
CREATE POLICY bypass_rls_policy ON "Category"       USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
CREATE POLICY bypass_rls_policy ON "Post"           USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
CREATE POLICY bypass_rls_policy ON "User"           USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
