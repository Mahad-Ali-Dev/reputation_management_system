-- =========================================================================
-- dashboard_briefings — per-day cache of the dashboard AI daily briefing
-- =========================================================================
--
-- WRITTEN but NOT executed by the build (no `prisma migrate`). The founder runs
-- it MANUALLY as a deploy step, AFTER the code ships. Mirrors the deploy model
-- of 20260607020000_master_delta and 20260608000000_hardware_batches.
--
-- TENANT table: org-scoped + RLS + GRANT to app_tenant_user, exactly like every
-- other tenant table in the master delta. The dashboard reads the cached row in
-- a `withTenant` transaction (RLS applies); the daily-briefing cron upserts it.
--
-- Conventions match the existing migrations:
--   * gen_random_uuid() PK (pgcrypto), TIMESTAMPTZ for created_at, DATE for day.
--   * RLS policy keys on organization_id = (SELECT app.current_org()).
--   * A new table WITHOUT ENABLE/FORCE RLS + tenant_isolation + GRANT would be
--     invisible under app_tenant_user (reads empty) — so all three are present.
--   * `body` recomputes cheaply, so reads fail-soft to a fresh deterministic
--     compute when this table is absent (42P01) on a not-yet-migrated DB.
-- =========================================================================

CREATE TABLE IF NOT EXISTS dashboard_briefings (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  day              DATE         NOT NULL,
  body             TEXT         NOT NULL,
  model            TEXT,
  signals          JSONB,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- One briefing per org per day (upsert target for the cron).
CREATE UNIQUE INDEX IF NOT EXISTS dashboard_briefings_uniq
  ON dashboard_briefings (organization_id, day);
-- Newest-first lookups per org (the dashboard reads today's row).
CREATE INDEX IF NOT EXISTS idx_dashboard_briefings_org
  ON dashboard_briefings (organization_id, day DESC);

ALTER TABLE dashboard_briefings ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_briefings FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON dashboard_briefings;
CREATE POLICY tenant_isolation ON dashboard_briefings
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));
GRANT SELECT, INSERT, UPDATE, DELETE ON dashboard_briefings TO app_tenant_user;
