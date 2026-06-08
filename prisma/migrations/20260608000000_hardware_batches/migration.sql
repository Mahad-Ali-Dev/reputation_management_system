-- =========================================================================
-- hardware_batches — admin factory production runs (bulk QR/NFC generation)
-- =========================================================================
--
-- WRITTEN but NOT executed by the build (no `prisma migrate`). The founder runs
-- it MANUALLY as a deploy step, AFTER the code ships. Mirrors the deploy model
-- of 20260607020000_master_delta.
--
-- GLOBAL / ADMIN-ONLY table:
--   * NO organization_id, NO RLS policy, NO GRANT to app_tenant_user.
--   * Touched ONLY by the admin API path (getAdminSession + super_admin/
--     engineering role guard), which runs as the direct `prisma` client — i.e.
--     the BYPASSRLS owner role (neondb_owner). This matches how admin_users and
--     the admin-side audit_log writes already work: owner-role only, no tenant
--     grant. A new table with NO grant to app_tenant_user is simply invisible to
--     the tenant role, which is exactly the intent.
--
-- encrypted_codes: envelope-encrypted (AES-256-GCM, see lib/crypto/envelope.ts)
-- JSON blob of the plaintext activation codes, kept ONLY so the admin can
-- re-download the production ZIP once if the original streamed download was lost
-- (the nginx-502-on-500 bug). Purged (set NULL + status='expired') after the
-- first successful re-download or once expires_at passes. Never logged.
-- =========================================================================

CREATE TABLE IF NOT EXISTS hardware_batches (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_sku           text NOT NULL,
  product_kind          text NOT NULL DEFAULT 'qr',          -- qr | nfc | wifi | multi_platform
  quantity              integer NOT NULL,
  status                text NOT NULL DEFAULT 'ready',        -- ready | downloaded | expired
  notes                 text,
  created_by_admin_id   text,                                 -- admin_users.id (admin session is JWT, no FK)
  download_count        integer NOT NULL DEFAULT 0,
  encrypted_codes       bytea,                                -- envelope-encrypted JSON; iv prepended to ciphertext
  blob_url              text,                                 -- optional @vercel/blob mirror of the ZIP
  expires_at            TIMESTAMP(3),
  created_at            TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT hardware_batches_status_chk CHECK (status IN ('ready','downloaded','expired')),
  CONSTRAINT hardware_batches_kind_chk   CHECK (product_kind IN ('qr','nfc','wifi','multi_platform')),
  CONSTRAINT hardware_batches_qty_chk    CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS hardware_batches_status_created_idx
  ON hardware_batches (status, created_at DESC);

-- INTENTIONALLY no RLS and no GRANT to app_tenant_user. Owner-role (admin path)
-- only. Do NOT add `GRANT ... TO app_tenant_user` here — that would expose
-- every tenant's plaintext re-download blob to the tenant role.
