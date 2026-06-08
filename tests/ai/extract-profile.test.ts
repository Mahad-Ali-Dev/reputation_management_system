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
});
