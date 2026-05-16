-- Day 7: surveys.
-- Minimal v1: NPS (0-10 numeric) + optional 1 free-text follow-up.
-- Smart-route on submit: avg ≥ 4 (out of 5 normalized) → auto-create review request.
-- See DATA_MODEL.md §3.7.

-- ============================================================
-- survey_campaigns
-- ============================================================
CREATE TABLE survey_campaigns (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  establishment_id   uuid REFERENCES establishments(id) ON DELETE CASCADE,
  name               text NOT NULL,
  type               text NOT NULL DEFAULT 'nps',       -- nps | csat | custom
  channel            text NOT NULL DEFAULT 'email',     -- email | sms | both
  trigger_event      text,                              -- post_purchase | post_visit | manual
  delay_minutes      integer NOT NULL DEFAULT 0,
  incentive          jsonb,                             -- {type: 'discount', value: 10, code: 'WELCOME10'}
  status             text NOT NULL DEFAULT 'draft',     -- draft | active | paused | archived
  smart_route_enabled boolean NOT NULL DEFAULT true,    -- ≥4★ → review request
  created_at         TIMESTAMP(3) NOT NULL DEFAULT now(),
  updated_at         TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT survey_campaigns_type_chk CHECK (type IN ('nps','csat','custom')),
  CONSTRAINT survey_campaigns_channel_chk CHECK (channel IN ('email','sms','both')),
  CONSTRAINT survey_campaigns_status_chk CHECK (status IN ('draft','active','paused','archived'))
);
CREATE INDEX idx_surv_camp_org ON survey_campaigns(organization_id, status);

ALTER TABLE survey_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_campaigns FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON survey_campaigns
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));

-- ============================================================
-- survey_questions
-- ============================================================
CREATE TABLE survey_questions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  uuid NOT NULL REFERENCES survey_campaigns(id) ON DELETE CASCADE,
  position     integer NOT NULL,
  type         text NOT NULL,                          -- nps | rating | text | multichoice | yes_no
  prompt       text NOT NULL,
  options      jsonb,                                  -- {choices: [...]} for multichoice
  required     boolean NOT NULL DEFAULT true,
  CONSTRAINT survey_questions_type_chk CHECK (type IN ('nps','rating','text','multichoice','yes_no')),
  UNIQUE (campaign_id, position)
);
CREATE INDEX idx_surv_q_campaign ON survey_questions(campaign_id, position);
-- Not directly RLS-scoped — accessed via join through survey_campaigns.

-- ============================================================
-- survey_response_tokens (single-use, expires)
-- ============================================================
CREATE TABLE survey_response_tokens (
  token_hash         text PRIMARY KEY,                  -- SHA-256 of the URL token
  campaign_id        uuid NOT NULL REFERENCES survey_campaigns(id) ON DELETE CASCADE,
  organization_id    uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  recipient          text NOT NULL,                     -- email or phone (binds the response)
  recipient_name     text,
  expires_at         TIMESTAMP(3) NOT NULL,
  consumed_at        TIMESTAMP(3),
  created_at         TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX idx_srt_campaign ON survey_response_tokens(campaign_id);
CREATE INDEX idx_srt_expires ON survey_response_tokens(expires_at) WHERE consumed_at IS NULL;

-- Not RLS-scoped: public response endpoint must read by token_hash without an org context.
-- Reads are by exact PK lookup only; abuse is mitigated by token entropy + single-use + expiry.

-- ============================================================
-- survey_responses
-- ============================================================
CREATE TABLE survey_responses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     uuid NOT NULL REFERENCES survey_campaigns(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  recipient       text,                                 -- echoes the token's recipient
  rating_summary  numeric(3,2),                         -- avg of rating-type answers, 0-5 scale
  smart_route_to  text,                                 -- review_request | internal_alert | none
  completed_at    TIMESTAMP(3),
  created_at      TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT survey_responses_rating_chk CHECK (rating_summary IS NULL OR rating_summary BETWEEN 0 AND 5),
  CONSTRAINT survey_responses_route_chk CHECK (smart_route_to IS NULL OR smart_route_to IN
    ('review_request','internal_alert','none'))
);
CREATE INDEX idx_surv_resp_campaign ON survey_responses(campaign_id, created_at DESC);
CREATE INDEX idx_surv_resp_org ON survey_responses(organization_id, created_at DESC);

ALTER TABLE survey_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_responses FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON survey_responses
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));

-- ============================================================
-- survey_answers
-- ============================================================
CREATE TABLE survey_answers (
  response_id   uuid NOT NULL REFERENCES survey_responses(id) ON DELETE CASCADE,
  question_id   uuid NOT NULL REFERENCES survey_questions(id),
  value         jsonb NOT NULL,                         -- {number: 9} | {text: "..."} | {choice: "yes"}
  PRIMARY KEY (response_id, question_id)
);
-- Accessed only via join through survey_responses (which IS RLS-scoped).

-- ============================================================
-- Grants
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON survey_campaigns TO app_tenant_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON survey_questions TO app_tenant_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON survey_response_tokens TO app_tenant_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON survey_responses TO app_tenant_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON survey_answers TO app_tenant_user;
