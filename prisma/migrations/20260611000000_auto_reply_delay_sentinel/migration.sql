-- Admit the randomized-window sentinel in auto_reply_rules.delay_minutes.
--
-- The page-level "Auto-Reply to 5-Star Reviews" toggle materializes its
-- managed rule with delay_minutes = -1 — the AUTO_REPLY_RANDOMIZED_SENTINEL
-- (lib/auto-reply/schedule.ts) that means "randomized 2–4h publish window".
-- The original check (0..1440) predates the sentinel, so the very first
-- enable violated auto_reply_rules_delay_chk (Postgres 23514) and the toggle
-- could never turn on (bug 004 in the June 2026 assessment, digest 1899587870).

ALTER TABLE auto_reply_rules DROP CONSTRAINT IF EXISTS auto_reply_rules_delay_chk;
ALTER TABLE auto_reply_rules ADD CONSTRAINT auto_reply_rules_delay_chk
  CHECK (delay_minutes BETWEEN -1 AND 1440);
