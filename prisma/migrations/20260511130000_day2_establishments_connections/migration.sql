-- Day 2: establishments + connections (with envelope-encrypted OAuth tokens) + RLS + grants.
-- See DATA_MODEL.md §3.2 + §3.3.

-- ============================================================
-- establishments
-- ============================================================
CREATE TABLE establishments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name              text NOT NULL,
  category          text,                                     -- restaurant | dental | salon | retail | ...
  address           jsonb,                                    -- {line1, city, region, postal, country, lat, lng}
  timezone          text NOT NULL DEFAULT 'UTC',
  brand_voice       jsonb,                                    -- {tone, do_not_say, signature, ...}
  business_hours    jsonb,
  google_place_id   text,
  created_at        TIMESTAMP(3) NOT NULL DEFAULT now(),
  updated_at        TIMESTAMP(3) NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMP(3)
);
CREATE INDEX idx_estab_org ON establishments(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_estab_place ON establishments(google_place_id) WHERE google_place_id IS NOT NULL;

ALTER TABLE establishments ENABLE ROW LEVEL SECURITY;
ALTER TABLE establishments FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON establishments
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));

-- ============================================================
-- connections (OAuth — envelope-encrypted at rest)
-- ============================================================
CREATE TABLE connections (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  establishment_id    uuid REFERENCES establishments(id) ON DELETE CASCADE,
  provider            text NOT NULL,                          -- google_business | meta | linkedin | x | shopify | woocommerce | square | hubspot | salesforce | quickbooks | xero
  account_label       text,                                   -- "Acme Pizza FB Page"
  external_id         text,                                   -- provider's account id
  access_token_ct     bytea NOT NULL,                         -- AES-GCM ciphertext
  refresh_token_ct    bytea,
  dek_ciphertext      bytea NOT NULL DEFAULT '\x',            -- KMS-wrapped DEK (v1 derives, so empty)
  key_version         integer NOT NULL DEFAULT 1,
  encryption_ctx      jsonb NOT NULL,                         -- {org_id, provider, purpose}
  iv                  bytea NOT NULL,
  token_expires_at    TIMESTAMP(3),
  scopes              text[],
  status              text NOT NULL DEFAULT 'active',         -- active | revoked | expired | error
  last_synced_at      TIMESTAMP(3),
  created_at          TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT connections_provider_chk CHECK (provider IN (
    'google_business','meta','linkedin','x','shopify','woocommerce',
    'square','hubspot','salesforce','quickbooks','xero'
  )),
  CONSTRAINT connections_status_chk CHECK (status IN ('active','revoked','expired','error'))
);
CREATE INDEX idx_conn_org_provider ON connections(organization_id, provider, status);
CREATE INDEX idx_conn_key_rotation ON connections(key_version) WHERE status = 'active';

ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON connections
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));

-- ============================================================
-- Grants to app_tenant_user
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON establishments, connections TO app_tenant_user;
