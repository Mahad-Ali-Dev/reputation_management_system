-- RepuBoost — non-bypass tenant role.
-- Neon's neondb_owner has BYPASSRLS by default, which silently disables every RLS policy.
-- We create a tenant role that does NOT bypass RLS, and `withTenant()` switches into it via
-- SET LOCAL ROLE for the duration of each tenant transaction.
--
-- Auth.js bootstrap code (createUser → org + membership) continues to run as the owner role,
-- which is correct: that path needs to create cross-tenant baseline rows.

-- ============================================================
-- Create the role (NOBYPASSRLS so policies actually apply)
-- ============================================================
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_tenant_user') THEN
    CREATE ROLE app_tenant_user NOLOGIN NOBYPASSRLS;
  END IF;
END
$do$;

-- The session role (neondb_owner) must be a member of app_tenant_user for SET LOCAL ROLE to work
-- without superuser privileges.
GRANT app_tenant_user TO neondb_owner;

-- ============================================================
-- Grants: app_tenant_user needs CRUD on tenant tables to do its job
-- ============================================================
GRANT USAGE ON SCHEMA public TO app_tenant_user;
GRANT USAGE ON SCHEMA app TO app_tenant_user;
GRANT EXECUTE ON FUNCTION app.current_org() TO app_tenant_user;

-- Tenant tables (Day 1 scope — extend in later migrations)
GRANT SELECT, INSERT, UPDATE, DELETE ON
  organizations,
  memberships,
  invitations,
  subscriptions,
  audit_log,
  webhook_deliveries,
  oauth_state_consumed
TO app_tenant_user;

-- Sequences (UUID defaults don't need sequences, but future SERIAL columns will)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_tenant_user;

-- Default privileges for future tables (Day 2+)
-- Important: this only applies to objects created by neondb_owner. We create migrations as
-- neondb_owner, so this covers our case.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_tenant_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_tenant_user;
