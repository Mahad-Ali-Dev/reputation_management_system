-- Day 4: hardware products, orders, devices, scans.
-- See DATA_MODEL.md §3.4 + BILLING_AND_HARDWARE.md §3.

-- ============================================================
-- hardware_products (global catalog)
-- ============================================================
CREATE TABLE hardware_products (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku           text UNIQUE NOT NULL,                       -- STAND_V1, PLAQUE_V1, CARD_PACK_50, STAND_PRO_5PK
  name          text NOT NULL,
  description   text,
  price_cents   integer NOT NULL,
  currency      text NOT NULL DEFAULT 'USD',
  has_nfc       boolean NOT NULL DEFAULT false,
  units_per_pack integer NOT NULL DEFAULT 1,                -- how many devices this SKU provisions
  image_url     text,
  stripe_price_id text,                                     -- Stripe Price ID for one-time checkout
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    TIMESTAMP(3) NOT NULL DEFAULT now()
);
-- Read-only for app_tenant_user; admin/seed inserts via owner role.

-- Seed the V1 product
INSERT INTO hardware_products (sku, name, description, price_cents, has_nfc, units_per_pack, sort_order)
VALUES ('STAND_V1', 'Review Stand', 'Countertop QR + NFC display. One unit per pack.', 2900, true, 1, 1);

-- ============================================================
-- hardware_orders
-- ============================================================
CREATE TABLE hardware_orders (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  status                   text NOT NULL DEFAULT 'pending',  -- pending | paid | printing | shipped | delivered | cancelled
  shipping_address         jsonb NOT NULL,                    -- {name, line1, line2, city, region, postal, country}
  total_cents              integer NOT NULL,
  currency                 text NOT NULL DEFAULT 'USD',
  stripe_session_id        text UNIQUE,                       -- Checkout Session ID
  stripe_payment_intent_id text UNIQUE,
  carrier                  text,
  tracking_number          text,
  shipped_at               TIMESTAMP(3),
  delivered_at             TIMESTAMP(3),
  created_at               TIMESTAMP(3) NOT NULL DEFAULT now(),
  updated_at               TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT hardware_orders_status_chk CHECK (status IN
    ('pending','paid','printing','shipped','delivered','cancelled','refunded'))
);
CREATE INDEX idx_ho_org_status ON hardware_orders(organization_id, status, created_at DESC);

ALTER TABLE hardware_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE hardware_orders FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hardware_orders
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));

-- ============================================================
-- hardware_order_items
-- ============================================================
CREATE TABLE hardware_order_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            uuid NOT NULL REFERENCES hardware_orders(id) ON DELETE CASCADE,
  product_id          uuid NOT NULL REFERENCES hardware_products(id),
  establishment_id    uuid REFERENCES establishments(id),    -- which establishment these units are for (nullable: assigned at activation)
  quantity            integer NOT NULL CHECK (quantity > 0),
  unit_price_cents    integer NOT NULL
);
CREATE INDEX idx_hoi_order ON hardware_order_items(order_id);

-- No RLS on order_items directly — accessed through joins on hardware_orders which IS RLS-scoped.
-- But add the grant for the tenant role.

-- ============================================================
-- devices (one row per physical unit in the field)
-- ============================================================
CREATE TABLE devices (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           uuid REFERENCES organizations(id),     -- nullable until activated
  establishment_id          uuid REFERENCES establishments(id),     -- nullable until activated
  order_id                  uuid REFERENCES hardware_orders(id) ON DELETE SET NULL,
  product_sku               text NOT NULL,                          -- denormalized for analytics
  serial                    text UNIQUE NOT NULL,                   -- printed on the unit
  short_slug                text UNIQUE NOT NULL,                   -- 10-char Crockford base32 → r.repuboost.io/{slug}
  slug_signature            text NOT NULL,                          -- HMAC for edge tamper-proofing
  nfc_uid                   text UNIQUE,
  activation_code_hash      text NOT NULL,                          -- SHA-256 of one-time activation code
  activation_code_used_at   TIMESTAMP(3),
  redirect_url              text,                                   -- nullable until activated
  redirect_mode             text NOT NULL DEFAULT 'direct',         -- direct | smart_route
  redirect_changed_at       TIMESTAMP(3),
  status                    text NOT NULL DEFAULT 'unactivated',    -- unactivated | active | paused | rma | retired
  scan_count                integer NOT NULL DEFAULT 0,
  last_scan_at              TIMESTAMP(3),
  activated_at              TIMESTAMP(3),
  created_at                TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT devices_status_chk CHECK (status IN
    ('unactivated','active','paused','rma','retired')),
  CONSTRAINT devices_mode_chk CHECK (redirect_mode IN ('direct','smart_route')),
  CONSTRAINT devices_redirect_when_active CHECK (status='unactivated' OR redirect_url IS NOT NULL)
);
CREATE INDEX idx_dev_slug ON devices(short_slug);
CREATE INDEX idx_dev_org_status ON devices(organization_id, status) WHERE organization_id IS NOT NULL;
CREATE INDEX idx_dev_unactivated ON devices(activation_code_hash) WHERE status = 'unactivated';
CREATE INDEX idx_dev_estab ON devices(establishment_id) WHERE establishment_id IS NOT NULL;

ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices FORCE ROW LEVEL SECURITY;
-- Allow read access to unactivated devices only via activation_code_hash lookup (handled in API code).
-- Tenant policy: only see your org's devices.
CREATE POLICY tenant_isolation ON devices
  USING       (organization_id IS NULL OR organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id IS NULL OR organization_id = (SELECT app.current_org()));

-- ============================================================
-- device_scans (lightweight scan log — feeds analytics)
-- ============================================================
CREATE TABLE device_scans (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id         uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  organization_id   uuid REFERENCES organizations(id),
  scan_id           text NOT NULL,                          -- HMAC-bound, idempotency key
  scanned_at        TIMESTAMP(3) NOT NULL DEFAULT now(),
  user_agent        text,
  ip                inet,
  country           text,
  UNIQUE (device_id, scan_id)
);
CREATE INDEX idx_scans_device_time ON device_scans(device_id, scanned_at DESC);
CREATE INDEX idx_scans_org_time ON device_scans(organization_id, scanned_at DESC)
  WHERE organization_id IS NOT NULL;

ALTER TABLE device_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_scans FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON device_scans
  USING       (organization_id IS NULL OR organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id IS NULL OR organization_id = (SELECT app.current_org()));

-- ============================================================
-- Grants to app_tenant_user
-- ============================================================
GRANT SELECT ON hardware_products TO app_tenant_user;
GRANT SELECT, INSERT, UPDATE ON hardware_orders TO app_tenant_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON hardware_order_items TO app_tenant_user;
GRANT SELECT, INSERT, UPDATE ON devices TO app_tenant_user;
GRANT SELECT, INSERT, UPDATE ON device_scans TO app_tenant_user;
