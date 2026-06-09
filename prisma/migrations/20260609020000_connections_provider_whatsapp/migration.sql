-- =====================================================================
-- Module 09 (Unified Inbox — WhatsApp) — widen connections_provider_chk so
-- a `provider="whatsapp"` Connection row can be inserted.
--
-- The WhatsApp webhook (app/api/webhooks/whatsapp) resolves an org by
-- looking up Connection(provider:"whatsapp", externalId=phone_number_id) and
-- the outbound send path (lib/inbox/whatsapp-send) reads that same row's
-- encrypted access token. The connect flow (the manager-gated paste form on
-- /connections/whatsapp) creates that row via the shared `saveConnection`
-- helper — but the CHECK constraint last widened in
-- 20260607030000_connections_provider_widen does NOT list `whatsapp`, so the
-- INSERT would throw Postgres 23514 (check_violation) until this runs.
--
-- We also add `gmail` here: the Gmail mailbox callback
-- (app/api/connections/gmail/callback) already writes `provider="gmail"` and
-- was likewise missing from the allow-list (a latent 23514). Both are folded
-- in so the constraint stays a complete, self-describing allow-list.
--
-- ⚠ MANUAL DEPLOY ONLY. The founder applies this by hand after review. It is
-- NOT auto-run by the build (the coder never runs `prisma migrate`), and the
-- application code FAILS SOFT on 23514 (treated as "provider not configured",
-- never a 500) via saveConnectionSoft, so the app stays green whether or not
-- this has been applied yet.
--
-- Pattern mirrors 20260607030000_connections_provider_widen: DROP IF EXISTS,
-- then ADD with the full set (every prior value + the two new ones).
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
         -- Wave 3a (14_connections): POS adapters + Square POS alias + zoho
         'toast','toast_pos','clover','clover_pos','zoho',
         -- Module 09 (Unified Inbox): WhatsApp Business + Gmail mailbox
         'whatsapp','gmail'
       ));

COMMENT ON CONSTRAINT connections_provider_chk ON connections IS
  'Widened 2026-06 (Module 09): adds whatsapp + gmail on top of the Wave-3a set. App code is fail-soft on 23514 so an un-applied constraint never 500s a connect.';
