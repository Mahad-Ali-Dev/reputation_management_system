-- Day 11 V3 Features:
--   * notifications (in-app bell + dropdown)
--   * email_templates / sms_templates (per-org review-request templates)
--   * faqs (chatbot fallback knowledge)
--   * ai_training_profile (single per-org row with personality + behavior settings)
--   * comment_blacklist (keyword auto-hide)
--   * contacts (cross-channel customer pool)
--   * social_posts (single + bulk post creator queue)
--   * social_comments (per-page public comments inbox)
--   * provider_apps (OAuth client_id/secret per provider per env — admin-set)
--   * chat_automation_rules (greeting/contact/leaving triggers)
--   * live_chat_visitors (real-time visitor tracking)
--   * Notification, FAQ, AiTrainingProfile etc.

-- ============================================================
-- notifications — in-app bell
-- ============================================================
CREATE TABLE notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES users(id) ON DELETE CASCADE,  -- NULL = org-wide
  type            text NOT NULL,             -- new_review | new_comment | reply_needed | dispute_update | system | digest_ready
  title           text NOT NULL,
  body            text,
  resource_type   text,
  resource_id     uuid,
  href            text,                       -- where to send the user on click
  read_at         TIMESTAMP(3),
  created_at      TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user_unread ON notifications(organization_id, user_id, read_at, created_at DESC);
CREATE INDEX idx_notifications_org_recent ON notifications(organization_id, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON notifications
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));


-- ============================================================
-- email_templates + sms_templates — per-org review-request templates
-- ============================================================
CREATE TABLE outreach_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  establishment_id uuid REFERENCES establishments(id) ON DELETE CASCADE,
  channel         text NOT NULL,             -- email | sms
  name            text NOT NULL,
  subject         text,                       -- email only
  body            text NOT NULL,              -- supports {{customerName}} {{businessName}} {{reviewLink}}
  body_html       text,                       -- email only
  logo_url        text,
  background_color text,
  is_default      boolean NOT NULL DEFAULT false,
  is_ai_generated boolean NOT NULL DEFAULT false,
  ai_tone         text,                       -- friendly | formal | brief | warm
  created_at      TIMESTAMP(3) NOT NULL DEFAULT now(),
  updated_at      TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT outreach_templates_channel_chk CHECK (channel IN ('email','sms'))
);
CREATE INDEX idx_outreach_templates_org ON outreach_templates(organization_id, channel);

ALTER TABLE outreach_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_templates FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON outreach_templates
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));


-- ============================================================
-- faqs — chatbot fallback knowledge
-- ============================================================
CREATE TABLE faqs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  establishment_id uuid REFERENCES establishments(id) ON DELETE CASCADE,
  title           text NOT NULL,
  description     text NOT NULL,
  position        integer NOT NULL DEFAULT 0,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      TIMESTAMP(3) NOT NULL DEFAULT now(),
  updated_at      TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX idx_faqs_org ON faqs(organization_id, is_active, position);

ALTER TABLE faqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE faqs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON faqs
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));


-- ============================================================
-- ai_training_profiles — one per org: personality, behavior, hours, pricing
-- ============================================================
CREATE TABLE ai_training_profiles (
  organization_id      uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  business_overview    text,
  services_products    text,
  operating_hours      jsonb,                     -- {monday: {open:"09:00", close:"17:00"}, ...}
  pricing_details      text,
  ai_personality_style text DEFAULT 'friendly',   -- friendly | professional | playful | concise
  customer_inquiry_style text DEFAULT 'warm_intro_quick_qualification',
  booking_style        text DEFAULT 'propose_time_slots',
  complaint_style      text DEFAULT 'apologize_propose_fix',
  support_style        text DEFAULT 'check_in_after_purchase',
  custom_prompt        text,                      -- 250-3000 chars of freeform training
  satisfaction_avg     decimal(3,2),              -- last 30 days, updated by worker
  unsure_topics        text[],                    -- topics flagged as low-confidence
  confident_topics     text[],
  updated_at           TIMESTAMP(3) NOT NULL DEFAULT now()
);

ALTER TABLE ai_training_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_training_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ai_training_profiles
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));


-- ============================================================
-- comment_blacklist — keywords that auto-hide matching comments
-- ============================================================
CREATE TABLE comment_blacklists (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  keyword         text NOT NULL,
  match_mode      text NOT NULL DEFAULT 'contains',   -- contains | exact | regex
  is_active       boolean NOT NULL DEFAULT true,
  hidden_count    integer NOT NULL DEFAULT 0,
  created_at      TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT comment_blacklists_match_chk CHECK (match_mode IN ('contains','exact','regex')),
  CONSTRAINT comment_blacklists_uniq UNIQUE (organization_id, keyword)
);
CREATE INDEX idx_comment_blacklist_org ON comment_blacklists(organization_id, is_active);

ALTER TABLE comment_blacklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_blacklists FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON comment_blacklists
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));


-- ============================================================
-- contacts — cross-channel customer pool
-- ============================================================
CREATE TABLE contacts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  establishment_id uuid REFERENCES establishments(id) ON DELETE CASCADE,
  source          text NOT NULL,                  -- manual | csv | shopify | hubspot | quickbooks | etc.
  external_id     text,                            -- ID in the source system
  name            text,
  email           text,
  phone           text,                            -- E.164
  tags            text[],
  metadata        jsonb,
  last_contacted_at TIMESTAMP(3),
  created_at      TIMESTAMP(3) NOT NULL DEFAULT now(),
  updated_at      TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX idx_contacts_org_recent ON contacts(organization_id, created_at DESC);
CREATE INDEX idx_contacts_email ON contacts(organization_id, email) WHERE email IS NOT NULL;
CREATE INDEX idx_contacts_phone ON contacts(organization_id, phone) WHERE phone IS NOT NULL;

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON contacts
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));


-- ============================================================
-- social_posts — outbound posts to social platforms
-- ============================================================
CREATE TABLE social_posts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  establishment_id uuid REFERENCES establishments(id) ON DELETE CASCADE,
  platforms       text[] NOT NULL,                 -- ['facebook','instagram','twitter','linkedin']
  caption         text,
  hashtags        text[],
  media_url       text,                             -- public URL of uploaded image/video
  media_type      text,                             -- image | video | reel
  scheduled_for   TIMESTAMP(3),
  posted_at       TIMESTAMP(3),
  status          text NOT NULL DEFAULT 'draft',    -- draft | scheduled | posted | failed
  external_ids    jsonb,                            -- {facebook: 'post_id', instagram: '...'}
  error           text,
  is_ai_caption   boolean NOT NULL DEFAULT false,
  bulk_batch_id   uuid,
  created_at      TIMESTAMP(3) NOT NULL DEFAULT now(),
  updated_at      TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX idx_social_posts_org_status ON social_posts(organization_id, status, scheduled_for);

ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_posts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON social_posts
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));


-- ============================================================
-- social_comments — incoming public comments to moderate
-- ============================================================
CREATE TABLE social_comments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  establishment_id  uuid REFERENCES establishments(id) ON DELETE CASCADE,
  platform          text NOT NULL,                  -- facebook | instagram | google_qa
  external_post_id  text,                            -- the post the comment is on
  external_id       text NOT NULL,                   -- the comment ID
  author_name       text,
  author_avatar_url text,
  body              text NOT NULL,
  status            text NOT NULL DEFAULT 'needs_reply',  -- needs_reply | replied | hidden | live | starred
  ai_suggested      text,
  assigned_to       uuid REFERENCES users(id) ON DELETE SET NULL,
  posted_at         TIMESTAMP(3) NOT NULL,
  responded_at      TIMESTAMP(3),
  created_at        TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT social_comments_external_uniq UNIQUE (platform, external_id),
  CONSTRAINT social_comments_status_chk CHECK (status IN ('needs_reply','replied','hidden','live','starred'))
);
CREATE INDEX idx_social_comments_org_status ON social_comments(organization_id, status, posted_at DESC);

ALTER TABLE social_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_comments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON social_comments
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));


-- ============================================================
-- provider_apps — admin-set OAuth credentials per provider
-- ============================================================
-- This is a GLOBAL table (no org scope) because the dev app credentials are
-- shared across all tenants. Each tenant authorizes against the same app.
-- Admin role manages this table; tenants only see "connect" status.
CREATE TABLE provider_apps (
  provider          text PRIMARY KEY,             -- google_business | facebook | instagram | twitter | linkedin | hubspot | salesforce | shopify | woocommerce | quickbooks | xero | mailchimp | klaviyo | ...
  display_name      text NOT NULL,
  category          text NOT NULL,                -- social | crm | ecommerce | pos | accounting | email_marketing | live_chat
  client_id         text,
  client_secret_ct  bytea,                        -- envelope-encrypted via lib/crypto/envelope.ts
  client_secret_iv  bytea,
  client_secret_aad jsonb,
  scopes            text[],
  oauth_url         text,                         -- authorize URL template
  token_url         text,
  redirect_path     text NOT NULL,                -- /api/connections/[provider]/callback
  webhook_secret    text,
  status            text NOT NULL DEFAULT 'unconfigured',  -- unconfigured | configured | disabled
  metadata          jsonb,
  updated_at        TIMESTAMP(3) NOT NULL DEFAULT now()
);
-- No RLS — admin-only via service connection. Web app reads via prisma directly without
-- SET LOCAL ROLE so neondb_owner BYPASSRLS handles it.


-- ============================================================
-- chat_automation_rules — Greeting / Ask Contact / Leaving automations
-- ============================================================
CREATE TABLE chat_automation_rules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rule_key        text NOT NULL,                  -- greeting | ask_contact | leaving | custom
  name            text NOT NULL,
  message         text NOT NULL,
  trigger         text NOT NULL,                  -- on_open | after_seconds | on_inactivity | on_leave_intent
  delay_seconds   integer NOT NULL DEFAULT 0,
  is_active       boolean NOT NULL DEFAULT false,
  created_at      TIMESTAMP(3) NOT NULL DEFAULT now(),
  updated_at      TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT chat_automation_rules_uniq UNIQUE (organization_id, rule_key)
);

ALTER TABLE chat_automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_automation_rules FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chat_automation_rules
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));


-- ============================================================
-- live_chat_visitors — real-time tracking of chatbot widget visitors
-- ============================================================
CREATE TABLE live_chat_visitors (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  visitor_id      text NOT NULL,                  -- from widget JWT
  conversation_id uuid REFERENCES ai_conversations(id) ON DELETE SET NULL,
  display_name    text,
  email           text,
  phone           text,
  country         text,
  region          text,
  city            text,
  ip_inet         inet,
  user_agent      text,
  current_url     text,
  last_activity_at TIMESTAMP(3) NOT NULL DEFAULT now(),
  satisfaction    integer,                        -- 1-5 post-chat survey
  tags            text[],
  first_seen_at   TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT live_chat_visitors_uniq UNIQUE (organization_id, visitor_id)
);
CREATE INDEX idx_live_chat_visitors_recent ON live_chat_visitors(organization_id, last_activity_at DESC);

ALTER TABLE live_chat_visitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_chat_visitors FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON live_chat_visitors
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));


-- ============================================================
-- Reviews: add metadata for ReviewsCounter and inline UI
-- (no schema change needed — we already have scan_count on devices,
--  and review_replies for AI drafts. Just adding indexes for live feed.)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_reviews_org_recent_for_feed
  ON reviews(organization_id, posted_at DESC);

-- Establishments: image_url for the dashboard cards
ALTER TABLE establishments
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS website_url text,
  ADD COLUMN IF NOT EXISTS phone text;

-- Organizations: enriched profile for Account Settings
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS owner_name text,
  ADD COLUMN IF NOT EXISTS owner_email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS website_url text,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS business_description text;


-- ============================================================
-- GRANTS for app_tenant_user role
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON notifications              TO app_tenant_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON outreach_templates         TO app_tenant_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON faqs                       TO app_tenant_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_training_profiles       TO app_tenant_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON comment_blacklists         TO app_tenant_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON contacts                   TO app_tenant_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON social_posts               TO app_tenant_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON social_comments            TO app_tenant_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON chat_automation_rules      TO app_tenant_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON live_chat_visitors         TO app_tenant_user;
-- provider_apps stays admin-only (no grant to app_tenant_user)
