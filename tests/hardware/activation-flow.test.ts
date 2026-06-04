import {
  generateActivationCode,
  generateSlug,
  googleReviewUrl,
  hashActivationCode,
  isAllowedReviewHost,
  isStorableRedirectUrl,
  signSlug,
  verifySlugSignature,
} from "@/lib/hardware/codes";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * End-to-end QR / activation chain (pure logic — no DB). Mirrors the real flow:
 *   admin batch   → 10-char slug + 5-char activation code (SHA-256 hashed)
 *   end user      → types the code, picks a business / pastes a Google URL
 *   /r/{slug}     → verifies the HMAC signature, then direct-redirects to the
 *                   Google review form (or interstitial for non-Google hosts)
 *
 * The load-bearing invariant: the expiry `/r/[slug]/route.ts` recomputes from
 * `device.activatedAt` MUST equal the expiry every signer signed over. If a
 * signer uses a different clock instant, the QR is silently bricked.
 */

const SLUG_RE = /^[0-9A-HJKMNP-TV-Z]{10}$/; // keep in sync with app/r/[slug]/route.ts
const FIVE_YEARS = 60 * 60 * 24 * 365 * 5;

// How app/r/[slug]/route.ts derives the expiry from the stored activatedAt.
function expiryFromActivatedAt(activatedAt: Date): number {
  return Math.floor(activatedAt.getTime() / 1000) + FIVE_YEARS;
}

beforeAll(() => {
  process.env.SLUG_HMAC_SECRET =
    process.env.SLUG_HMAC_SECRET ?? "test-slug-hmac-secret-at-least-32-chars-long";
});

describe("QR slug format", () => {
  it("every generated slug matches the redirect route's accepted pattern", () => {
    for (let i = 0; i < 500; i++) expect(generateSlug()).toMatch(SLUG_RE);
  });
});

describe("activation code", () => {
  it("is 5 Crockford chars, displayed ungrouped", () => {
    const { plaintext, display } = generateActivationCode();
    expect(plaintext).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}$/);
    expect(display).toBe(plaintext);
  });

  it("hashes case-, dash-, and whitespace-insensitively (matches what the user types)", () => {
    const { plaintext, hash, display } = generateActivationCode();
    expect(hashActivationCode(plaintext)).toBe(hash);
    expect(hashActivationCode(display)).toBe(hash);
    expect(hashActivationCode(plaintext.toLowerCase())).toBe(hash);
    expect(hashActivationCode(`  ${display}  `)).toBe(hash); // stray whitespace
    expect(hashActivationCode("AAA-BB")).not.toBe(hash); // a different code never collides
  });
});

describe("signature expiry invariant (brick-the-QR regression guard)", () => {
  it("activation: signing over the persisted activatedAt verifies at scan time", () => {
    const slug = generateSlug();
    const reviewUrl = googleReviewUrl("ChIJtestplaceid123456");
    // activateDevice reads the clock ONCE for both signing and storage.
    const activatedAt = new Date("2026-06-04T12:00:00.500Z");
    const sig = signSlug(slug, reviewUrl, expiryFromActivatedAt(activatedAt));
    expect(verifySlugSignature(slug, reviewUrl, expiryFromActivatedAt(activatedAt), sig)).toBe(
      true,
    );
  });

  it("rejects a signature whose expiry base differs from the stored activatedAt (the fixed bug)", () => {
    const slug = generateSlug();
    const reviewUrl = googleReviewUrl("ChIJtestplaceid123456");
    // Buggy pattern: sign over one instant, store a different one across a second boundary.
    const signInstant = new Date("2026-06-04T12:00:00.900Z");
    const storedActivatedAt = new Date("2026-06-04T12:00:01.100Z"); // next whole second
    const sig = signSlug(slug, reviewUrl, expiryFromActivatedAt(signInstant));
    expect(
      verifySlugSignature(slug, reviewUrl, expiryFromActivatedAt(storedActivatedAt), sig),
    ).toBe(false);
  });

  it("refresh/edit: re-signing over the UNCHANGED original activatedAt still verifies", () => {
    const slug = generateSlug();
    const activatedAt = new Date("2026-01-01T00:00:00Z"); // original activation, never reset
    const newUrl = googleReviewUrl("ChIJnewplaceafterplacechange");
    const sig = signSlug(slug, newUrl, expiryFromActivatedAt(activatedAt));
    expect(verifySlugSignature(slug, newUrl, expiryFromActivatedAt(activatedAt), sig)).toBe(true);
  });

  it("rejects redirect_url tampering (KV poisoning / DB tamper)", () => {
    const slug = generateSlug();
    const exp = expiryFromActivatedAt(new Date("2026-06-04T00:00:00Z"));
    const sig = signSlug(slug, googleReviewUrl("ChIJgoodplace"), exp);
    expect(verifySlugSignature(slug, "https://phish.example/steal", exp, sig)).toBe(false);
  });
});

describe("redirect destination decision", () => {
  it("Place ID → Google write-review form → direct redirect (no interstitial)", () => {
    const url = googleReviewUrl("ChIJplaceid123456");
    expect(url).toContain("search.google.com/local/writereview");
    expect(isStorableRedirectUrl(url)).toBe(true);
    expect(isAllowedReviewHost(url)).toBe(true);
  });

  it("no Place ID → Google search fallback → still a direct-redirect host", () => {
    const url = googleReviewUrl(null, "Acme Coffee");
    expect(url).toContain("google.com/search");
    expect(isAllowedReviewHost(url)).toBe(true);
  });

  it("pasted non-Google review URL → storable but interstitial-gated", () => {
    const pasted = "https://www.yelp.com/biz/acme";
    expect(isStorableRedirectUrl(pasted)).toBe(true);
    expect(isAllowedReviewHost(pasted)).toBe(false);
  });
});
