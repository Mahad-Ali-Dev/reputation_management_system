-- Two-factor authentication (TOTP / Google Authenticator).
--
-- totp_secret (already existed) holds the encrypted TOTP secret once set up.
-- totp_enabled flips true only after the user proves possession by entering
-- a valid code (see lib/account/two-factor-actions.ts). totp_backup_codes
-- stores sha256 hashes only — the plaintext codes are shown once and never
-- persisted. totp_last_used_step blocks replaying the same still-valid code
-- twice within its 30s window.
--
-- sessions.two_factor_verified tracks whether THIS session has passed TOTP
-- verification (lib/auth/active-org.ts gates every tenant page on it once
-- totp_enabled is true) — set by our own code, never by the Auth.js adapter.

ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_backup_codes TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_last_used_step INTEGER;

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS two_factor_verified BOOLEAN NOT NULL DEFAULT false;
