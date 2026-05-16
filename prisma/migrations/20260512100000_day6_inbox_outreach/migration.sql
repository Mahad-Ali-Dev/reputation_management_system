-- Day 6: review_requests + sms_consents + unsubscribes + inbox_threads + inbox_messages.
-- See DATA_MODEL.md §3.5 (review_requests), §3.8 (inbox), §3.12 (consent + suppression).

-- ============================================================
-- TCPA: prior express written consent per phone number
-- ============================================================
CREATE TABLE sms_consents (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  phone_e164         text NOT NULL,                                -- E.164 format: +1...
  consent_text_hash  text NOT NULL,                                -- SHA-256 of disclosure shown
  consent_source     text NOT NULL,                                -- web_form | qr_intake | imported_with_attestation | api
  consent_ip         inet,
  consent_ua         text,
  consented_at       TIMESTAMP(3) NOT NULL,
  revoked_at         TIMESTAMP(3),
  created_at         TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT sms_consents_source_chk CHECK (consent_source IN
    ('web_form','qr_intake','imported_with_attestation','api','smart_route')),
  CONSTRAINT sms_consents_phone_e164_format CHECK (phone_e164 ~ '^\+[1-9][0-9]{1,14}$'),
  UNIQUE (organization_id, phone_e164)
);
CREATE INDEX idx_sms_consent_phone ON sms_consents(phone_e164) WHERE revoked_at IS NULL;

ALTER TABLE sms_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_consents FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sms_consents
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));

-- ============================================================
-- CAN-SPAM + STOP-keyword unsubscribes
-- ============================================================
CREATE TABLE unsubscribes (
  channel            text NOT NULL,                                -- email | sms
  email_or_phone     text NOT NULL,
  organization_id    uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  unsubscribed_at    TIMESTAMP(3) NOT NULL DEFAULT now(),
  source             text,                                          -- one_click_email | sms_stop | manual | api
  CONSTRAINT unsubscribes_channel_chk CHECK (channel IN ('email','sms')),
  PRIMARY KEY (channel, email_or_phone, organization_id)
);
-- Lookup-optimized index (high-cardinality first per the DB review CR)
CREATE INDEX idx_unsub_lookup ON unsubscribes(email_or_phone, channel, organization_id);

ALTER TABLE unsubscribes ENABLE ROW LEVEL SECURITY;
ALTER TABLE unsubscribes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON unsubscribes
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));

-- ============================================================
-- review_request_templates (per-org)
-- ============================================================
CREATE TABLE review_request_templates (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  establishment_id   uuid REFERENCES establishments(id) ON DELETE CASCADE,
  name               text NOT NULL,
  channel            text NOT NULL,                                -- sms | email | both
  subject            text,                                          -- email only
  body               text NOT NULL,                                 -- supports {{firstName}}, {{businessName}}, {{reviewLink}}
  is_default         boolean NOT NULL DEFAULT false,
  created_at         TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT review_request_templates_channel_chk CHECK (channel IN ('sms','email','both'))
);
CREATE INDEX idx_rrt_org ON review_request_templates(organization_id);

ALTER TABLE review_request_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_request_templates FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON review_request_templates
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));

-- ============================================================
-- review_requests (outbound SMS/email asking for a review)
-- ============================================================
CREATE TABLE review_requests (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  establishment_id    uuid NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  template_id         uuid REFERENCES review_request_templates(id) ON DELETE SET NULL,
  channel             text NOT NULL,                               -- sms | email
  recipient           text NOT NULL,                               -- phone (E.164) or email
  recipient_name      text,
  short_slug          text,                                        -- for click tracking (uses r.<domain>/{slug})
  scheduled_for       TIMESTAMP(3) NOT NULL,
  sent_at             TIMESTAMP(3),
  delivered_at        TIMESTAMP(3),
  opened_at           TIMESTAMP(3),
  clicked_at          TIMESTAMP(3),
  converted_at        TIMESTAMP(3),                                -- review left
  status              text NOT NULL DEFAULT 'queued',              -- queued | sent | delivered | failed | unsubscribed | bounced
  trigger_source      text,                                        -- manual | shopify_order | survey_high_score | webhook
  error               text,
  provider_message_id text,                                        -- Twilio MessageSid / Resend message id
  created_at          TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT review_requests_channel_chk CHECK (channel IN ('sms','email')),
  CONSTRAINT review_requests_status_chk CHECK (status IN
    ('queued','sent','delivered','failed','unsubscribed','bounced','converted'))
);
-- Worker pickup query: WHERE status='queued' AND scheduled_for <= now()
CREATE INDEX idx_rr_due ON review_requests(organization_id, scheduled_for)
  WHERE status = 'queued';
CREATE INDEX idx_rr_org_estab ON review_requests(organization_id, establishment_id, created_at DESC);
CREATE INDEX idx_rr_recipient ON review_requests(organization_id, recipient);

ALTER TABLE review_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON review_requests
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));

-- ============================================================
-- inbox_threads + inbox_messages
-- ============================================================
CREATE TABLE inbox_threads (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  establishment_id   uuid REFERENCES establishments(id) ON DELETE CASCADE,
  channel            text NOT NULL,                               -- email | facebook_msg | instagram_dm | gbp_qa | webchat | sms
  external_thread_id text,
  subject            text,
  participant        jsonb,                                       -- {name, handle, avatar}
  status             text NOT NULL DEFAULT 'open',                -- open | snoozed | closed | spam
  assignee_id        uuid REFERENCES users(id),
  last_message_at    TIMESTAMP(3) NOT NULL DEFAULT now(),
  last_message_body  text,                                        -- denormalized for list view (avoid N+1)
  last_message_direction text,                                    -- inbound | outbound
  unread_count       integer NOT NULL DEFAULT 0,
  created_at         TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT inbox_threads_channel_chk CHECK (channel IN
    ('email','facebook_msg','instagram_dm','gbp_qa','webchat','sms')),
  CONSTRAINT inbox_threads_status_chk CHECK (status IN ('open','snoozed','closed','spam'))
);
CREATE INDEX idx_inbox_list ON inbox_threads(organization_id, status, last_message_at DESC);
CREATE INDEX idx_inbox_assignee ON inbox_threads(organization_id, assignee_id) WHERE status = 'open';

ALTER TABLE inbox_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_threads FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON inbox_threads
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));

CREATE TABLE inbox_messages (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id          uuid NOT NULL REFERENCES inbox_threads(id) ON DELETE CASCADE,
  organization_id    uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  direction          text NOT NULL,                              -- inbound | outbound
  author_user_id     uuid REFERENCES users(id),
  body               text NOT NULL,
  attachments        jsonb,
  ai_suggested       text,
  external_id        text,
  sent_at            TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT inbox_messages_direction_chk CHECK (direction IN ('inbound','outbound'))
);
CREATE INDEX idx_msgs_thread ON inbox_messages(thread_id, sent_at DESC);

ALTER TABLE inbox_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_messages FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON inbox_messages
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));

-- Trigger: on inbox_messages insert, update the parent thread's last_message_* columns.
CREATE OR REPLACE FUNCTION inbox_thread_touch() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE inbox_threads SET
    last_message_at = NEW.sent_at,
    last_message_body = LEFT(NEW.body, 200),
    last_message_direction = NEW.direction,
    unread_count = CASE WHEN NEW.direction = 'inbound' THEN unread_count + 1 ELSE unread_count END
  WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_inbox_thread_touch
AFTER INSERT ON inbox_messages
FOR EACH ROW EXECUTE FUNCTION inbox_thread_touch();

-- ============================================================
-- Grants to app_tenant_user
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON
  sms_consents,
  unsubscribes,
  review_request_templates,
  review_requests,
  inbox_threads,
  inbox_messages
TO app_tenant_user;
