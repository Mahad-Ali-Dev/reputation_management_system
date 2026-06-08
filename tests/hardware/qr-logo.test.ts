import { describe, expect, it } from "vitest";
import {
  PLATFORM_GLYPHS,
  PLATFORM_GLYPH_KEYS,
  type QrPlatform,
  qrPngWithLogo,
  qrSvgWithLogo,
  resolvePlatform,
} from "@/lib/hardware/qr";

/**
 * Tests for the dependency-light QR-with-center-logo generator.
 *
 * The whole reason this module exists (over a static `sharp` raster
 * compositor) is that `sharp` isn't installed in CI. So:
 *   - the SVG path is asserted hard (it's pure string composition — must be
 *     deterministic and always carry the logo overlay), and
 *   - the PNG path is asserted to ALWAYS return a scannable PNG buffer, with
 *     `hasLogo` reflecting whether sharp was available (true) or we fell back
 *     to a plain QR (false). The test tolerates BOTH so it's green with or
 *     without sharp.
 */

const URL = "https://repulabs.com/r/ABCDEF1234";
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("PLATFORM_GLYPHS", () => {
  it("exposes the documented platform keys", () => {
    expect(PLATFORM_GLYPH_KEYS.sort()).toEqual(
      (["facebook", "google", "instagram", "multi", "repulabs", "star"] as QrPlatform[]).sort(),
    );
  });

  it("every glyph is inert SVG markup (no script / external refs)", () => {
    for (const key of PLATFORM_GLYPH_KEYS) {
      const g = PLATFORM_GLYPHS[key];
      expect(g.length).toBeGreaterThan(0);
      // XSS / SSRF guardrails — these get served from our origin.
      expect(g).not.toMatch(/<script/i);
      expect(g).not.toMatch(/href=/i);
      expect(g).not.toMatch(/url\(/i);
      // Must be drawable shapes.
      expect(g).toMatch(/<(path|rect|circle)/);
    }
  });
});

describe("resolvePlatform", () => {
  it("maps known aliases to the canonical glyph key", () => {
    expect(resolvePlatform("google")).toBe("google");
    expect(resolvePlatform("GBP")).toBe("google");
    expect(resolvePlatform("google_business")).toBe("google");
    expect(resolvePlatform("ig")).toBe("instagram");
    expect(resolvePlatform("meta")).toBe("facebook");
    expect(resolvePlatform("multi_platform")).toBe("multi");
    expect(resolvePlatform("review")).toBe("star");
  });

  it("falls back to repulabs for unknown / empty input", () => {
    expect(resolvePlatform("tiktok")).toBe("repulabs");
    expect(resolvePlatform("")).toBe("repulabs");
    expect(resolvePlatform(null)).toBe("repulabs");
    expect(resolvePlatform(undefined)).toBe("repulabs");
  });
});

describe("qrSvgWithLogo", () => {
  it("emits a single-root SVG at error-correction level H with the QR modules", async () => {
    const svg = await qrSvgWithLogo(URL, "google");

    // Single <svg> root.
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
    expect(svg.match(/<\/svg>/g)).toHaveLength(1);

    // qrcode emits the modules as a black stroke path — proves QR data present.
    expect(svg).toMatch(/stroke="#000000"/);
    expect(svg).toMatch(/<path/);
  });

  it("uses H error correction (denser symbol than the M default for the same URL)", async () => {
    // Same URL, same width/margin. H needs more modules than M, so its viewBox
    // dimension must be >= the M one. This is how we prove H was requested
    // without reaching into qrcode internals.
    const QRCode = (await import("qrcode")).default;
    const mSvg = await QRCode.toString(URL, {
      type: "svg",
      errorCorrectionLevel: "M",
      width: 1024,
      margin: 2,
    });
    const hSvg = await qrSvgWithLogo(URL, "google");

    const sizeOf = (s: string) => Number(s.match(/viewBox="0 0 (\d+)/)?.[1] ?? 0);
    expect(sizeOf(hSvg)).toBeGreaterThanOrEqual(sizeOf(mSvg));
    expect(sizeOf(hSvg)).toBeGreaterThan(0);
  });

  it("injects a centered white backing rect + the platform glyph before </svg>", async () => {
    const svg = await qrSvgWithLogo(URL, "google");

    const size = Number(svg.match(/viewBox="0 0 (\d+)/)?.[1]);
    expect(size).toBeGreaterThan(0);

    // The overlay's white backing rect: rounded (rx/ry) + white fill. The QR's
    // own background rect is NOT rounded, so an rx-bearing white rect is the
    // logo backing specifically.
    const roundedWhiteRect = /<rect[^>]*rx="[\d.]+"[^>]*ry="[\d.]+"[^>]*fill="#ffffff"/;
    expect(svg).toMatch(roundedWhiteRect);

    // Backing must be roughly centered: x ≈ (size * (1 - 0.22)) / 2.
    const rectX = Number(
      svg.match(/<rect x="([\d.]+)"[^>]*rx="[\d.]+"[^>]*ry="[\d.]+"[^>]*fill="#ffffff"/)?.[1],
    );
    const expectedX = (size * (1 - 0.22)) / 2;
    expect(rectX).toBeCloseTo(expectedX, 1);

    // The Google glyph carries its brand-blue wedge — proves the glyph injected.
    expect(svg).toMatch(/fill="#4285F4"/);
    // And it's wrapped in a scaled translate group (the overlay transform).
    expect(svg).toMatch(/<g transform="translate\([\d.]+ [\d.]+\) scale\([\d.]+\)">/);

    // Overlay paints AFTER the QR — i.e. its transform group sits before the
    // final </svg> (so it's on top).
    expect(svg.indexOf("translate(")).toBeLessThan(svg.lastIndexOf("</svg>"));
  });

  it("defaults unknown platforms to the generic repulabs mark without throwing", async () => {
    const svg = await qrSvgWithLogo(URL, "tiktok");
    // repulabs mark uses the brand-blue rounded square (#2563EB).
    expect(svg).toMatch(/fill="#2563EB"/);
    expect(svg.match(/<\/svg>/g)).toHaveLength(1);
  });

  it("renders every supported platform to a valid single-root SVG", async () => {
    for (const key of PLATFORM_GLYPH_KEYS) {
      const svg = await qrSvgWithLogo(URL, key);
      expect(svg.match(/<\/svg>/g), `platform ${key}`).toHaveLength(1);
      expect(svg, `platform ${key}`).toMatch(/stroke="#000000"/);
    }
  });
});

describe("qrPngWithLogo", () => {
  it("always returns a valid PNG buffer (logo if sharp present, plain otherwise)", async () => {
    const { buffer, hasLogo } = await qrPngWithLogo(URL, "google", { width: 256 });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
    // PNG magic number — proves it's actually a PNG regardless of code path.
    expect(buffer.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);

    // hasLogo is a boolean reflecting the sharp-availability branch. We don't
    // assert which branch ran (sharp is absent in CI), only that the contract
    // shape holds.
    expect(typeof hasLogo).toBe("boolean");
  });
});
