-- Per-member tab/feature access restriction (settings/team invite flow).
--
-- Empty array = unrestricted (the default — every existing membership and
-- invitation keeps working exactly as before). A non-empty array whitelists
-- which sidebar tab keys (see lib/access/tabs.ts) the member can reach, on
-- top of whatever their role already permits.

ALTER TABLE memberships ADD COLUMN IF NOT EXISTS allowed_tabs TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS allowed_tabs TEXT[] NOT NULL DEFAULT '{}';
