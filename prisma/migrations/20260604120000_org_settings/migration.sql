-- =========================================================================
-- Organization.settings — free-form workspace settings JSON blob
-- =========================================================================
--
-- Backs `updateSecurityPrefs` (lib/account/actions.ts), which previously wrote
-- an audit row but had nowhere to persist the parsed preferences — a silent
-- no-op. Settings → Security now reads + writes `settings->'security'`.
--
-- Nullable with no default: a NULL settings column means "no overrides yet",
-- which the app coalesces to defaults. Rolling forward without app changes is
-- safe. Existing table-level GRANTs cover the new column, and the existing
-- `tenant_isolation` RLS policy (FOR ALL) already governs row access — no
-- policy change required.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS settings jsonb;
