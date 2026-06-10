-- =========================================================================
-- onboarding_runs — agentic onboarding orchestrator runs.
-- =========================================================================
--
-- WRITTEN but NOT executed by the build (no `prisma migrate`). The founder runs
-- it MANUALLY as a deploy step, AFTER the code ships. Mirrors the deploy model
-- of 20260609000000_meeting_requests and the other Wave-0 deltas.
--
-- The orchestrator (business name + website → auto-built dashboard) is a chained
-- step-machine on top of `scheduled_jobs` (kind="onboarding_step"). One row per
-- run tracks progress so `/onboarding` can poll `GET /api/onboarding/status`.
--
-- TENANT table: org-scoped + RLS + GRANT to app_tenant_user, exactly like every
-- other tenant table. The orchestrator writes/reads under `withTenant`; the
-- status route + page read under RLS.
--
-- Conventions match the existing migrations:
--   * gen_random_uuid() PK (pgcrypto), TIMESTAMPTZ for created_at/updated_at.
--   * RLS policy keys on organization_id = (SELECT app.current_org()).
--   * A new table WITHOUT ENABLE/FORCE RLS + tenant_isolation + GRANT would be
--     invisible under app_tenant_user (reads empty) — so all three are present.
--   * IDEMPOTENCY: a PARTIAL UNIQUE index enforces at most ONE active run per
--     org (status in 'running','needs_user'). Prisma can't express a partial
--     unique, so it lives here in the SQL only.
-- =========================================================================

CREATE TABLE IF NOT EXISTS onboarding_runs (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status               TEXT         NOT NULL DEFAULT 'running', -- running | needs_user | done | failed
  website_url          TEXT,
  business_name        TEXT,
  current_step         INTEGER      NOT NULL DEFAULT 0,
  steps                JSONB        NOT NULL DEFAULT '[]'::jsonb,
  created_by_user_id   UUID,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Status filtering + newest-first listing per org.
CREATE INDEX IF NOT EXISTS idx_onboarding_runs_org_status
  ON onboarding_runs (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_onboarding_runs_org_created
  ON onboarding_runs (organization_id, created_at DESC);

-- One ACTIVE run per org (idempotency anchor): a partial unique index over
-- organization_id WHERE the run is still in flight. A second startOnboarding for
-- the same org resolves to the existing active run instead of inserting a dupe.
CREATE UNIQUE INDEX IF NOT EXISTS uq_onboarding_runs_active_per_org
  ON onboarding_runs (organization_id)
  WHERE status IN ('running', 'needs_user');

ALTER TABLE onboarding_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_runs FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON onboarding_runs;
CREATE POLICY tenant_isolation ON onboarding_runs
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));
GRANT SELECT, INSERT, UPDATE, DELETE ON onboarding_runs TO app_tenant_user;
