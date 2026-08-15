import { generateSlug } from "@/lib/hardware/codes";
import { SLUG_RE, isValidSlug, parseSlug } from "@/lib/hardware/slug";
import { describe, expect, it } from "vitest";

/**
 * Slug carrying — the regression guard for the mis-printed-batch incident.
 *
 * Background: the manufacturer printed ONE activation code (84219) on the cards
 * for an entire 1,500-unit batch, so the code can't identify a unit. The QR
 * slug can. Everything in the activation flow therefore hinges on the slug
 * reaching `activateDevice`, whether it arrives as a scanned link, a pasted
 * link, or the cookie `/r/{slug}` dropped at scan time.
 *
 * These tests cover the parser all three paths share. A regression here is the
 * bug coming back: the customer types the only code they have, nothing matches,
 * and activation dead-ends.
 */

describe("parseSlug — what customers actually paste", () => {
  it("accepts the full printed QR link", () => {
    expect(parseSlug("https://repulabs.com/r/ABCD123456")).toBe("ABCD123456");
  });

  it("accepts the link without a scheme (what people copy off the product)", () => {
    expect(parseSlug("repulabs.com/r/ABCD123456")).toBe("ABCD123456");
  });

  it("accepts a bare path", () => {
    expect(parseSlug("/r/ABCD123456")).toBe("ABCD123456");
  });

  it("accepts the raw slug on its own", () => {
    expect(parseSlug("ABCD123456")).toBe("ABCD123456");
  });

  it("ignores query strings and trailing path on a pasted link", () => {
    expect(parseSlug("https://repulabs.com/r/ABCD123456?utm_source=card")).toBe("ABCD123456");
    expect(parseSlug("https://repulabs.com/r/ABCD123456/")).toBe("ABCD123456");
  });

  it("normalizes case, stray whitespace and hand-inserted dashes", () => {
    expect(parseSlug("  abcd123456  ")).toBe("ABCD123456");
    expect(parseSlug("ABCD-123456")).toBe("ABCD123456");
    expect(parseSlug("abcd 123 456")).toBe("ABCD123456");
  });

  it("folds Crockford's ambiguous letters the way a reader is meant to", () => {
    // I and L read as 1, O reads as 0. Generated slugs never contain them, so
    // this only ever rescues a mistyped code — it can't collide with a real one.
    expect(parseSlug("IOOO123456")).toBe("1000123456");
    expect(parseSlug("LOOO123456")).toBe("1000123456");
  });

  it("returns null rather than guessing when the input isn't a slug", () => {
    expect(parseSlug("")).toBeNull();
    expect(parseSlug("   ")).toBeNull();
    expect(parseSlug(null)).toBeNull();
    expect(parseSlug(undefined)).toBeNull();
    expect(parseSlug("84219")).toBeNull(); // the activation code is NOT a slug
    expect(parseSlug("ABCD12345")).toBeNull(); // 9 chars
    expect(parseSlug("ABCD1234567")).toBeNull(); // 11 chars
    expect(parseSlug("ABCDU23456")).toBeNull(); // U isn't in the alphabet
    expect(parseSlug("https://repulabs.com/hardware")).toBeNull();
  });

  it("never returns something the redirect route would reject", () => {
    for (const input of ["abcd123456", "https://repulabs.com/r/zzzzzzzzzz", "IOOO123456"]) {
      const slug = parseSlug(input);
      expect(slug).not.toBeNull();
      expect(slug as string).toMatch(SLUG_RE);
    }
  });
});

describe("parseSlug round-trips every generated slug", () => {
  it("survives being wrapped in a QR link and parsed back out", () => {
    for (let i = 0; i < 500; i++) {
      const slug = generateSlug();
      expect(isValidSlug(slug)).toBe(true);
      expect(parseSlug(`https://repulabs.com/r/${slug}`)).toBe(slug);
      // Phones and email clients lowercase links often enough to matter.
      expect(parseSlug(`https://repulabs.com/r/${slug.toLowerCase()}`)).toBe(slug);
    }
  });
});
