-- review_requests_status_chk was written for the Day 6 status set
-- (queued/sent/delivered/failed/unsubscribed/bounced/converted) and never
-- widened when later work introduced more states:
--   - "scheduled"/"sending" — lib/outreach/enqueue.ts,
--     app/api/cron/dispatch-review-requests/route.ts (the future-dated-send
--     and inline-claim states)
--   - "opened"/"clicked"    — app/api/webhooks/resend/route.ts (Resend's
--     own email-open/click tracking)
--
-- Every send with delayHours=0 hits the "sending" claim update, so ANY
-- immediate send was rolling back with Postgres 23514 — this is what "Could
-- not send the request" in the UI actually was. The Resend webhook writing
-- "opened"/"clicked" was failing the same way, just silently (no UI to
-- surface it), so per-request open/click tracking on the status field alone
-- has likely never worked either.

ALTER TABLE review_requests DROP CONSTRAINT IF EXISTS review_requests_status_chk;
ALTER TABLE review_requests ADD CONSTRAINT review_requests_status_chk CHECK (status IN
  ('queued','scheduled','sending','sent','delivered','opened','clicked','bounced','unsubscribed','converted','failed'));
