-- =====================================================================
-- Wave 3a (14_connections) — widen connections_provider_chk for NEW
-- provider ids the Connections module now writes.
--
-- ⚠ MANUAL DEPLOY ONLY. The founder applies this by hand after review.
-- It is NOT auto-run by the build (the coder never runs `prisma migrate`),
-- and the application code FAILS SOFT on Postgres 23514 (check_violation)
-- and 42703/42P01 (treats them as "provider not configured", never a 500),
-- so the app stays green whether or not this has been applied yet.
--
-- Why this exists, even though 20260607020000_master_delta already widened
-- the constraint: Wave 3a adds POS adapters whose connection rows use the
-- provider strings `toast` and `clover`, which the master_delta widening did
-- NOT include. Inserting a `toast`/`clover` connection therefore throws
-- 23514 until this runs. (`meta`/`square`/`square_pos` are already covered by
-- master_delta and are repeated here only so this constraint is a complete,
-- self-describing allow-list — DROP + re-CREATE makes the final set explicit.)
--
-- Pattern mirrors master_delta: DROP IF EXISTS, then ADD with the full set
-- (original day2 values + master_delta widening + the new Wave-3a POS values).
-- =====================================================================

ALTER TABLE connections
  DROP CONSTRAINT IF EXISTS connections_provider_chk;

ALTER TABLE connections
  ADD  CONSTRAINT connections_provider_chk
       CHECK (provider IN (
         -- original day2 allowed set (kept for back-compat)
         'google_business','meta','linkedin','x','shopify','woocommerce',
         'square','hubspot','salesforce','quickbooks','xero',
         -- master_delta widening: providers earlier callbacks already send
         'facebook','instagram','square_pos','mailchimp','klaviyo',
         'google','twitter',
         -- Wave 3a (14_connections) NEW providers:
         --   POS adapters (Toast/Clover) + Square POS alias.
         'toast','toast_pos','clover','clover_pos','zoho'
       ));

COMMENT ON CONSTRAINT connections_provider_chk ON connections IS
  'Widened 2026-06 (Wave 3a): adds toast/clover (+aliases) and zoho on top of the master_delta set. App code fail-soft on 23514 so an un-applied constraint never 500s a callback.';
