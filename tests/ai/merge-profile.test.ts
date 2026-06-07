import { describe, expect, it, vi } from "vitest";

// auto-setup.ts is a "use server" module that transitively imports next/cache,
// next/navigation and auth — mock them so importing the pure mergeProfile here
// has no side effects.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));
vi.mock("@/lib/auth/config", () => ({ auth: async () => null }));
vi.mock("@/lib/db/with-tenant", () => ({ withTenant: async () => undefined }));

const { mergeProfile } = await import("@/lib/ai/auto-setup");

const EXTRACTED = {
  businessOverview: "A coffee roaster in Austin.",
  servicesProducts: "Single-origin beans, espresso, cold brew.",
  pricingDetails: "Bags from $18.",
  locations: "100 Congress Ave, Austin",
  operatingHours: { monday: { open: "07:00", close: "18:00" } },
};

describe("mergeProfile", () => {
  it("populates everything onto an empty profile + lists all fields", () => {
    const { data, fields } = mergeProfile(EXTRACTED, null);
    expect(data.businessOverview).toBe(EXTRACTED.businessOverview);
    expect(data.servicesProducts).toBe(EXTRACTED.servicesProducts);
    expect(data.pricingDetails).toBe(EXTRACTED.pricingDetails);
    expect(data.locations).toBe(EXTRACTED.locations);
    expect(data.operatingHours).toEqual(EXTRACTED.operatingHours);
    expect(fields.sort()).toEqual(["hours", "locations", "overview", "pricing", "services"]);
  });

  it("never clobbers a user-edited field with an empty extracted value", () => {
    const extractedEmpty = {
      businessOverview: "",
      servicesProducts: "",
      pricingDetails: "",
      locations: "",
      operatingHours: {},
    };
    const existing = {
      businessOverview: "My hand-written overview",
      servicesProducts: "My services",
      pricingDetails: "My pricing",
      locations: "My address",
      operatingHours: { tuesday: { open: "08:00", close: "16:00" } },
    };
    const { data, fields } = mergeProfile(extractedEmpty, existing);
    expect(data.businessOverview).toBe("My hand-written overview");
    expect(data.servicesProducts).toBe("My services");
    expect(data.locations).toBe("My address");
    expect(data.operatingHours).toEqual(existing.operatingHours);
    expect(fields).toEqual([]); // nothing changed
  });

  it("reports only the fields that actually changed (diff semantics)", () => {
    const existing = {
      businessOverview: EXTRACTED.businessOverview, // same → no change
      servicesProducts: "old services", // differs → change
      pricingDetails: null,
      locations: null,
      operatingHours: null,
    };
    const { fields } = mergeProfile(EXTRACTED, existing);
    expect(fields).not.toContain("overview");
    expect(fields).toContain("services");
    expect(fields).toContain("pricing");
    expect(fields).toContain("locations");
    expect(fields).toContain("hours");
  });
});
