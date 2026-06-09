-- =========================================================================
-- meeting_requests — chat-widget meeting/appointment requests (ReviewBoost
-- parity). A public website chat visitor asks to book a meeting; the row lands
-- in the operator queue at /support/meetings.
-- =========================================================================
--
-- WRITTEN but NOT executed by the build (no `prisma migrate`). The founder runs
-- it MANUALLY as a deploy step, AFTER the code ships. Mirrors the deploy model
-- of 20260608010000_dashboard_briefing and 20260608000000_hardware_batches.
--
-- TENANT table: org-scoped + RLS + GRANT to app_tenant_user, exactly like every
-- other tenant table. The public capture endpoint inserts via an org-scoped
-- `withTenant` write (the org id comes from the widget's VERIFIED JWT, never raw
-- visitor input); the queue UI reads/updates the rows under RLS.
--
-- Conventions match the existing migrations:
--   * gen_random_uuid() PK (pgcrypto), TIMESTAMPTZ for created_at/updated_at.
--   * RLS policy keys on organization_id = (SELECT app.current_org()).
--   * A new table WITHOUT ENABLE/FORCE RLS + tenant_isolation + GRANT would be
--     invisible under app_tenant_user (reads empty) — so all three are present.
-- =========================================================================

CREATE TABLE IF NOT EXISTS meeting_requests (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  establishment_id   UUID,
  name               TEXT         NOT NULL,
  email              TEXT,
  phone              TEXT,
  message            TEXT,
  preferred_time     TEXT,
  source             TEXT         NOT NULL DEFAULT 'chat',
  status             TEXT         NOT NULL DEFAULT 'new', -- new | contacted | scheduled | declined
  handled_by_user_id UUID,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Queue filtering by status per org.
CREATE INDEX IF NOT EXISTS idx_meeting_requests_org_status
  ON meeting_requests (organization_id, status);
-- Newest-first listing per org.
CREATE INDEX IF NOT EXISTS idx_meeting_requests_org_created
  ON meeting_requests (organization_id, created_at DESC);

ALTER TABLE meeting_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_requests FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON meeting_requests;
CREATE POLICY tenant_isolation ON meeting_requests
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));
GRANT SELECT, INSERT, UPDATE, DELETE ON meeting_requests TO app_tenant_user;
