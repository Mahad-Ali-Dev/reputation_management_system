import { describe, expect, it } from "vitest";
import { coerceProfile } from "@/lib/ai/extract-profile";

/**
 * coerceProfile maps the model's raw report_profile tool input into our typed
 * fields. We test the mapping directly (no live model) — the same boundary the
 * extractor relies on.
 */

describe("coerceProfile", () => {
  it("maps a full tool payload to typed fields", () => {
    const raw = {
      business_overview: "  A family dental clinic in Denver.  ",
      services_products: "Cleanings, fillings, whitening.",
      pricing: "Cleanings from $99. We take most insurance.",
      locations: ["123 Main St, Denver", "  456 Oak Ave  "],
      operating_hours: {
        monday: { open: "09:00", close: "17:00" },
        sunday: {},
      },
    };
    const p = coerceProfile(raw);
    expect(p.businessOverview).toBe("A family dental clinic in Denver.");
    expect(p.servicesProducts).toContain("Cleanings");
    expect(p.pricingDetails).toContain("$99");
    expect(p.locations).toBe("123 Main St, Denver\n456 Oak Ave");
    expect(p.operatingHours.monday).toEqual({ open: "09:00", close: "17:00" });
    // Empty day objects are dropped.
    expect(p.operatingHours.sunday).toBeUndefined();
  });

  it("returns empty fields for an empty / malformed payload", () => {
    const p = coerceProfile({});
    expect(p.businessOverview).toBe("");
    expect(p.servicesProducts).toBe("");
    expect(p.pricingDetails).toBe("");
    expect(p.locations).toBe("");
    expect(p.operatingHours).toEqual({});
  });

  it("ignores non-string locations entries", () => {
    const p = coerceProfile({ locations: ["ok", 5, null, { a: 1 }] });
    expect(p.locations).toBe("ok");
  });

  it("tolerates null / undefined input", () => {
    expect(() => coerceProfile(null)).not.toThrow();
    expect(() => coerceProfile(undefined)).not.toThrow();
  });

  it("normalizes hours to HH:MM and drops malformed times", () => {
    const p = coerceProfile({
      operating_hours: {
        monday: { open: "9:00", close: "17:30" }, // single-digit hour -> padded
        tuesday: { open: "09:00:00", close: "5:00" }, // seconds stripped
        wednesday: { open: "25:00", close: "10:00" }, // out-of-range open dropped
        thursday: { open: "noon", close: "" }, // non-time fully dropped
      },
    });
    expect(p.operatingHours.monday).toEqual({ open: "09:00", close: "17:30" });
    expect(p.operatingHours.tuesday).toEqual({ open: "09:00", close: "05:00" });
    expect(p.operatingHours.wednesday).toEqual({ open: undefined, close: "10:00" });
    // Thursday had no valid time at all -> day omitted.
    expect(p.operatingHours.thursday).toBeUndefined();
  });

  it("scrubs placeholder text and stray tags from free-text fields", () => {
    const p = coerceProfile({
      business_overview: "N/A",
      pricing: "Contact us",
      locations: ["Unknown", "123 Main St", "</answer>"],
    });
    expect(p.businessOverview).toBe("");
    expect(p.pricingDetails).toBe("");
    // Placeholder + tag-only entries dropped; real address kept.
    expect(p.locations).toBe("123 Main St");
  });
});
