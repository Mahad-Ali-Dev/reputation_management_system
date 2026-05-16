import { createHash, createHmac, randomBytes } from "node:crypto";

/**
 * Slug + activation-code generation for physical Review Stand units.
 *
 * Two separate identifiers per device:
 *   - short_slug          = public, encoded in QR/NFC. 10-char Crockford base32 (50 bits entropy).
 *   - activation_code     = private, printed only on packaging insert. 8-char Crockford base32,
 *                           displayed as XXXX-XXXX. Stored as SHA-256 hash.
 *
 * Edge redirect verifies HMAC(slug || redirect_url || expires_at) to defeat KV poisoning.
 *
 * See BILLING_AND_HARDWARE.md §3.5.
 */

// Crockford base32 alphabet (no I, L, O, U to avoid ambiguity)
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const SLUG_LEN = 10;
const ACTIVATION_LEN = 8;

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
  // Display as XXXX-XXXX for readability
  const display = `${plaintext.slice(0, 4)}-${plaintext.slice(4)}`;
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
