-- V7 hardening pass: missing indexes + plan constraint update.
-- ============================================================

-- Add 'past_due' to the org plan constraint so the Stripe webhook can mark
-- orgs whose invoice failed without being rejected by the CHECK.
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_plan_chk;
ALTER TABLE organizations
  ADD CONSTRAINT organizations_plan_chk
  CHECK (plan IN ('trial','pro','suspended','free','past_due'));

-- Missing indexes uncovered by the V7 query audit:

-- phone_campaign_targets: queries by org for the campaigns dashboard hit a
-- seq scan because the only existing indexes are (status, scheduled_for)
-- and (campaign_id, status). Add an org-scoped lookup.
CREATE INDEX IF NOT EXISTS idx_phone_campaign_targets_org
  ON phone_campaign_targets(organization_id, status, scheduled_for DESC);

-- phone_bookings.call_id: we look up the booking attached to a given call in
-- the post-call summary path. Without an index this is a seq scan.
CREATE INDEX IF NOT EXISTS idx_phone_bookings_call
  ON phone_bookings(call_id) WHERE call_id IS NOT NULL;

-- social_comments.assigned_to: the "comments assigned to me" filter on the
-- inbox falls back to seq scan otherwise.
CREATE INDEX IF NOT EXISTS idx_social_comments_assigned
  ON social_comments(organization_id, assigned_to, status)
  WHERE assigned_to IS NOT NULL;

-- ============================================================
-- digest_runs — daily-digest idempotency
-- ============================================================
-- Prevents sending the same daily digest twice if the cron is invoked
-- multiple times in a window or QStash retries after a network blip.
-- Unique (organization_id, day) means a 2nd insert returns conflict and
-- the worker can bail without re-sending emails.

CREATE TABLE IF NOT EXISTS digest_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  day             date NOT NULL,
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  recipients_sent integer NOT NULL DEFAULT 0,
  recipients_failed integer NOT NULL DEFAULT 0,
  error_summary   text,
  CONSTRAINT digest_runs_uniq UNIQUE (organization_id, day)
);

CREATE INDEX IF NOT EXISTS idx_digest_runs_org ON digest_runs(organization_id, day DESC);

-- digest_runs is system-scoped (cron-only), so we don't enable RLS. Access is
-- exclusively through the cron worker which runs as the owner role.
GRANT SELECT, INSERT, UPDATE ON digest_runs TO app_tenant_user;
