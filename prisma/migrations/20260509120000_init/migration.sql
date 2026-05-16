-- RepuBoost — initial migration: extensions, RLS function, base tables, RLS policies, audit triggers.
-- This migration intentionally bundles the schema + security primitives so Day 1 deploys with security on.

-- ============================================================
-- Extensions
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";    -- case-insensitive emails

-- ============================================================
-- RLS context function (CRITICAL: subselect form, evaluated once per query)
-- See DATA_MODEL.md §6.1
-- ============================================================
CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.current_org() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE AS
  $$ SELECT NULLIF(current_setting('app.current_org_id', true), '')::uuid $$;

COMMENT ON FUNCTION app.current_org() IS
  'Returns the current tenant org id from the session GUC. Returns NULL if unset → RLS denies all rows.';

-- ============================================================
-- Tables (bare bones — Prisma generates the rest, but we add RLS here)
-- ============================================================

CREATE TABLE organizations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL,
  slug                  text UNIQUE NOT NULL,
  plan                  text NOT NULL DEFAULT 'trial',
  trial_ends_at         timestamptz,
  stripe_customer_id    text UNIQUE,
  onboarding_step       integer NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz,
  CONSTRAINT organizations_plan_chk CHECK (plan IN ('trial','pro','suspended','free'))
);
CREATE INDEX idx_org_plan ON organizations(plan);
CREATE INDEX idx_org_stripe ON organizations(stripe_customer_id);

CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           citext UNIQUE NOT NULL,
  name            text,
  email_verified  timestamptz,
  image           text,
  password_hash   text,
  totp_secret     text,
  last_login_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE accounts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type                  text NOT NULL,
  provider              text NOT NULL,
  provider_account_id   text NOT NULL,
  refresh_token         text,
  access_token          text,
  expires_at            integer,
  token_type            text,
  scope                 text,
  id_token              text,
  session_state         text,
  UNIQUE (provider, provider_account_id)
);
CREATE INDEX idx_accounts_user ON accounts(user_id);

CREATE TABLE sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token   text UNIQUE NOT NULL,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires         timestamptz NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE verification_tokens (
  identifier  text NOT NULL,
  token       text UNIQUE NOT NULL,
  expires     timestamptz NOT NULL,
  PRIMARY KEY (identifier, token)
);

CREATE TABLE memberships (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id),
  CONSTRAINT memberships_role_chk CHECK (role IN ('owner','admin','manager','member','viewer'))
);
CREATE INDEX idx_membership_user ON memberships(user_id);

CREATE TABLE invitations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  email           citext NOT NULL,
  role            text NOT NULL,
  token_hash      text NOT NULL,
  expires_at      timestamptz NOT NULL,
  accepted_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_invitations_org ON invitations(organization_id);
CREATE INDEX idx_invitations_token ON invitations(token_hash);

CREATE TABLE admin_users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           citext UNIQUE NOT NULL,
  password_hash   text NOT NULL,
  totp_secret     text NOT NULL,
  role            text NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  last_ip         inet,
  last_login_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_users_role_chk CHECK (role IN ('super_admin','support','finance','engineering'))
);

CREATE TABLE subscriptions (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id             uuid UNIQUE NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  stripe_subscription_id      text UNIQUE,
  plan                        text NOT NULL,
  status                      text NOT NULL,
  current_period_end          timestamptz,
  cancel_at_period_end        boolean NOT NULL DEFAULT false,
  trial_ends_at               timestamptz,
  stripe_event_created_at     timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscriptions_status_chk CHECK (status IN ('trialing','active','past_due','canceled','unpaid','incomplete','incomplete_expired'))
);
CREATE INDEX idx_sub_status ON subscriptions(status);

CREATE TABLE webhook_deliveries (
  provider          text NOT NULL,
  external_id       text NOT NULL,
  organization_id   uuid REFERENCES organizations(id),
  received_at       timestamptz NOT NULL DEFAULT now(),
  payload_sha256    text NOT NULL,
  status            text NOT NULL,
  processed_at      timestamptz,
  error             text,
  PRIMARY KEY (provider, external_id),
  CONSTRAINT webhook_deliveries_status_chk CHECK (status IN ('accepted','rejected_signature','replay','error','processed'))
);
CREATE INDEX idx_wd_received ON webhook_deliveries(received_at);
CREATE INDEX idx_wd_org ON webhook_deliveries(organization_id);

CREATE TABLE oauth_state_consumed (
  nonce             text PRIMARY KEY,
  organization_id   uuid NOT NULL,
  user_id           uuid NOT NULL,
  provider          text NOT NULL,
  consumed_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_oauth_consumed_at ON oauth_state_consumed(consumed_at);

-- ============================================================
-- Audit log: append-only via trigger
-- ============================================================
CREATE TABLE audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  actor_type      text NOT NULL,
  actor_id        uuid NOT NULL,
  action          text NOT NULL,
  resource_type   text,
  resource_id     uuid,
  before_data     jsonb,
  after_data      jsonb,
  ip              inet,
  user_agent      text,
  prev_hash       bytea,
  row_hash        bytea,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_log_actor_type_chk CHECK (actor_type IN ('user','admin_user','system'))
);
CREATE INDEX idx_audit_org_time ON audit_log(organization_id, created_at DESC);
CREATE INDEX idx_audit_actor ON audit_log(actor_id, created_at DESC);
CREATE INDEX idx_audit_resource ON audit_log(resource_type, resource_id, created_at DESC);

CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only (attempted % by %)', TG_OP, current_user;
END;
$$;

CREATE TRIGGER trg_audit_log_immutable
BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_log
FOR EACH STATEMENT EXECUTE FUNCTION audit_log_immutable();
