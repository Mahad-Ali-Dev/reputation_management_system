-- =========================================================================
-- Phase 2: Airbnb review management + multi-platform QR + welcome flow
-- =========================================================================
--
-- This migration is deliberately split into independent ALTER blocks so a
-- partial failure (one new index conflicting, etc.) doesn't leave the schema
-- half-done. Each block is idempotent where possible.
--
-- Schema model: we treat Airbnb as a `kind` of Establishment, not a new
-- entity. Reason: every host management feature we already have (reviews
-- inbox, AI replies, brand voice training, analytics) is keyed on
-- establishment_id. Polymorphic-by-kind keeps all that working unchanged.
--
-- Audience for this migration: ops at deploy time. Run via
-- `pnpm db:migrate:deploy` which is what scripts/deploy.sh calls.
-- =========================================================================


-- -------------------------------------------------------------------------
-- 1. Establishments: extend to support Airbnb / Booking.com listings
-- -------------------------------------------------------------------------
-- `kind` distinguishes a brick-and-mortar business (default) from an Airbnb
-- listing or a Booking.com listing. Affects which onboarding wizard runs
-- and which CTAs surface in the UI.
ALTER TABLE establishments
  ADD COLUMN IF NOT EXISTS kind                  VARCHAR(32)  NOT NULL DEFAULT 'business',
  ADD COLUMN IF NOT EXISTS airbnb_listing_id     VARCHAR(64),
  ADD COLUMN IF NOT EXISTS airbnb_listing_url    VARCHAR(500),
  ADD COLUMN IF NOT EXISTS bookingcom_listing_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS direct_booking_url    VARCHAR(500),
  ADD COLUMN IF NOT EXISTS house_rules           TEXT,
  ADD COLUMN IF NOT EXISTS wifi_ssid             VARCHAR(128),
  ADD COLUMN IF NOT EXISTS wifi_password_ct      BYTEA,    -- AES-256-GCM ciphertext
  ADD COLUMN IF NOT EXISTS wifi_password_iv      BYTEA,    -- 12-byte IV
  ADD COLUMN IF NOT EXISTS local_recommendations JSONB     DEFAULT '[]'::jsonb;

-- Enforce the kind enum at the DB level — defense in depth alongside Zod.
-- Use a CHECK constraint not an enum type: easier to add new values later
-- (Postgres enum extension requires ALTER TYPE + transaction gymnastics).
ALTER TABLE establishments
  DROP CONSTRAINT IF EXISTS establishments_kind_chk;
ALTER TABLE establishments
  ADD  CONSTRAINT establishments_kind_chk
       CHECK (kind IN ('business', 'airbnb_listing', 'booking_listing'));

-- Quick lookup by external listing id (for inbound email routing).
CREATE INDEX IF NOT EXISTS establishments_airbnb_listing_id_idx
  ON establishments (airbnb_listing_id) WHERE airbnb_listing_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS establishments_bookingcom_listing_id_idx
  ON establishments (bookingcom_listing_id) WHERE bookingcom_listing_id IS NOT NULL;


-- -------------------------------------------------------------------------
-- 2. Devices: kind = 'multi_platform' for the picker-page QR
-- -------------------------------------------------------------------------
-- A multi_platform device renders the picker page at /r/{slug} instead of
-- 302-ing straight to the redirect_url. The picker shows Airbnb / Google /
-- TripAdvisor / Booking.com buttons sourced from the establishment.
--
-- product_kind was always reserved on the column comment; we materialize it
-- here. 'qr' = classic QR plaque, 'nfc' = NFC tag, 'wifi' = WiFi NFC card,
-- 'multi_platform' = multi-platform picker QR. Behavior is per-kind.
ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS product_kind VARCHAR(32) NOT NULL DEFAULT 'qr';

ALTER TABLE devices
  DROP CONSTRAINT IF EXISTS devices_product_kind_chk;
ALTER TABLE devices
  ADD  CONSTRAINT devices_product_kind_chk
       CHECK (product_kind IN ('qr', 'nfc', 'wifi', 'multi_platform'));


-- -------------------------------------------------------------------------
-- 3. inbound_emails: raw forwarded emails (Airbnb today, Booking.com later)
-- -------------------------------------------------------------------------
-- Parse-once, store-raw. If our parser fails (Airbnb changes their email
-- template), we keep the raw HTML/text so we can re-parse later without
-- asking the host to re-forward.
--
-- organization_id is nullable because we route on the TO address — at insert
-- time we may not yet have resolved which org the inbound belongs to. Set
-- on resolution, then RLS kicks in.
CREATE TABLE IF NOT EXISTS inbound_emails (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID         REFERENCES organizations(id) ON DELETE CASCADE,
  source            VARCHAR(32)  NOT NULL DEFAULT 'airbnb',
  to_address        VARCHAR(320) NOT NULL,
  from_address      VARCHAR(320) NOT NULL,
  subject           TEXT,
  html_body         TEXT,
  text_body         TEXT,
  parsed_at         TIMESTAMPTZ,
  parsed_review_id  UUID         REFERENCES reviews(id) ON DELETE SET NULL,
  parse_error       TEXT,
  received_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  -- Provider-supplied unique id for dedup (Resend gives us message_id).
  provider_message_id VARCHAR(255) UNIQUE,
  CONSTRAINT inbound_emails_source_chk CHECK (source IN ('airbnb', 'booking_com'))
);

CREATE INDEX IF NOT EXISTS inbound_emails_org_received_idx
  ON inbound_emails (organization_id, received_at DESC);

-- Find emails that still need parsing — used by the retry sweep cron.
CREATE INDEX IF NOT EXISTS inbound_emails_unparsed_idx
  ON inbound_emails (received_at)
  WHERE parsed_at IS NULL;


-- -------------------------------------------------------------------------
-- 4. review_platform_choices: which platform a guest chose on the picker
-- -------------------------------------------------------------------------
-- Powers the multi-channel attribution dashboard: "47 of 89 Airbnb reviews
-- this month came from our QR ask."
--
-- guest_email is collected on the picker form when the guest opts into the
-- day-after-checkout reminder. NULL when they just clicked through anonymously.
CREATE TABLE IF NOT EXISTS review_platform_choices (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  device_id          UUID         NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  establishment_id   UUID         NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  platform           VARCHAR(32)  NOT NULL,
  guest_email        VARCHAR(320),
  reservation_hint   VARCHAR(32),       -- e.g., last-4 of Airbnb confirmation code
  ip                 INET,
  user_agent         TEXT,
  chosen_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT review_platform_choices_platform_chk
    CHECK (platform IN ('google', 'airbnb', 'tripadvisor', 'booking_com', 'direct'))
);

CREATE INDEX IF NOT EXISTS review_platform_choices_establishment_idx
  ON review_platform_choices (establishment_id, chosen_at DESC);

CREATE INDEX IF NOT EXISTS review_platform_choices_org_chosen_idx
  ON review_platform_choices (organization_id, chosen_at DESC);


-- -------------------------------------------------------------------------
-- 5. RLS policies for the new tables
-- -------------------------------------------------------------------------
-- Match the existing pattern from prisma/migrations/.../rls_policies — every
-- tenant-scoped table has tenant_isolation policy keyed on
-- app.current_org(). The tenant role inherits this; the privileged backend
-- role can bypass for cross-org operations (admin actions, the inbound
-- email worker).

ALTER TABLE inbound_emails           ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_platform_choices  ENABLE ROW LEVEL SECURITY;

-- inbound_emails: tenants can READ their own org's emails, but can't INSERT
-- (the webhook worker uses the privileged role to insert). This stops a
-- compromised tenant from injecting fake reviews via fake inbound emails.
DROP POLICY IF EXISTS tenant_isolation ON inbound_emails;
CREATE POLICY tenant_read ON inbound_emails FOR SELECT
  USING (organization_id = (SELECT app.current_org()));

-- review_platform_choices: tenants can read their own; the picker page
-- inserts via the public API which uses a separate non-tenant role.
DROP POLICY IF EXISTS tenant_isolation ON review_platform_choices;
CREATE POLICY tenant_isolation ON review_platform_choices
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));

-- Grant tenant-role read access to both new tables.
GRANT SELECT ON inbound_emails          TO app_tenant_user;
GRANT SELECT ON review_platform_choices TO app_tenant_user;
GRANT INSERT, UPDATE, DELETE ON review_platform_choices TO app_tenant_user;

-- The privileged role (DATABASE_URL, not tenant role) needs full access for
-- the webhook worker and admin tooling. Default role already has full
-- access since it owns the schema; no GRANT needed.


-- -------------------------------------------------------------------------
-- 6. Helpful comments on the schema (visible in psql \d+ and Prisma docs)
-- -------------------------------------------------------------------------
COMMENT ON COLUMN establishments.kind IS
  'Polymorphic kind: business (default) | airbnb_listing | booking_listing. Affects onboarding flow and UI surfaces.';
COMMENT ON COLUMN establishments.wifi_password_ct IS
  'AES-256-GCM ciphertext of WiFi password. NEVER store plaintext. Decrypt only at NFC programming time.';
COMMENT ON COLUMN devices.product_kind IS
  'Physical product kind: qr | nfc | wifi | multi_platform. Affects /r/{slug} behavior.';
COMMENT ON TABLE inbound_emails IS
  'Raw forwarded emails (Airbnb review notifications etc.) before parsing. Parse-once-store-raw pattern.';
COMMENT ON TABLE review_platform_choices IS
  'Guest picker choices: which platform they tapped at checkout. Powers multi-channel attribution.';
