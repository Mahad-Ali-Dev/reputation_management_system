/**
 * Strict secret resolver — fails CLOSED in production.
 *
 * In development we allow weak fallbacks so localhost works without setup.
 * In production (NODE_ENV=production or VERCEL_ENV in {production, preview}),
 * absence of the env var throws — we never silently use a known-public string
 * to sign tokens that grant capability (unsubscribes, OAuth state, etc.).
 *
 * This closes the bug where forged `t=...&s=...` tokens worked because the
 * HMAC secret was the literal `"fallback-secret-do-not-use"`.
 */

function isProd(): boolean {
  return process.env.NODE_ENV === "production"
    || process.env.VERCEL_ENV === "production"
    || process.env.VERCEL_ENV === "preview";
}

function requireOrFallback(envName: string, devFallback: string): string {
  const v = process.env[envName];
  if (v && v.length > 0) return v;
  if (isProd()) {
    throw new Error(`secrets: ${envName} is required in production`);
  }
  // dev only — log once so it's noticed but don't crash localhost
  if (typeof globalThis !== "undefined") {
    const key = `__secret_warned_${envName}`;
    if (!(globalThis as Record<string, unknown>)[key]) {
      // eslint-disable-next-line no-console
      console.warn(`[secrets] ${envName} not set — using INSECURE dev fallback. Set it before deploying.`);
      (globalThis as Record<string, unknown>)[key] = true;
    }
  }
  return devFallback;
}

/**
 * Secret used to sign HMAC tokens — unsubscribe links, signed slugs, etc.
 * Reuses AUTH_SECRET (already required by Auth.js).
 */
export function getHmacSecret(): string {
  return requireOrFallback("AUTH_SECRET", "dev-only-INSECURE-do-not-use-in-prod");
}

/**
 * Secret used for unsubscribe URL signatures. Falls back to AUTH_SECRET.
 */
export function getUnsubscribeSecret(): string {
  const v = process.env.UNSUBSCRIBE_SECRET;
  if (v && v.length > 0) return v;
  return getHmacSecret();
}

/**
 * Cron bearer token. If unset in production, cron endpoints must refuse
 * the request rather than allowing public access.
 */
export function getCronSecret(): string | null {
  const v = process.env.CRON_SECRET;
  if (v && v.length > 0) return v;
  if (isProd()) {
    throw new Error("secrets: CRON_SECRET is required in production");
  }
  return null;
}

/**
 * Check cron-route auth header. Returns true if allowed.
 *
 * Behavior:
 *   - In production with no CRON_SECRET set → throws at import time (see above)
 *   - In production with CRON_SECRET set → strict bearer match
 *   - In dev with no CRON_SECRET → allow (return true)
 *   - In dev with CRON_SECRET set → strict bearer match
 *
 * This is fail-closed: prod always requires both a configured secret and a
 * matching header.
 */
export function verifyCronRequest(authHeader: string | null): boolean {
  const expected = getCronSecret();  // throws in prod if unset
  if (!expected) return true;        // dev mode, no secret configured
  return authHeader === `Bearer ${expected}`;
}
