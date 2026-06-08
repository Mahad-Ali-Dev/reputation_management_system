import {
  type BannerVariant,
  conversionRate,
  formatConversionPct,
  formatConversionWhole,
  pickBannerVariant,
} from "@/lib/hardware/queries";
import { describe, expect, it } from "vitest";

/**
 * Pure-logic tests for the Module 04 (My Devices) metric helpers. No DB — the
 * tenant-scoped `getDeviceMetrics` / `listOrgDevicesWithProduct` wrap these same
 * functions, so locking the math here is what keeps the summary pill, the
 * per-device card, and the page in agreement. Mirrors the no-DB style of
 * `tests/hardware/activation-flow.test.ts`.
 */

describe("conversionRate (aggregate + per-device share a single formula)", () => {
  it("is reviews / scans for normal inputs", () => {
    expect(conversionRate(25, 100)).toBeCloseTo(0.25, 10);
    expect(conversionRate(3, 8)).toBeCloseTo(0.375, 10);
  });

  it("is 0 (never NaN/Infinity) when there are no scans", () => {
    expect(conversionRate(0, 0)).toBe(0);
    // Defensive: reviews without scans should not divide-by-zero.
    expect(conversionRate(5, 0)).toBe(0);
  });

  it("never throws for negative/garbage scan counts (treats as no scans)", () => {
    expect(conversionRate(2, -4)).toBe(0);
  });
});

describe("formatConversionPct (1-decimal summary pill)", () => {
  it("renders a one-decimal percent", () => {
    expect(formatConversionPct(25, 100)).toBe("25.0%");
    expect(formatConversionPct(1, 3)).toBe("33.3%");
  });

  it("renders an em-dash when there are no scans", () => {
    expect(formatConversionPct(0, 0)).toBe("—");
    expect(formatConversionPct(4, 0)).toBe("—");
  });
});

describe("formatConversionWhole (compact per-device metric)", () => {
  it("rounds to a whole percent", () => {
    expect(formatConversionWhole(1, 3)).toBe("33%");
    expect(formatConversionWhole(2, 3)).toBe("67%");
    expect(formatConversionWhole(100, 100)).toBe("100%");
  });

  it("renders an em-dash when there are no scans", () => {
    expect(formatConversionWhole(0, 0)).toBe("—");
  });
});

describe("pickBannerVariant (Pro/Free next-step branch)", () => {
  it("selects the green Pro variant when entitled", () => {
    const v: BannerVariant = pickBannerVariant(true);
    expect(v).toBe("pro");
  });

  it("selects the gold Free variant when not entitled", () => {
    const v: BannerVariant = pickBannerVariant(false);
    expect(v).toBe("free");
  });
});
