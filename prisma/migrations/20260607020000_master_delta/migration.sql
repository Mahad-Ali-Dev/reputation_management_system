-- =========================================================================
-- MASTER DELTA — repulabs build (Wave 0, single owner)
-- =========================================================================
--
-- This is the ONE schema migration for the entire repulabs build. It is
-- WRITTEN during Wave 0 but **NOT executed** by the build (no `prisma migrate`).
-- The founder runs it MANUALLY as a separate deploy step, AFTER the code ships.
--
-- It contains, in order (see _schema-delta.md §D deploy checklist):
--   1. CREATE TABLE for all 23 new tables.
--   2. ALTER TABLE ... ADD COLUMN IF NOT EXISTS for extended-table scalars.
--   3. CREATE INDEX / partial-unique indexes (incl. those Prisma can't model).
--   4. The canonical RLS+GRANT block (ENABLE + FORCE + tenant_isolation +
--      GRANT to app_tenant_user) for EVERY new table — verbatim per
--      _schema-delta.md intro / 20260517235700_phase2_followons.
--   5. CHECK changes: moderation_items.source; automation_rules trigger/provider;
--      widen review_disputes_status_chk (+removed) + ADD violation_type CHECK;
--      DROP the stale connections_provider_chk.
--   6. (Verify step is documented in the deploy checklist — every new table
--      must have rowsecurity = true + a tenant_isolation policy.)
--
-- Conventions match the existing migrations:
--   * gen_random_uuid() PKs (pgcrypto), TIMESTAMPTZ timestamps.
--   * Column adds use ADD COLUMN IF NOT EXISTS with safe defaults so a
--     roll-forward without app changes won't break.
--   * RLS policy key = app.current_org(); org-singleton tables key on
--     organization_id (their PK).
--   * A new table WITHOUT ENABLE/FORCE RLS + tenant_isolation + GRANT is
--     invisible under app_tenant_user (reads empty). This is mandatory.
-- =========================================================================


-- #########################################################################
-- SECTION 1 — NEW TABLES (23)
-- #########################################################################

-- -------------------------------------------------------------------------
-- 1. knowledge_gaps — owner 00_foundation (field set adopted from 05_ai_kb)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS knowledge_gaps (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID         NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  establishment_id UUID,
  question         TEXT         NOT NULL,
  question_norm    TEXT         NOT NULL,
  source           TEXT         NOT NULL,                      -- widget | review_reply | inbox | chat | owner_test
  purpose          TEXT,
  confidence       NUMERIC(3,2),
  ai_message_id    UUID,
  hit_count        INT          NOT NULL DEFAULT 1,
  status           TEXT         NOT NULL DEFAULT 'open',       -- open | answered | dismissed
  answer_text      TEXT,
  answered_at      TIMESTAMPTZ,
  answered_by      UUID,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS knowledge_gaps_org_status_hits_idx
  ON knowledge_gaps (organization_id, status, hit_count DESC);
CREATE INDEX IF NOT EXISTS knowledge_gaps_org_question_norm_idx
  ON knowledge_gaps (organization_id, question_norm);

ALTER TABLE knowledge_gaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_gaps FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON knowledge_gaps;
CREATE POLICY tenant_isolation ON knowledge_gaps
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));
GRANT SELECT, INSERT, UPDATE, DELETE ON knowledge_gaps TO app_tenant_user;


-- -------------------------------------------------------------------------
-- 2. scheduled_jobs — owner 00_foundation (consolidated dispatcher queue)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID         NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  kind             TEXT         NOT NULL,                      -- scheduled_post | scheduled_request | scheduled_reply
  status           TEXT         NOT NULL DEFAULT 'pending',    -- pending | running | done | failed | canceled
  run_at           TIMESTAMPTZ  NOT NULL,
  payload          JSONB        NOT NULL,
  dedupe_key       TEXT,
  attempts         INT          NOT NULL DEFAULT 0,
  max_attempts     INT          NOT NULL DEFAULT 5,
  locked_at        TIMESTAMPTZ,
  ran_at           TIMESTAMPTZ,
  last_error       TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS scheduled_jobs_org_kind_dedupe_key
  ON scheduled_jobs (organization_id, kind, dedupe_key);
CREATE INDEX IF NOT EXISTS scheduled_jobs_status_run_at_idx
  ON scheduled_jobs (status, run_at);
CREATE INDEX IF NOT EXISTS scheduled_jobs_org_kind_status_idx
  ON scheduled_jobs (organization_id, kind, status);
-- Partial index for the per-minute dispatcher's "what is due" select.
CREATE INDEX IF NOT EXISTS scheduled_jobs_due_idx
  ON scheduled_jobs (run_at) WHERE status = 'pending';

ALTER TABLE scheduled_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_jobs FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON scheduled_jobs;
CREATE POLICY tenant_isolation ON scheduled_jobs
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));
GRANT SELECT, INSERT, UPDATE, DELETE ON scheduled_jobs TO app_tenant_user;


-- -------------------------------------------------------------------------
-- 3. automation_rules — owner 07_review_requests
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS automation_rules (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID         NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  establishment_id UUID         REFERENCES establishments(id) ON DELETE CASCADE,
  enabled          BOOLEAN      NOT NULL DEFAULT FALSE,
  trigger          TEXT         NOT NULL,
  provider         TEXT,
  delay_hours      INT          NOT NULL DEFAULT 72,
  frequency_cap_per_customer  INT NOT NULL DEFAULT 1,
  frequency_cap_window_days   INT NOT NULL DEFAULT 30,
  template_id      UUID         REFERENCES outreach_templates(id) ON DELETE SET NULL,
  ai_personalize   BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT automation_rules_trigger_chk
    CHECK (trigger IN ('review_request','post_purchase','post_visit','shopify_order',
                       'square_sale','manual','negative_review','positive_review')),
  CONSTRAINT automation_rules_provider_chk
    CHECK (provider IS NULL OR provider IN ('email','sms','both','shopify','square'))
);
-- @@unique([organizationId, establishmentId, trigger]); establishment_id is
-- nullable so a plain UNIQUE treats NULLs as distinct — acceptable (org-wide
-- rules can repeat per trigger only via distinct establishment scoping).
CREATE UNIQUE INDEX IF NOT EXISTS automation_rules_org_estab_trigger
  ON automation_rules (organization_id, establishment_id, trigger);
CREATE INDEX IF NOT EXISTS automation_rules_org_enabled_idx
  ON automation_rules (organization_id, enabled);

ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_rules FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON automation_rules;
CREATE POLICY tenant_isolation ON automation_rules
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));
GRANT SELECT, INSERT, UPDATE, DELETE ON automation_rules TO app_tenant_user;


-- -------------------------------------------------------------------------
-- 4. content_library_assets — owner 10_post_creator
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS content_library_assets (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID         NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  establishment_id UUID         REFERENCES establishments(id) ON DELETE CASCADE,
  url              TEXT         NOT NULL,
  pathname         TEXT         NOT NULL,
  kind             TEXT         NOT NULL,                      -- image | video
  mime_type        TEXT,
  size_bytes       INT,
  width            INT,
  height           INT,
  folder           TEXT,
  source           TEXT         NOT NULL DEFAULT 'upload',     -- upload | ai_creative
  caption          TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS content_library_assets_org_folder_created_idx
  ON content_library_assets (organization_id, folder, created_at DESC);

ALTER TABLE content_library_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_library_assets FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON content_library_assets;
CREATE POLICY tenant_isolation ON content_library_assets
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));
GRANT SELECT, INSERT, UPDATE, DELETE ON content_library_assets TO app_tenant_user;


-- -------------------------------------------------------------------------
-- 5. social_post_metrics — owner 10_post_creator
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS social_post_metrics (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID         NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  social_post_id   UUID         NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  platform         TEXT         NOT NULL,
  likes            INT          NOT NULL DEFAULT 0,
  comments         INT          NOT NULL DEFAULT 0,
  shares           INT          NOT NULL DEFAULT 0,
  reach            INT          NOT NULL DEFAULT 0,
  impressions      INT          NOT NULL DEFAULT 0,
  fetched_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS social_post_metrics_post_platform
  ON social_post_metrics (social_post_id, platform);
CREATE INDEX IF NOT EXISTS social_post_metrics_org_post_idx
  ON social_post_metrics (organization_id, social_post_id);

ALTER TABLE social_post_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_post_metrics FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON social_post_metrics;
CREATE POLICY tenant_isolation ON social_post_metrics
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));
GRANT SELECT, INSERT, UPDATE, DELETE ON social_post_metrics TO app_tenant_user;


-- -------------------------------------------------------------------------
-- 6. moderation_items — owner 09_inbox (NEVER google; CHECK enforces)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS moderation_items (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  source              TEXT        NOT NULL,                    -- facebook | instagram | webchat
  source_type         TEXT        NOT NULL,                    -- comment | dm | chat_message
  source_id           TEXT        NOT NULL,
  external_id         TEXT,
  author_name         TEXT,
  body                TEXT        NOT NULL,
  reason              TEXT        NOT NULL,                    -- keyword | profanity | negativity | spam
  matched_keyword     TEXT,
  ai_confidence       NUMERIC(3,2),
  suggested_action    TEXT        NOT NULL DEFAULT 'review',
  status              TEXT        NOT NULL DEFAULT 'pending',
  resolved_by_user_id UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at         TIMESTAMPTZ,
  CONSTRAINT moderation_items_source_chk
    CHECK (source IN ('facebook','instagram','webchat'))
);
CREATE INDEX IF NOT EXISTS moderation_items_org_status_created_idx
  ON moderation_items (organization_id, status, created_at DESC);

ALTER TABLE moderation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_items FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON moderation_items;
CREATE POLICY tenant_isolation ON moderation_items
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));
GRANT SELECT, INSERT, UPDATE, DELETE ON moderation_items TO app_tenant_user;


-- -------------------------------------------------------------------------
-- 7. widget_configs — owner 09_inbox (org-singleton; PK = organization_id)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS widget_configs (
  organization_id      UUID        PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  brand_color          TEXT        NOT NULL DEFAULT '#4f46e5',
  header_text          TEXT        NOT NULL DEFAULT 'Chat with us',
  greeting             TEXT        NOT NULL,
  avatar_url           TEXT,
  position             TEXT        NOT NULL DEFAULT 'bottom-right',
  agent_presence       TEXT        NOT NULL DEFAULT 'online',   -- online | away
  escalate_after_turns INT         NOT NULL DEFAULT 6,
  business_hours       JSONB,
  sms_handoff_enabled  BOOLEAN     NOT NULL DEFAULT FALSE,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE widget_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE widget_configs FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON widget_configs;
CREATE POLICY tenant_isolation ON widget_configs
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));
GRANT SELECT, INSERT, UPDATE, DELETE ON widget_configs TO app_tenant_user;


-- -------------------------------------------------------------------------
-- 8. contact_tags — owner 12_contacts (source of truth for tags)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contact_tags (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID         NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  contact_id       UUID         NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tag              TEXT         NOT NULL,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS contact_tags_contact_tag
  ON contact_tags (contact_id, tag);
CREATE INDEX IF NOT EXISTS contact_tags_org_tag_idx
  ON contact_tags (organization_id, tag);

ALTER TABLE contact_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_tags FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON contact_tags;
CREATE POLICY tenant_isolation ON contact_tags
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));
GRANT SELECT, INSERT, UPDATE, DELETE ON contact_tags TO app_tenant_user;


-- -------------------------------------------------------------------------
-- 9. contact_custom_fields — owner 12_contacts
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contact_custom_fields (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID         NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  contact_id       UUID         NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  key              TEXT         NOT NULL,
  value            TEXT         NOT NULL,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS contact_custom_fields_contact_key
  ON contact_custom_fields (contact_id, key);
CREATE INDEX IF NOT EXISTS contact_custom_fields_org_idx
  ON contact_custom_fields (organization_id);

ALTER TABLE contact_custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_custom_fields FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON contact_custom_fields;
CREATE POLICY tenant_isolation ON contact_custom_fields
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));
GRANT SELECT, INSERT, UPDATE, DELETE ON contact_custom_fields TO app_tenant_user;


-- -------------------------------------------------------------------------
-- 10. contact_activities — owner 12_contacts (timeline; idempotent capture)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contact_activities (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID         NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  contact_id       UUID         NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  kind             TEXT         NOT NULL,                      -- captured | tag_added | tag_removed | note_added | imported | merged | manual
  source           TEXT,                                       -- google_review | live_chat | survey | social_dm | review_request | shopify
  title            TEXT,
  body             TEXT,
  external_ref     TEXT,
  actor_user_id    UUID,
  occurred_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
-- @@unique([contactId, source, externalRef]) — makes auto-capture idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS contact_activities_contact_source_ref
  ON contact_activities (contact_id, source, external_ref);
CREATE INDEX IF NOT EXISTS contact_activities_org_contact_occurred_idx
  ON contact_activities (organization_id, contact_id, occurred_at DESC);

ALTER TABLE contact_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_activities FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON contact_activities;
CREATE POLICY tenant_isolation ON contact_activities
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));
GRANT SELECT, INSERT, UPDATE, DELETE ON contact_activities TO app_tenant_user;


-- -------------------------------------------------------------------------
-- 11. survey_insights — owner 11_surveys (replace-all per run)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS survey_insights (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          UUID         NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  type                     TEXT         NOT NULL,
  priority                 TEXT         NOT NULL,              -- red | orange | green | blue
  headline                 TEXT         NOT NULL,
  description              TEXT         NOT NULL,
  recommendation           TEXT         NOT NULL,
  evidence_count           INT          NOT NULL,
  generated_at             TIMESTAMPTZ  NOT NULL,
  based_on_response_count  INT          NOT NULL
);
CREATE INDEX IF NOT EXISTS survey_insights_org_generated_idx
  ON survey_insights (organization_id, generated_at DESC);

ALTER TABLE survey_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_insights FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON survey_insights;
CREATE POLICY tenant_isolation ON survey_insights
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));
GRANT SELECT, INSERT, UPDATE, DELETE ON survey_insights TO app_tenant_user;


-- -------------------------------------------------------------------------
-- 12. survey_automations — owner 11_surveys
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS survey_automations (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID         NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  campaign_id      UUID         REFERENCES survey_campaigns(id) ON DELETE SET NULL,
  trigger_event    TEXT         NOT NULL,                      -- post_purchase | post_visit | shopify_order | square_sale | manual
  delay_minutes    INT          NOT NULL DEFAULT 0,
  status           TEXT         NOT NULL DEFAULT 'paused',     -- active | paused
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS survey_automations_org_status_idx
  ON survey_automations (organization_id, status);

ALTER TABLE survey_automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_automations FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON survey_automations;
CREATE POLICY tenant_isolation ON survey_automations
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));
GRANT SELECT, INSERT, UPDATE, DELETE ON survey_automations TO app_tenant_user;


-- -------------------------------------------------------------------------
-- 13. seo_snapshots — owner 13_reports
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS seo_snapshots (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID         NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  establishment_id     UUID         REFERENCES establishments(id) ON DELETE CASCADE,
  period_start         TIMESTAMPTZ  NOT NULL,
  period_end           TIMESTAMPTZ  NOT NULL,
  reputation_score     INT          NOT NULL,
  score_factors        JSONB        NOT NULL,
  local_pack_position  INT,
  website_sessions     INT,
  exec_summary         TEXT,
  generated_at         TIMESTAMPTZ  NOT NULL,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS seo_snapshots_org_estab_generated_idx
  ON seo_snapshots (organization_id, establishment_id, generated_at DESC);

ALTER TABLE seo_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_snapshots FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON seo_snapshots;
CREATE POLICY tenant_isolation ON seo_snapshots
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));
GRANT SELECT, INSERT, UPDATE, DELETE ON seo_snapshots TO app_tenant_user;


-- -------------------------------------------------------------------------
-- 14. keyword_ranks — owner 13_reports
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS keyword_ranks (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID         NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  establishment_id UUID         REFERENCES establishments(id) ON DELETE CASCADE,
  keyword          TEXT         NOT NULL,
  position         INT,
  in_local_pack    BOOLEAN      NOT NULL DEFAULT FALSE,
  search_volume    INT,
  geo              TEXT,
  provider         TEXT         NOT NULL,
  checked_at       TIMESTAMPTZ  NOT NULL,
  raw              JSONB
);
CREATE INDEX IF NOT EXISTS keyword_ranks_org_estab_keyword_checked_idx
  ON keyword_ranks (organization_id, establishment_id, keyword, checked_at DESC);

ALTER TABLE keyword_ranks ENABLE ROW LEVEL SECURITY;
ALTER TABLE keyword_ranks FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON keyword_ranks;
CREATE POLICY tenant_isolation ON keyword_ranks
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));
GRANT SELECT, INSERT, UPDATE, DELETE ON keyword_ranks TO app_tenant_user;


-- -------------------------------------------------------------------------
-- 15. competitors — owner 13_reports (cap of 3 enforced in the action)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS competitors (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID         NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  establishment_id UUID         REFERENCES establishments(id) ON DELETE CASCADE,
  name             TEXT         NOT NULL,
  google_place_id  TEXT,
  website_url      TEXT,
  rating           NUMERIC(3,2),
  review_count     INT,
  share_of_voice   NUMERIC(5,2),
  metrics          JSONB,
  keyword_gap      TEXT[]       NOT NULL DEFAULT '{}',
  added_by_id      UUID,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS competitors_org_estab_idx
  ON competitors (organization_id, establishment_id);

ALTER TABLE competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitors FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON competitors;
CREATE POLICY tenant_isolation ON competitors
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));
GRANT SELECT, INSERT, UPDATE, DELETE ON competitors TO app_tenant_user;


-- -------------------------------------------------------------------------
-- 16. citation_audits — owner 13_reports
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS citation_audits (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID         NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  establishment_id UUID         REFERENCES establishments(id) ON DELETE CASCADE,
  directory        TEXT         NOT NULL,                      -- google | yelp | facebook | apple_maps
  name_match       BOOLEAN,
  address_match    BOOLEAN,
  phone_match      BOOLEAN,
  listed_name      TEXT,
  listed_address   TEXT,
  listed_phone     TEXT,
  status           TEXT         NOT NULL DEFAULT 'unknown',
  checked_at       TIMESTAMPTZ  NOT NULL
);
CREATE INDEX IF NOT EXISTS citation_audits_org_estab_directory_idx
  ON citation_audits (organization_id, establishment_id, directory);

ALTER TABLE citation_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE citation_audits FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON citation_audits;
CREATE POLICY tenant_isolation ON citation_audits
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));
GRANT SELECT, INSERT, UPDATE, DELETE ON citation_audits TO app_tenant_user;


-- -------------------------------------------------------------------------
-- 17. geo_grid_snapshots — owner 13_reports
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS geo_grid_snapshots (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID         NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  establishment_id UUID         REFERENCES establishments(id) ON DELETE CASCADE,
  keyword          TEXT         NOT NULL,
  center_lat       NUMERIC(9,6) NOT NULL,
  center_lng       NUMERIC(9,6) NOT NULL,
  radius_miles     NUMERIC(4,1) NOT NULL DEFAULT 5,
  grid_size        INT          NOT NULL DEFAULT 5,
  cells            JSONB        NOT NULL,
  avg_position     NUMERIC(5,2),
  provider         TEXT         NOT NULL,
  checked_at       TIMESTAMPTZ  NOT NULL
);
CREATE INDEX IF NOT EXISTS geo_grid_snapshots_org_estab_checked_idx
  ON geo_grid_snapshots (organization_id, establishment_id, checked_at DESC);

ALTER TABLE geo_grid_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE geo_grid_snapshots FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON geo_grid_snapshots;
CREATE POLICY tenant_isolation ON geo_grid_snapshots
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));
GRANT SELECT, INSERT, UPDATE, DELETE ON geo_grid_snapshots TO app_tenant_user;


-- -------------------------------------------------------------------------
-- 18. ga4_connections — owner 13_reports (separate from connections by design)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ga4_connections (
  id                          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id             UUID         NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  establishment_id            UUID         REFERENCES establishments(id) ON DELETE CASCADE,
  property_id                 TEXT         NOT NULL,
  measurement_id              TEXT,
  tracking_snippet_installed  BOOLEAN      NOT NULL DEFAULT FALSE,
  status                      TEXT         NOT NULL DEFAULT 'pending',
  last_synced_at              TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ga4_connections_org_estab
  ON ga4_connections (organization_id, establishment_id);
CREATE INDEX IF NOT EXISTS ga4_connections_org_idx
  ON ga4_connections (organization_id);

ALTER TABLE ga4_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE ga4_connections FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON ga4_connections;
CREATE POLICY tenant_isolation ON ga4_connections
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));
GRANT SELECT, INSERT, UPDATE, DELETE ON ga4_connections TO app_tenant_user;


-- -------------------------------------------------------------------------
-- 19. connection_sync_logs — owner 14_connections (append-only log)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS connection_sync_logs (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID         NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  connection_id     UUID         NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  provider          TEXT         NOT NULL,
  status            TEXT         NOT NULL,                     -- ok | error | skipped
  contacts_created  INT          NOT NULL DEFAULT 0,
  contacts_updated  INT          NOT NULL DEFAULT 0,
  error             TEXT,
  duration_ms       INT,
  started_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS connection_sync_logs_org_conn_started_idx
  ON connection_sync_logs (organization_id, connection_id, started_at DESC);

ALTER TABLE connection_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE connection_sync_logs FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON connection_sync_logs;
CREATE POLICY tenant_isolation ON connection_sync_logs
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));
-- Append-only log: SELECT + INSERT are sufficient for app_tenant_user.
GRANT SELECT, INSERT ON connection_sync_logs TO app_tenant_user;


-- -------------------------------------------------------------------------
-- 20. autopilot_configs — owner 15_differentiators (org-singleton)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS autopilot_configs (
  organization_id         UUID        PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  enabled                 BOOLEAN     NOT NULL DEFAULT FALSE,
  risk_tolerance          TEXT        NOT NULL DEFAULT 'balanced',  -- conservative | balanced | aggressive
  auto_reply_5_star       BOOLEAN     NOT NULL DEFAULT TRUE,
  draft_low_star          BOOLEAN     NOT NULL DEFAULT TRUE,
  send_review_requests    BOOLEAN     NOT NULL DEFAULT TRUE,
  voice_to_review_enabled BOOLEAN     NOT NULL DEFAULT TRUE,
  draft_disputes          BOOLEAN     NOT NULL DEFAULT FALSE,
  geo_posts               BOOLEAN     NOT NULL DEFAULT FALSE,
  inbox_auto_reply        BOOLEAN     NOT NULL DEFAULT FALSE,
  escalate_to_human       BOOLEAN     NOT NULL DEFAULT TRUE,
  weekly_digest_enabled   BOOLEAN     NOT NULL DEFAULT TRUE,
  enabled_at              TIMESTAMPTZ,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE autopilot_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE autopilot_configs FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON autopilot_configs;
CREATE POLICY tenant_isolation ON autopilot_configs
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));
GRANT SELECT, INSERT, UPDATE, DELETE ON autopilot_configs TO app_tenant_user;


-- -------------------------------------------------------------------------
-- 21. autopilot_actions — owner 15_differentiators (action ledger)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS autopilot_actions (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID         NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  loop             TEXT         NOT NULL,                      -- auto_reply | low_star_draft | review_request | voice_review | dispute | geo_post | inbox_reply | escalation
  action           TEXT         NOT NULL,                      -- published | drafted | scheduled_request | escalated
  resource_type    TEXT,
  resource_id      UUID,
  status           TEXT         NOT NULL DEFAULT 'done',
  requires_human   BOOLEAN      NOT NULL DEFAULT FALSE,
  detail           JSONB,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS autopilot_actions_org_created_idx
  ON autopilot_actions (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS autopilot_actions_org_requires_human_status_idx
  ON autopilot_actions (organization_id, requires_human, status);

ALTER TABLE autopilot_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE autopilot_actions FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON autopilot_actions;
CREATE POLICY tenant_isolation ON autopilot_actions
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));
GRANT SELECT, INSERT, UPDATE, DELETE ON autopilot_actions TO app_tenant_user;


-- -------------------------------------------------------------------------
-- 22. roi_settings — owner 15_differentiators
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roi_settings (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID          NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  establishment_id    UUID          NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  average_job_value   NUMERIC(10,2),
  booking_to_job_rate NUMERIC(3,2)  NOT NULL DEFAULT 0.6,
  review_to_call_rate NUMERIC(3,2),
  currency            TEXT          NOT NULL DEFAULT 'USD',
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS roi_settings_org_estab
  ON roi_settings (organization_id, establishment_id);
CREATE INDEX IF NOT EXISTS roi_settings_org_idx
  ON roi_settings (organization_id);

ALTER TABLE roi_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE roi_settings FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON roi_settings;
CREATE POLICY tenant_isolation ON roi_settings
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));
GRANT SELECT, INSERT, UPDATE, DELETE ON roi_settings TO app_tenant_user;


-- -------------------------------------------------------------------------
-- 23. autopilot_digest_runs — owner 15_differentiators (race-safe claim)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS autopilot_digest_runs (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID         NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  week_start         TIMESTAMPTZ  NOT NULL,
  recipients_sent    INT          NOT NULL DEFAULT 0,
  recipients_failed  INT          NOT NULL DEFAULT 0,
  error_summary      TEXT,
  completed_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS autopilot_digest_runs_org_week
  ON autopilot_digest_runs (organization_id, week_start);
CREATE INDEX IF NOT EXISTS autopilot_digest_runs_org_idx
  ON autopilot_digest_runs (organization_id);

ALTER TABLE autopilot_digest_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE autopilot_digest_runs FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON autopilot_digest_runs;
CREATE POLICY tenant_isolation ON autopilot_digest_runs
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));
GRANT SELECT, INSERT, UPDATE, DELETE ON autopilot_digest_runs TO app_tenant_user;


-- #########################################################################
-- SECTION 2 — EXTENDED TABLES (ADD COLUMN; safe defaults; no new RLS)
-- The existing per-table tenant_isolation policy already covers new columns.
-- #########################################################################

-- -------------------------------------------------------------------------
-- organizations — SEO onboarding scalars (owner 13_reports)
-- -------------------------------------------------------------------------
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS seo_onboarding_step             INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seo_first_report_requested_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS seo_first_report_ready_at       TIMESTAMPTZ;

-- -------------------------------------------------------------------------
-- contacts — enriched profile (owner 12_contacts)
-- -------------------------------------------------------------------------
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS first_name        TEXT,
  ADD COLUMN IF NOT EXISTS last_name         TEXT,
  ADD COLUMN IF NOT EXISTS company_name      TEXT,
  ADD COLUMN IF NOT EXISTS notes             TEXT,
  ADD COLUMN IF NOT EXISTS vip               BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS consent_status    TEXT,
  ADD COLUMN IF NOT EXISTS social_ids        JSONB,
  ADD COLUMN IF NOT EXISTS last_activity_at  TIMESTAMPTZ;

-- -------------------------------------------------------------------------
-- connections — live sync state (owner 14_connections)
-- -------------------------------------------------------------------------
ALTER TABLE connections
  ADD COLUMN IF NOT EXISTS sync_status  TEXT,   -- idle | syncing | error
  ADD COLUMN IF NOT EXISTS sync_error   TEXT;

-- -------------------------------------------------------------------------
-- review_replies — durable scheduled auto-publish (owner 06_review_feed)
-- -------------------------------------------------------------------------
ALTER TABLE review_replies
  ADD COLUMN IF NOT EXISTS scheduled_publish_at TIMESTAMPTZ;

-- -------------------------------------------------------------------------
-- review_disputes — violation category + filing timestamps (owner 08_dispute)
-- -------------------------------------------------------------------------
ALTER TABLE review_disputes
  ADD COLUMN IF NOT EXISTS violation_type TEXT,
  ADD COLUMN IF NOT EXISTS filed_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS decision_at    TIMESTAMPTZ;

-- -------------------------------------------------------------------------
-- social_posts — approved carousel creatives + best-time marker (owner 10)
-- -------------------------------------------------------------------------
ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS approved_creative_urls TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS best_time_applied      BOOLEAN NOT NULL DEFAULT FALSE;

-- -------------------------------------------------------------------------
-- ai_training_profiles — auto-setup + taught-facts overflow (owner 05_ai_kb)
-- -------------------------------------------------------------------------
ALTER TABLE ai_training_profiles
  ADD COLUMN IF NOT EXISTS source_url             TEXT,
  ADD COLUMN IF NOT EXISTS last_auto_updated_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locations              TEXT,
  ADD COLUMN IF NOT EXISTS taught_facts           JSONB;

-- -------------------------------------------------------------------------
-- chat_automation_rules — channel-aware AI behaviour (owner 09_inbox)
-- -------------------------------------------------------------------------
ALTER TABLE chat_automation_rules
  ADD COLUMN IF NOT EXISTS channels                      TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS trigger_keyword               TEXT,
  ADD COLUMN IF NOT EXISTS ai_behaviour                  TEXT NOT NULL DEFAULT 'kb_reply',  -- kb_reply | fixed_template | kb_then_escalate
  ADD COLUMN IF NOT EXISTS fixed_template                TEXT,
  ADD COLUMN IF NOT EXISTS max_replies_per_conversation  INT NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS escalate_after_turns          INT NOT NULL DEFAULT 0;

-- -------------------------------------------------------------------------
-- widget_keys — widget AI mode (owner 09_inbox)
-- -------------------------------------------------------------------------
ALTER TABLE widget_keys
  ADD COLUMN IF NOT EXISTS ai_mode TEXT NOT NULL DEFAULT 'always_on';  -- always_on | after_hours | ai_human_handoff


-- #########################################################################
-- SECTION 3 — PARTIAL-UNIQUE / DEDUPE INDEXES on extended tables
-- (Indexes Prisma cannot model; the Prisma @@unique on contacts is
--  materialized here as a PARTIAL unique so NULL external_id rows don't clash.)
-- #########################################################################

-- contacts: activity recency + source lookup (owner 12_contacts)
CREATE INDEX IF NOT EXISTS contacts_org_last_activity_idx
  ON contacts (organization_id, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS contacts_org_source_idx
  ON contacts (organization_id, source);

-- contacts: email/phone dedupe (owner 12_contacts) — partial uniques so
-- only non-null values are constrained (cannot be modeled in Prisma).
CREATE UNIQUE INDEX IF NOT EXISTS contacts_org_email_uniq
  ON contacts (organization_id, email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS contacts_org_phone_uniq
  ON contacts (organization_id, phone) WHERE phone IS NOT NULL;

-- contacts: (organization_id, source, external_id) dedupe (owner 14_connections)
-- This realizes the Prisma @@unique([organizationId, source, externalId]) as a
-- PARTIAL unique WHERE external_id IS NOT NULL (sync engine also does a
-- defensive find-then-write so it works pre- and post-migration).
CREATE UNIQUE INDEX IF NOT EXISTS contacts_org_source_external_uniq
  ON contacts (organization_id, source, external_id) WHERE external_id IS NOT NULL;

-- review_replies: drain index for the scheduled auto-publish window (owner 06)
CREATE INDEX IF NOT EXISTS review_replies_status_scheduled_publish_idx
  ON review_replies (status, scheduled_publish_at);


-- #########################################################################
-- SECTION 4 — CHECK CONSTRAINT CHANGES
-- #########################################################################

-- -------------------------------------------------------------------------
-- review_disputes: widen status CHECK to allow 'removed'; add violation_type
-- CHECK for the 6 categories. The legacy reason CHECK is UNCHANGED — the app
-- dual-writes a legal `reason` via legacyReasonFor().
-- -------------------------------------------------------------------------
ALTER TABLE review_disputes
  DROP CONSTRAINT IF EXISTS review_disputes_status_chk;
ALTER TABLE review_disputes
  ADD  CONSTRAINT review_disputes_status_chk
       CHECK (status IN ('submitted','submitted_to_google','accepted','rejected','withdrawn','removed'));

ALTER TABLE review_disputes
  DROP CONSTRAINT IF EXISTS review_disputes_violation_type_chk;
ALTER TABLE review_disputes
  ADD  CONSTRAINT review_disputes_violation_type_chk
       CHECK (violation_type IS NULL OR violation_type IN (
         'spam_fake','off_topic','conflict_of_interest',
         'profanity_harassment','discrimination','illegal_content'
       ));

-- -------------------------------------------------------------------------
-- connections_provider_chk: ⚠ LATENT PROD BUG FIX.
-- The original CHECK (from 20260511130000_day2) is stale — it omits
-- mailchimp/klaviyo and uses square/meta while callbacks send
-- square_pos/facebook/instagram, so those callbacks throw 23514 in prod TODAY.
-- DROP the constraint and re-add a WIDENED version that covers every provider
-- the app actually writes (keeps the original values for back-compat).
-- -------------------------------------------------------------------------
ALTER TABLE connections
  DROP CONSTRAINT IF EXISTS connections_provider_chk;
ALTER TABLE connections
  ADD  CONSTRAINT connections_provider_chk
       CHECK (provider IN (
         -- original allowed set (kept for back-compat)
         'google_business','meta','linkedin','x','shopify','woocommerce',
         'square','hubspot','salesforce','quickbooks','xero',
         -- widened: providers the callbacks actually send
         'facebook','instagram','square_pos','mailchimp','klaviyo',
         'google','twitter'
       ));


-- #########################################################################
-- SECTION 5 — SCHEMA COMMENTS (visible in psql \d+ and Prisma docs)
-- #########################################################################
COMMENT ON TABLE knowledge_gaps IS
  'AiAssist low-confidence questions (best confidence < ~0.7), deduped on question_norm. Curated by the KB learning loop.';
COMMENT ON TABLE scheduled_jobs IS
  'Durable cron-drained job queue backing dispatch-scheduled (consolidates scheduled_post/request/reply minute jobs).';
COMMENT ON TABLE moderation_items IS
  'Social/webchat moderation queue. source CHECK excludes google — Google reviews/comments are never auto-hidden.';
COMMENT ON TABLE widget_configs IS
  'Org-singleton live-chat widget appearance/behaviour (PK = organization_id).';
COMMENT ON TABLE autopilot_configs IS
  'Org-singleton autopilot master switch + per-loop toggles (PK = organization_id). Default everything safe (off / draft-only on low-star).';
COMMENT ON TABLE ga4_connections IS
  'GA4 link, deliberately separate from connections so a GA4 link cannot corrupt the review OAuth row.';
COMMENT ON COLUMN connections.sync_status IS
  'Live sync state for the Connected Systems table: idle | syncing | error. Nullable; null = never synced.';
COMMENT ON COLUMN review_replies.scheduled_publish_at IS
  'Durable randomized 2–4h auto-publish window. NULL = publish immediately on manual approval.';
COMMENT ON CONSTRAINT connections_provider_chk ON connections IS
  'Widened 2026-06: original day2 CHECK omitted mailchimp/klaviyo and mismatched square_pos/facebook/instagram, causing 23514 on those callbacks. This version covers every provider the app writes.';


-- #########################################################################
-- SECTION 6 — VERIFY (run manually after applying; not a DDL step)
-- #########################################################################
-- Confirm every NEW table has RLS enabled and a tenant_isolation policy.
-- A table missing either reads as EMPTY under app_tenant_user.
--
--   SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
--   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public' AND c.relname IN (
--     'knowledge_gaps','scheduled_jobs','automation_rules','content_library_assets',
--     'social_post_metrics','moderation_items','widget_configs','contact_tags',
--     'contact_custom_fields','contact_activities','survey_insights','survey_automations',
--     'seo_snapshots','keyword_ranks','competitors','citation_audits','geo_grid_snapshots',
--     'ga4_connections','connection_sync_logs','autopilot_configs','autopilot_actions',
--     'roi_settings','autopilot_digest_runs'
--   ) ORDER BY 1;
--
--   SELECT tablename, policyname FROM pg_policies
--   WHERE schemaname = 'public' AND policyname = 'tenant_isolation'
--   ORDER BY tablename;
-- =========================================================================
