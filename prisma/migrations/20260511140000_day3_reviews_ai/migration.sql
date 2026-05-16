-- Day 3: reviews + replies + AI tables + RLS + grants.
-- See DATA_MODEL.md §3.5 (reviews/replies) and §3.9 (AI lifecycle).

-- ============================================================
-- reviews
-- ============================================================
CREATE TABLE reviews (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  establishment_id        uuid NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  source                  text NOT NULL,                     -- google | facebook | yelp | trustpilot | internal | mock
  external_id             text NOT NULL,
  reviewer_name           text,
  rating                  integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body                    text,
  language                text,
  posted_at               TIMESTAMP(3) NOT NULL,
  attributed_device_id    uuid,                              -- FK added Day 4
  attributed_request_id   uuid,                              -- FK added Day 6
  sentiment               numeric(3,2) CHECK (sentiment IS NULL OR sentiment BETWEEN -1 AND 1),
  topics                  text[],
  raw                     jsonb,
  fetched_at              TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT reviews_source_chk CHECK (source IN ('google','facebook','yelp','trustpilot','internal','mock')),
  -- Per DB review CR-fix: scope unique to establishment so chains/agencies don't collide.
  UNIQUE (establishment_id, source, external_id)
);
CREATE INDEX idx_rev_org_estab_posted ON reviews (organization_id, establishment_id, posted_at DESC)
  INCLUDE (rating, reviewer_name, source);
CREATE INDEX idx_rev_org_rating_posted ON reviews (organization_id, rating, posted_at DESC);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON reviews
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));

-- ============================================================
-- review_replies
-- ============================================================
CREATE TABLE review_replies (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id         uuid UNIQUE NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  body              text NOT NULL,
  status            text NOT NULL DEFAULT 'draft',           -- draft | pending_review | published | failed
  generated_by      text,                                    -- haiku-4-5 | sonnet-4-6 | human
  approved_by       uuid REFERENCES users(id),
  published_at      TIMESTAMP(3),
  publish_error     text,
  created_at        TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT review_replies_status_chk
    CHECK (status IN ('draft','pending_review','published','failed'))
);
CREATE INDEX idx_rrep_org_status ON review_replies (organization_id, status);

ALTER TABLE review_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_replies FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON review_replies
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));

-- ============================================================
-- prompt_versions (versioning + A/B baseline)
-- ============================================================
CREATE TABLE prompt_versions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose             text NOT NULL,                          -- review_reply_sensitive | review_reply_thank | safety_classifier | ...
  version             integer NOT NULL,
  template            text NOT NULL,
  model               text NOT NULL,
  params              jsonb NOT NULL,
  cache_breakpoints   jsonb,
  active              boolean NOT NULL DEFAULT false,
  rollout_pct         integer NOT NULL DEFAULT 0 CHECK (rollout_pct BETWEEN 0 AND 100),
  created_by          uuid,
  created_at          TIMESTAMP(3) NOT NULL DEFAULT now(),
  UNIQUE (purpose, version)
);
-- Not tenant-scoped — prompt registry is global. Read-only for app_tenant_user.

-- ============================================================
-- ai_messages — every LLM call logged for cost + forensics
-- ============================================================
CREATE TABLE ai_messages (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  conversation_id          uuid,                              -- nullable for one-shot calls
  purpose                  text NOT NULL,
  prompt_version_id        uuid REFERENCES prompt_versions(id),
  retrieved_chunk_ids      uuid[],
  role                     text NOT NULL,                     -- user | assistant | system
  content                  text NOT NULL,
  model                    text,
  tokens_in                integer,
  tokens_out               integer,
  cache_read_tokens        integer,
  cache_creation_tokens    integer,
  cost_micros              integer,                           -- USD millionths
  latency_ms               integer,
  rendered_prompt_hash     text,
  anthropic_message_id     text,
  model_fingerprint        text,
  cache_state              jsonb,
  legal_hold               boolean NOT NULL DEFAULT false,
  created_at               TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT ai_messages_role_chk CHECK (role IN ('user','assistant','system'))
);
CREATE INDEX idx_ai_msg_org_purpose ON ai_messages (organization_id, purpose, created_at DESC);
CREATE INDEX idx_ai_msg_org_conv ON ai_messages (organization_id, conversation_id, created_at)
  WHERE conversation_id IS NOT NULL;

ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_messages FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON ai_messages
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));

-- ============================================================
-- ai_safety_verdicts — per-output classifier results
-- ============================================================
CREATE TABLE ai_safety_verdicts (
  message_id              uuid PRIMARY KEY REFERENCES ai_messages(id) ON DELETE CASCADE,
  toxic                   boolean NOT NULL DEFAULT false,
  pii_leak                boolean NOT NULL DEFAULT false,
  off_brand               boolean NOT NULL DEFAULT false,
  factual_claim           boolean NOT NULL DEFAULT false,
  jailbreak_attempt       boolean NOT NULL DEFAULT false,
  exfil_url               boolean NOT NULL DEFAULT false,
  system_prompt_leak      boolean NOT NULL DEFAULT false,
  medical_claim           boolean NOT NULL DEFAULT false,
  legal_claim             boolean NOT NULL DEFAULT false,
  financial_claim         boolean NOT NULL DEFAULT false,
  reviewer_name_quoted    boolean NOT NULL DEFAULT false,
  classifier_model        text,
  raw_json                jsonb,
  decided_at              TIMESTAMP(3) NOT NULL DEFAULT now(),
  blocked                 boolean NOT NULL DEFAULT false
);
-- Not directly RLS-scoped — joined through ai_messages which is RLS-scoped.

-- ============================================================
-- Grants to app_tenant_user
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON
  reviews, review_replies, ai_messages, ai_safety_verdicts
TO app_tenant_user;

-- prompt_versions is read-only for app
GRANT SELECT ON prompt_versions TO app_tenant_user;
