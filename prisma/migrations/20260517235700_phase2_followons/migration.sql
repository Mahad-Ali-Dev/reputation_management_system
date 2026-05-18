-- =========================================================================
-- Phase 2 follow-ons: auto-reply rules, booking emails, bad-review SMS
-- =========================================================================
--
-- This is the schema layer for the six follow-on features:
--   1) Auto-reply rules per listing                — new `auto_reply_rules` table
--   2) Per-listing analytics                       — no schema change (queries only)
--   3) Day-after-checkout email reminder cron      — no schema change (data in review_platform_choices)
--   4) Welcome flow page                           — no schema change (data on establishments)
--   5) Bad-review SMS early-warning                — three cols on establishments
--   6) Booking confirmation emails (Phase 1 wrap)  — two cols on phone_bookings, two on phone_assistants
--
-- All RLS policies match the existing tenant_isolation pattern. New columns
-- have safe defaults so rolling forward without app changes won't break.


-- -------------------------------------------------------------------------
-- 1. PhoneAssistant: owner-notification preferences for booking emails
-- -------------------------------------------------------------------------
-- Defaults are TRUE/null on purpose:
--   - notify_owner_on_booking defaults to true because hosts who connect
--     Cal.com obviously want to know when calls book meetings
--   - notify_owner_email is nullable; null = "use organizations.owner_email"
ALTER TABLE phone_assistants
  ADD COLUMN IF NOT EXISTS notify_owner_on_booking BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notify_owner_email      VARCHAR(320);


-- -------------------------------------------------------------------------
-- 2. PhoneBooking: idempotency markers for the email-send worker
-- -------------------------------------------------------------------------
-- We send two emails per booking (one to the caller, one to the owner) and
-- need to ensure we never double-send. The presence of a non-null timestamp
-- means "this email was sent successfully at this time" — used both for
-- dedup AND for the dashboard's "we emailed Maria at 10:32" detail.
ALTER TABLE phone_bookings
  ADD COLUMN IF NOT EXISTS notified_customer_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notified_owner_at    TIMESTAMPTZ;

-- For the retry-sweep worker that picks up bookings missing one or both
-- notifications. Filtered index keeps it tiny (only pending notifications).
CREATE INDEX IF NOT EXISTS phone_bookings_pending_notify_idx
  ON phone_bookings (created_at)
  WHERE notified_customer_at IS NULL OR notified_owner_at IS NULL;


-- -------------------------------------------------------------------------
-- 3. Establishment: bad-review SMS alert configuration
-- -------------------------------------------------------------------------
-- When a review arrives via inbound email parser and rating <= threshold,
-- we SMS the alert phone. Defaults are intentional: opt-in only (enabled
-- defaults false; hosts who never set alert_sms_phone get no SMS calls).
ALTER TABLE establishments
  ADD COLUMN IF NOT EXISTS alert_sms_enabled    BOOLEAN  NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS alert_sms_phone      VARCHAR(20),   -- E.164 incl. +country code
  ADD COLUMN IF NOT EXISTS alert_sms_min_rating INT      NOT NULL DEFAULT 3;

ALTER TABLE establishments
  DROP CONSTRAINT IF EXISTS establishments_alert_min_rating_chk;
ALTER TABLE establishments
  ADD  CONSTRAINT establishments_alert_min_rating_chk
       CHECK (alert_sms_min_rating BETWEEN 1 AND 5);


-- -------------------------------------------------------------------------
-- 4. auto_reply_rules — per-listing automation engine
-- -------------------------------------------------------------------------
-- Each rule says "when a review matches X, do Y". Rules are evaluated in
-- ingest order; the FIRST matching rule per review wins (so put your
-- specific rules above the broad ones). Match criteria are AND'ed.
--
-- `action`:
--   - 'draft_only'              — generate an AI draft, leave it in pending_review
--   - 'auto_publish_after_delay' — generate + publish after `delay_minutes`
--
-- `delay_minutes` is a soft buffer that lets the host catch a mis-publish.
-- We deliberately don't offer instant auto-publish — too easy to embarrass
-- yourself when the AI misreads a sarcastic review.
CREATE TABLE IF NOT EXISTS auto_reply_rules (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- NULL establishment_id = applies org-wide. Per-listing rules let hosts
  -- with mixed Airbnb + Google footprints tune behavior per property.
  establishment_id   UUID         REFERENCES establishments(id) ON DELETE CASCADE,
  name               VARCHAR(120) NOT NULL,
  enabled            BOOLEAN      NOT NULL DEFAULT TRUE,
  -- Match criteria (all AND'd). NULL/empty = no constraint on that field.
  match_min_rating   INT          NOT NULL DEFAULT 5,
  match_max_rating   INT          NOT NULL DEFAULT 5,
  match_keywords     TEXT[]       NOT NULL DEFAULT '{}',  -- review.body must contain ≥1
  match_sources      VARCHAR(32)[] NOT NULL DEFAULT '{}', -- e.g. {'airbnb','google'}
  -- Action
  action             VARCHAR(32)  NOT NULL DEFAULT 'draft_only',
  delay_minutes      INT          NOT NULL DEFAULT 5,
  reply_tone         VARCHAR(32)  NOT NULL DEFAULT 'warm',
  -- Audit
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  fire_count         INT          NOT NULL DEFAULT 0,
  last_fired_at      TIMESTAMPTZ,
  CONSTRAINT auto_reply_rules_action_chk
    CHECK (action IN ('draft_only', 'auto_publish_after_delay')),
  CONSTRAINT auto_reply_rules_tone_chk
    CHECK (reply_tone IN ('concise', 'warm', 'detailed')),
  CONSTRAINT auto_reply_rules_rating_chk
    CHECK (match_min_rating BETWEEN 1 AND 5
       AND match_max_rating BETWEEN 1 AND 5
       AND match_min_rating <= match_max_rating),
  CONSTRAINT auto_reply_rules_delay_chk
    CHECK (delay_minutes BETWEEN 0 AND 1440)
);

CREATE INDEX IF NOT EXISTS auto_reply_rules_org_enabled_idx
  ON auto_reply_rules (organization_id)
  WHERE enabled = TRUE;

CREATE INDEX IF NOT EXISTS auto_reply_rules_establishment_idx
  ON auto_reply_rules (establishment_id)
  WHERE establishment_id IS NOT NULL;


-- -------------------------------------------------------------------------
-- 5. RLS for auto_reply_rules
-- -------------------------------------------------------------------------
ALTER TABLE auto_reply_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON auto_reply_rules;
CREATE POLICY tenant_isolation ON auto_reply_rules
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));

GRANT SELECT, INSERT, UPDATE, DELETE ON auto_reply_rules TO app_tenant_user;


-- -------------------------------------------------------------------------
-- 6. Schema comments (visible in psql + Prisma docs)
-- -------------------------------------------------------------------------
COMMENT ON COLUMN phone_assistants.notify_owner_on_booking IS
  'When TRUE, send a confirmation email to the owner after a phone-call booking. Default TRUE.';
COMMENT ON COLUMN phone_assistants.notify_owner_email IS
  'Override the owner email for booking notifications. NULL falls back to organizations.owner_email.';
COMMENT ON COLUMN phone_bookings.notified_customer_at IS
  'Set when the customer-facing confirmation email succeeded. Used for idempotency on retry.';
COMMENT ON COLUMN phone_bookings.notified_owner_at IS
  'Set when the owner-facing notification succeeded. Used for idempotency on retry.';
COMMENT ON COLUMN establishments.alert_sms_enabled IS
  'Opt-in flag for bad-review SMS early-warning. FALSE by default.';
COMMENT ON COLUMN establishments.alert_sms_phone IS
  'E.164 phone number to SMS when a review arrives with rating <= alert_sms_min_rating.';
COMMENT ON TABLE auto_reply_rules IS
  'Per-listing rules for auto-drafting (and optionally auto-publishing) AI replies on incoming reviews.';


-- -------------------------------------------------------------------------
-- 7. review_platform_choices: idempotency marker for the day-after cron
-- -------------------------------------------------------------------------
-- The day-after-checkout reminder cron runs hourly and sends one email
-- per opted-in guest, ~24 hours after they tapped the picker. Without
-- this column, a re-run of the cron would re-spam every guest.
ALTER TABLE review_platform_choices
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS review_platform_choices_pending_reminder_idx
  ON review_platform_choices (chosen_at)
  WHERE reminder_sent_at IS NULL AND guest_email IS NOT NULL;

COMMENT ON COLUMN review_platform_choices.reminder_sent_at IS
  'Set when the day-after-checkout reminder email succeeded for this guest. Idempotency marker for the picker-reminder cron.';
