-- Review-request tracking + owner-pasted review link (Outreach feature).
--
-- 1. Establishment.review_link_override — an owner-pasted "leave a review
--    here" link (e.g. a g.page/r/... short link). Review-request sends
--    prefer this over the auto-derived googlePlaceId link when set.
--    See lib/outreach/tracking.ts.
--
-- 2. review_requests.short_slug becomes UNIQUE — it now backs a real
--    lookup (app/r/[slug]/route.ts resolves it to record a click), not just
--    a generated-but-unused value. Verified zero existing duplicates before
--    this migration was written. Postgres allows multiple NULLs under a
--    unique index, so any legacy row without one is unaffected.

ALTER TABLE establishments ADD COLUMN IF NOT EXISTS review_link_override TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "review_requests_short_slug_key" ON review_requests(short_slug);
