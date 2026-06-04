import { createHash, createHmac, randomBytes } from "node:crypto";

/**
 * Slug + activation-code generation for physical Review Stand units.
 *
 * Two separate identifiers per device:
 *   - short_slug          = public, encoded in QR/NFC. 10-char Crockford base32 (50 bits entropy).
 *   - activation_code     = private, printed only on packaging insert. 5-char Crockford base32,
 *                           displayed as-is (short enough to read ungrouped). Stored as SHA-256 hash.
 *
 * Edge redirect verifies HMAC(slug || redirect_url || expires_at) to defeat KV poisoning.
 *
 * See BILLING_AND_HARDWARE.md §3.5.
 */

// Crockford base32 alphabet (no I, L, O, U to avoid ambiguity)
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const SLUG_LEN = 10;
const ACTIVATION_LEN = 5;

function randomCrockford(len: number): string {
  const buf = randomBytes(len);
  let s = "";
  for (let i = 0; i < len; i++) {
    // biome-ignore lint/style/noNonNullAssertion: index in range
    s += CROCKFORD[buf[i]! % 32];
  }
  return s;
}

export function generateSlug(): string {
  return randomCrockford(SLUG_LEN);
}

export function generateActivationCode(): { plaintext: string; hash: string; display: string } {
  const plaintext = randomCrockford(ACTIVATION_LEN);
  const hash = hashActivationCode(plaintext);
  // 5 chars is short enough to read without grouping, so display == plaintext.
  // (hashActivationCode still strips any dashes/spaces a user might type.)
  const display = plaintext;
  return { plaintext, hash, display };
}

export function hashActivationCode(code: string): string {
  // Strip dashes/whitespace and normalize case before hashing
  const normalized = code.replace(/[-\s]/g, "").toUpperCase();
  return createHash("sha256").update(normalized).digest("hex");
}

/**
 * HMAC signature for edge-redirect tamper detection.
 *
 * Signs: slug + redirect_url + expires_at (unix seconds)
 * The edge worker stores {redirect_url, expires_at, signature} in KV. If KV is poisoned and
 * `redirect_url` is swapped, the signature won't match.
 *
 * Secret lives in process.env.SLUG_HMAC_SECRET, mirrored into Cloudflare Secrets.
 */
export function signSlug(slug: string, redirectUrl: string, expiresAtUnix: number): string {
  const secret = process.env.SLUG_HMAC_SECRET;
  if (!secret) throw new Error("SLUG_HMAC_SECRET not set");
  return createHmac("sha256", secret)
    .update(`${slug}|${redirectUrl}|${expiresAtUnix}`)
    .digest("hex");
}

export function verifySlugSignature(
  slug: string,
  redirectUrl: string,
  expiresAtUnix: number,
  signature: string,
): boolean {
  const expected = signSlug(slug, redirectUrl, expiresAtUnix);
  // Constant-time comparison
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Generate a serial number for the unit (printed). Different from slug — this is
 * human-readable and used by ops for inventory tracking.
 *
 * Format: RB-{6-char}-{4-char}-{date}, e.g. RB-X7K2P1-A3M9-2026
 */
export function generateSerial(): string {
  const part1 = randomCrockford(6);
  const part2 = randomCrockford(4);
  const year = new Date().getFullYear();
  return `RB-${part1}-${part2}-${year}`;
}

/**
 * Build the Google review write URL from a Place ID. Falls back to a search URL
 * if Place ID is unknown.
 */
export function googleReviewUrl(placeId: string | null | undefined, businessName?: string): string {
  if (placeId && placeId.length > 5) {
    return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
  }
  if (businessName) {
    return `https://www.google.com/search?q=${encodeURIComponent(`${businessName} reviews`)}`;
  }
  return "https://www.google.com/";
}

/**
 * Open-redirect / phishing defense for QR destinations.
 *
 * The redirect route `/r/{slug}` proxies authenticated-tenant-controlled URLs.
 * Without a host allowlist, repulabs.com becomes a free first-hop for phishing
 * campaigns: attacker signs up, sets `redirectUrl = https://phish.example`,
 * shares `repulabs.com/r/ABCD123456` as a "trusted" link.
 *
 * Strategy:
 *   - REVIEW_HOSTS: known-good destinations that bypass the interstitial.
 *     These are the URLs Google's own review-link generator emits.
 *   - Everything else: allowed to be set, but `/r/{slug}` renders an
 *     interstitial ("You are leaving repulabs.com — destination: X") before
 *     redirecting. Defeats automated phishing flows; legit non-Google
 *     destinations still work after a click-through.
 *
 * Subdomain matching: an entry like `google.com` matches `foo.google.com`
 * (suffix match anchored on a dot). Bare match still allowed for `google.com`
 * itself. `goo.gl` matches only `goo.gl` (no dot prefix).
 */
const REVIEW_HOSTS: ReadonlyArray<string> = [
  "google.com", // covers www.google.com, search.google.com, maps.google.com, business.google.com, etc.
  "g.page",
  "goo.gl",
  "google.co.uk",
  "google.com.au",
  "google.co.in",
  "google.de",
  "google.fr",
  "google.es",
  "google.it",
  "google.com.pk",
  "google.ca",
  "google.nl",
];

/**
 * Returns true if the URL points to a known Google review host and can be
 * redirected without an interstitial. Anything else gets the interstitial.
 *
 * - Rejects non-http(s) schemes (defeats `javascript:`, `data:`, `file:`).
 * - Rejects IP-literal hosts (defeats `http://127.0.0.1`, `http://10.0.0.1`).
 * - Subdomain-aware: `business.google.com` matches `google.com`.
 */
export function isAllowedReviewHost(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const host = u.hostname.toLowerCase();
    // Reject raw IPv4 / IPv6 literals — never a legit review destination.
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return false;
    if (host.includes(":")) return false; // IPv6 in brackets etc.
    return REVIEW_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

/**
 * Validate that a URL is safe to store as a redirect target. Rejects
 * obviously-malicious schemes/hosts. NOT a guarantee the URL is a review
 * page — that's why `/r/{slug}` shows an interstitial for non-allowlisted
 * hosts.
 */
export function isStorableRedirectUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const host = u.hostname.toLowerCase();
    // Reject empty host (e.g. `http:///path`).
    if (!host) return false;
    // Reject IP-literal hosts to defeat SSRF-style abuse via the redirect.
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return false;
    if (host === "localhost" || host.endsWith(".localhost")) {
      // Allow only in dev to keep local testing working.
      return process.env.NODE_ENV !== "production";
    }
    return true;
  } catch {
    return false;
  }
}
