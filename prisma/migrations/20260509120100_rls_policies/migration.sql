-- RepuBoost — RLS canonical policies (USING + WITH CHECK + FORCE)
-- See DATA_MODEL.md §2.2. CI test (tests/rls/cross-tenant.test.ts) verifies this stays correct.

-- ============================================================
-- memberships: users can only see/affect rows in their org
-- ============================================================
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON memberships
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));

-- ============================================================
-- invitations: tenant-scoped
-- ============================================================
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON invitations
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));

-- ============================================================
-- subscriptions: tenant-scoped (one row per org)
-- ============================================================
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON subscriptions
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));

-- ============================================================
-- audit_log: tenant-scoped on read; INSERT allowed if org_id matches OR actor is admin/system
-- ============================================================
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_read ON audit_log FOR SELECT
  USING (organization_id = (SELECT app.current_org()));

CREATE POLICY tenant_insert ON audit_log FOR INSERT
  WITH CHECK (
    organization_id = (SELECT app.current_org())
    OR actor_type IN ('admin_user', 'system')
  );

-- ============================================================
-- webhook_deliveries: org_id is NULL until we know which tenant; only system role inserts
-- Restrict reads to matching org or NULL (system events)
-- ============================================================
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_read ON webhook_deliveries FOR SELECT
  USING (organization_id IS NULL OR organization_id = (SELECT app.current_org()));

-- INSERT/UPDATE/DELETE intentionally not exposed via tenant role; only the worker (which uses a separate
-- DB connection that bypasses RLS for this table) writes here. Tighten in Phase 0 finalization.

-- ============================================================
-- organizations: special — users see their own org via membership
-- (Postgres can't natively join here in policy, so we filter by id = current_org)
-- ============================================================
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;

CREATE POLICY self_access ON organizations
  USING       (id = (SELECT app.current_org()))
  WITH CHECK  (id = (SELECT app.current_org()));

-- Notes for future migrations:
--  - Every new tenant-scoped table MUST add an RLS policy in the same migration.
--  - CI gate (tests/rls/cross-tenant.test.ts) FAILS the build if a tenant-scoped table lacks a policy.
--  - Use the same canonical USING + WITH CHECK pattern.
--  - Admin reader role (BYPASSRLS) will be created in a Phase-0-finalization migration.
