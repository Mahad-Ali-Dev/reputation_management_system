-- =========================================================================
-- gmail_sync — Gmail 2-way mailbox sync (ReviewBoost parity).
--
-- Operators connect a Gmail mailbox (provider="gmail" on the existing
-- `connections` table). The cron poller (app/api/cron/gmail-sync) reads new
-- inbox messages and ingests them as InboxThread/InboxMessage rows on the
-- "email" channel; replies send back through the Gmail API.
--
-- This migration adds ONE nullable column to the existing `connections` table:
--   * sync_cursor — a free-text per-connection cursor. For gmail it stores the
--     last processed message internalDate (epoch ms, as a string) so the poller
--     only fetches newer messages each run.
--
-- `connections` is ALREADY a tenant table with RLS enabled + the
-- tenant_isolation policy + GRANT to app_tenant_user (see the original
-- connections migration). Adding a nullable column inherits all of that — no
-- new RLS/GRANT boilerplate is required for an ADD COLUMN on an existing,
-- already-protected table.
--
-- WRITTEN but NOT executed by the build (no `prisma migrate`). The founder runs
-- it MANUALLY as a deploy step, AFTER the code ships — mirrors the deploy model
-- of the other recent migrations (e.g. 20260609000000_meeting_requests).
-- =========================================================================

ALTER TABLE connections
  ADD COLUMN IF NOT EXISTS sync_cursor TEXT;
