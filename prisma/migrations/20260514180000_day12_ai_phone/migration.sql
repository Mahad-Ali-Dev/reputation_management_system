-- Day 12 — AI Phone Receptionist (Twilio Voice + Claude brain)
--
-- Architecture:
--   1. Org provisions a Twilio number via /settings/phone (UI)
--   2. Twilio webhook /api/voice/incoming hits us on every inbound call
--   3. We return TwiML with <Gather input="speech"> to capture the caller
--   4. Twilio POSTs transcribed speech to /api/voice/respond
--   5. We call Claude with conversation history → return next TwiML response
--   6. Loop until the caller hangs up or the AI decides to end the call
--
-- v1: uses Twilio's built-in <Say> (text-to-speech) + <Gather input="speech"> (STT).
-- Voice cloning (ElevenLabs) and Whisper STT are Phase-2 upgrades.

-- ============================================================
-- phone_numbers — Twilio numbers leased per org
-- ============================================================
CREATE TABLE phone_numbers (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  establishment_id     uuid REFERENCES establishments(id) ON DELETE SET NULL,
  phone_e164           text NOT NULL UNIQUE,                  -- the Twilio number
  twilio_sid           text NOT NULL UNIQUE,                  -- Twilio's PN... SID
  friendly_name        text,
  forward_to_e164      text,                                  -- forward to a human after AI handoff
  business_hours_only  boolean NOT NULL DEFAULT false,
  status               text NOT NULL DEFAULT 'active',        -- active | paused | released
  capabilities         jsonb NOT NULL DEFAULT '{"voice":true,"sms":true,"mms":false}'::jsonb,
  monthly_cost_cents   integer NOT NULL DEFAULT 100,
  created_at           TIMESTAMP(3) NOT NULL DEFAULT now(),
  updated_at           TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT phone_numbers_status_chk CHECK (status IN ('active','paused','released'))
);
CREATE INDEX idx_phone_numbers_org ON phone_numbers(organization_id, status);

ALTER TABLE phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_numbers FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON phone_numbers
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));


-- ============================================================
-- phone_calls — one row per inbound call
-- ============================================================
CREATE TABLE phone_calls (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  phone_number_id      uuid REFERENCES phone_numbers(id) ON DELETE SET NULL,
  twilio_call_sid      text NOT NULL UNIQUE,                  -- CA...
  from_e164            text NOT NULL,
  to_e164              text NOT NULL,                          -- our number
  direction            text NOT NULL DEFAULT 'inbound',        -- inbound | outbound
  status               text NOT NULL DEFAULT 'ringing',        -- ringing | in-progress | completed | failed | no-answer | voicemail | forwarded
  started_at           TIMESTAMP(3) NOT NULL DEFAULT now(),
  ended_at             TIMESTAMP(3),
  duration_seconds     integer,
  forwarded_to         text,
  recording_url        text,                                   -- if Twilio recording enabled
  transcript_url       text,
  ai_total_turns       integer NOT NULL DEFAULT 0,
  ai_cost_micros       integer NOT NULL DEFAULT 0,
  lead_name            text,
  lead_email           text,
  lead_phone           text,
  intent               text,                                   -- detected purpose (booking, complaint, info, etc.)
  summary              text,                                   -- AI-generated end-of-call summary
  caller_country       text,
  caller_state         text,
  created_at           TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT phone_calls_direction_chk CHECK (direction IN ('inbound','outbound')),
  CONSTRAINT phone_calls_status_chk CHECK (status IN ('ringing','in-progress','completed','failed','no-answer','voicemail','forwarded'))
);
CREATE INDEX idx_phone_calls_org ON phone_calls(organization_id, started_at DESC);
CREATE INDEX idx_phone_calls_sid ON phone_calls(twilio_call_sid);

ALTER TABLE phone_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_calls FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON phone_calls
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));


-- ============================================================
-- phone_call_turns — per-turn conversation log
-- ============================================================
CREATE TABLE phone_call_turns (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id              uuid NOT NULL REFERENCES phone_calls(id) ON DELETE CASCADE,
  organization_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  turn_number          integer NOT NULL,
  role                 text NOT NULL,                          -- caller | assistant | system
  text                 text NOT NULL,                          -- caller speech transcript OR assistant response
  confidence           decimal(3,2),                           -- Twilio STT confidence 0..1
  tokens_in            integer,
  tokens_out           integer,
  cost_micros          integer,
  latency_ms           integer,
  created_at           TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT phone_call_turns_role_chk CHECK (role IN ('caller','assistant','system')),
  CONSTRAINT phone_call_turns_uniq UNIQUE (call_id, turn_number)
);
CREATE INDEX idx_phone_call_turns_call ON phone_call_turns(call_id, turn_number);

ALTER TABLE phone_call_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_call_turns FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON phone_call_turns
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));


-- ============================================================
-- phone_assistants — per-org AI receptionist config
-- ============================================================
CREATE TABLE phone_assistants (
  organization_id      uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  greeting             text NOT NULL DEFAULT 'Hi, thanks for calling. How can I help you today?',
  voice                text NOT NULL DEFAULT 'alice',          -- Twilio voice name (Polly.Joanna etc.)
  language             text NOT NULL DEFAULT 'en-US',
  max_turns            integer NOT NULL DEFAULT 12,
  end_call_phrases     text[] NOT NULL DEFAULT ARRAY['goodbye','bye now','have a good day','hang up'],
  handoff_phrases      text[] NOT NULL DEFAULT ARRAY['speak to a human','representative','manager','customer service'],
  handoff_number       text,                                   -- forward to this number on handoff
  business_hours       jsonb,                                  -- optional override of org hours
  custom_instructions  text,
  enabled              boolean NOT NULL DEFAULT false,
  updated_at           TIMESTAMP(3) NOT NULL DEFAULT now()
);

ALTER TABLE phone_assistants ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_assistants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON phone_assistants
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));


-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON phone_numbers     TO app_tenant_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON phone_calls       TO app_tenant_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON phone_call_turns  TO app_tenant_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON phone_assistants  TO app_tenant_user;
