-- Day 10 V2 Features:
--   * review_disputes (owner flags inappropriate reviews)
--   * survey_coupons (promoter incentive engine)
--   * feature_flags (per-org rollout control)
--   * reviews.topics_extracted_at (incremental topic worker)
--   * audit_log hash chain trigger (tamper-evident append-only)
--
-- Pattern: every tenant-scoped table has ENABLE + FORCE RLS with a single
-- `tenant_isolation` policy referencing app.current_org(). feature_flags can
-- be either org-scoped OR global (org_id nullable) — RLS allows both.

-- ============================================================
-- review_disputes — owner flags a review as fake / inappropriate
-- ============================================================
CREATE TABLE review_disputes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id           uuid NOT NULL UNIQUE REFERENCES reviews(id) ON DELETE CASCADE,
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  reason              text NOT NULL,                              -- fake | offensive | conflict_of_interest | wrong_business | other
  details             text,                                       -- owner-supplied 0-2000 chars
  status              text NOT NULL DEFAULT 'submitted',         -- submitted | submitted_to_google | accepted | rejected | withdrawn
  submitted_by        uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  submitted_to_provider_at  TIMESTAMP(3),
  provider_response   jsonb,
  resolved_at         TIMESTAMP(3),
  created_at          TIMESTAMP(3) NOT NULL DEFAULT now(),
  updated_at          TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT review_disputes_reason_chk
    CHECK (reason IN ('fake','offensive','conflict_of_interest','wrong_business','other')),
  CONSTRAINT review_disputes_status_chk
    CHECK (status IN ('submitted','submitted_to_google','accepted','rejected','withdrawn'))
);
CREATE INDEX idx_review_disputes_org_status ON review_disputes(organization_id, status, created_at DESC);

ALTER TABLE review_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_disputes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON review_disputes
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));


-- ============================================================
-- survey_coupons — single-use codes issued to NPS promoters
-- ============================================================
CREATE TABLE survey_coupons (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id        uuid NOT NULL UNIQUE REFERENCES survey_responses(id) ON DELETE CASCADE,
  organization_id    uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  campaign_id        uuid NOT NULL REFERENCES survey_campaigns(id) ON DELETE CASCADE,
  code               text NOT NULL UNIQUE,                         -- 10-char Crockford base32 (unique across org boundary intentionally)
  code_hash          text NOT NULL,                                -- SHA-256 for redemption lookup
  value_cents        integer NOT NULL,                             -- 500 = $5, etc.
  currency           text NOT NULL DEFAULT 'USD',
  description        text,                                         -- "5% off your next visit"
  expires_at         TIMESTAMP(3) NOT NULL,
  redeemed_at        TIMESTAMP(3),
  redeemed_by_note   text,                                         -- free-text note from staff at POS
  created_at         TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT survey_coupons_value_chk CHECK (value_cents > 0 AND value_cents <= 10000)
);
CREATE INDEX idx_survey_coupons_org ON survey_coupons(organization_id, redeemed_at);
CREATE INDEX idx_survey_coupons_hash ON survey_coupons(code_hash);

ALTER TABLE survey_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_coupons FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON survey_coupons
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));


-- ============================================================
-- feature_flags — per-org or global; admin-controlled
-- ============================================================
CREATE TABLE feature_flags (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid REFERENCES organizations(id) ON DELETE CASCADE,  -- NULL = global default
  key                text NOT NULL,                                          -- e.g. "ai_phone_receptionist", "chatbot_reranker"
  enabled            boolean NOT NULL DEFAULT false,
  rollout_pct        integer NOT NULL DEFAULT 0,                             -- 0..100; for gradual rollout
  metadata           jsonb,                                                  -- arbitrary { reason, expires_at, owner }
  created_at         TIMESTAMP(3) NOT NULL DEFAULT now(),
  updated_at         TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT feature_flags_rollout_chk CHECK (rollout_pct BETWEEN 0 AND 100),
  CONSTRAINT feature_flags_uniq UNIQUE (organization_id, key)
);
CREATE INDEX idx_feature_flags_key ON feature_flags(key, enabled);
-- Partial index for null org_id (Postgres requires partial unique for "one global per key")
CREATE UNIQUE INDEX idx_feature_flags_global_uniq
  ON feature_flags(key) WHERE organization_id IS NULL;

-- feature_flags is admin-managed; readers need both their org AND global.
-- Use a custom RLS expression instead of the canonical pattern.
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flags FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON feature_flags
  FOR SELECT
  USING (organization_id IS NULL OR organization_id = (SELECT app.current_org()));
-- Writes restricted to admin connection (bypasses RLS via separate role) — see lib/admin/flags.ts.
-- We deliberately don't grant INSERT/UPDATE/DELETE here.


-- ============================================================
-- reviews — add topics_extracted_at + sentiment_extracted_at for incremental workers
-- ============================================================
ALTER TABLE reviews
  ADD COLUMN topics_extracted_at      TIMESTAMP(3),
  ADD COLUMN sentiment_extracted_at   TIMESTAMP(3);

-- Index supporting "find reviews needing extraction"
CREATE INDEX idx_reviews_pending_topics
  ON reviews(organization_id, fetched_at)
  WHERE topics_extracted_at IS NULL;


-- ============================================================
-- ai_documents — add status='quarantined' note + URL-crawl tracking
-- ============================================================
-- (no schema change; status check constraint already allows 'quarantined')
ALTER TABLE ai_documents
  ADD COLUMN IF NOT EXISTS source_metadata jsonb;  -- {fetched_at, http_status, content_type, robots_disallowed}


-- ============================================================
-- audit_log hash chain
-- ============================================================
-- Adds a BEFORE INSERT trigger that fills prev_hash + row_hash.
-- prev_hash = the row_hash of the most-recent prior audit row in the same org (or global if org_id null).
-- row_hash  = sha256(prev_hash || canonical_json(this_row))
--
-- This makes the audit log tamper-evident: if any row is modified, every subsequent row_hash mismatches.
-- (UPDATE/DELETE remains blocked by the existing forbid trigger.)

CREATE OR REPLACE FUNCTION audit_log_set_hash_chain() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  prev bytea;
  canonical text;
BEGIN
  -- Find the previous row's hash for the same org scope.
  SELECT row_hash INTO prev
  FROM audit_log
  WHERE
    (NEW.organization_id IS NULL AND organization_id IS NULL)
    OR (NEW.organization_id IS NOT NULL AND organization_id = NEW.organization_id)
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  -- Canonical row representation (stable across Postgres versions).
  canonical := concat_ws('|',
    NEW.id::text,
    coalesce(NEW.organization_id::text, ''),
    NEW.actor_type,
    NEW.actor_id::text,
    NEW.action,
    coalesce(NEW.resource_type, ''),
    coalesce(NEW.resource_id::text, ''),
    coalesce(NEW.before_data::text, ''),
    coalesce(NEW.after_data::text, ''),
    coalesce(NEW.ip::text, ''),
    coalesce(NEW.user_agent, ''),
    NEW.created_at::text
  );

  NEW.prev_hash := prev;
  NEW.row_hash  := digest(coalesce(encode(prev, 'hex'), '') || canonical, 'sha256');
  RETURN NEW;
END;
$$;

-- Drop any prior trigger with the same name (idempotent migration)
DROP TRIGGER IF EXISTS audit_log_hash_chain ON audit_log;
CREATE TRIGGER audit_log_hash_chain
  BEFORE INSERT ON audit_log
  FOR EACH ROW
  EXECUTE FUNCTION audit_log_set_hash_chain();


-- ============================================================
-- Grant fresh permissions to app_tenant_user for new tables.
-- (Inherits from earlier `app_tenant_role` migration — we need to GRANT on these specifically.)
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON review_disputes TO app_tenant_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON survey_coupons TO app_tenant_user;
GRANT SELECT                         ON feature_flags  TO app_tenant_user;
