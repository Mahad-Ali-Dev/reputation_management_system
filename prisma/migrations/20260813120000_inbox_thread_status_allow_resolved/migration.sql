-- Align the inbox_threads status CHECK with the vocabulary the application
-- actually speaks.
--
-- The original constraint allowed ('open','snoozed','closed','spam'), but the
-- app has always used 'resolved': lib/inbox/queries.ts types InboxStatus as
-- "open" | "resolved" | "snoozed" | "spam", the support UI filters and labels on
-- 'resolved', and the string 'closed' appears NOWHERE in lib/inbox. So the
-- livechat stale sweep — which closes idle sessions by writing 'resolved' — hit
-- a 23514 constraint violation on every run, every 5 minutes, and no session was
-- ever swept.
--
-- Widened rather than swapped: 'closed' stays permitted so any historical row
-- written under the old vocabulary remains valid and this needs no data
-- backfill.
ALTER TABLE inbox_threads DROP CONSTRAINT IF EXISTS inbox_threads_status_chk;
ALTER TABLE inbox_threads
  ADD CONSTRAINT inbox_threads_status_chk
  CHECK (status IN ('open','snoozed','resolved','closed','spam'));
