import { describe, expect, it } from "vitest";

/**
 * WooCommerce adapter — PURE mapping tests (no network).
 *
 * `mapWooCommerceCustomers` turns a `GET /wp-json/wc/v3/customers` response
 * array into NormalizedContact[]. These tests assert the field mapping
 * (name from first_name/last_name, email, phone from billing.phone,
 * externalId from id) and that missing/partial fields are handled without
 * throwing. No `fetch`, no DB. `normalizeStoreUrl` is also covered since it
 * gates whether the adapter makes a network call at all.
 */

import {
  type WooCommerceCustomer,
  mapWooCommerceCustomers,
  normalizeStoreUrl,
} from "@/lib/connections/adapters/woocommerce";

// A realistic slice of a `GET /wp-json/wc/v3/customers?per_page=100&page=1`
// response (the endpoint returns a bare JSON array of customer objects).
const SAMPLE: WooCommerceCustomer[] = [
  {
    id: 25,
    first_name: "Ada",
    last_name: "Lovelace",
    email: "Ada.Lovelace@EXAMPLE.com",
    billing: { phone: "+1 (415) 555-0100" },
  },
  {
    // First name only, billing phone only — kept, name from first.
    id: 26,
    first_name: "Grace",
    last_name: "",
    email: null,
    billing: { phone: "020 7946 0991" },
  },
  {
    // No name, email only, no billing block at all — kept, name null.
    id: 27,
    email: "billing@acme.co",
  },
  {
    // No email + no phone (empty billing) — must be dropped.
    id: 28,
    first_name: "Ghost",
    last_name: "Record",
    email: null,
    billing: { phone: null },
  },
];

describe("mapWooCommerceCustomers — response → contact mapping", () => {
  it("maps id/name/email/phone and drops records with no email or phone", () => {
    const out = mapWooCommerceCustomers(SAMPLE);

    // The no-email/no-phone "Ghost Record" is dropped: 4 in, 3 out.
    expect(out).toHaveLength(3);

    const ada = out[0]!;
    const grace = out[1]!;
    const acme = out[2]!;

    // externalId is the stringified WooCommerce numeric id.
    expect(ada.externalId).toBe("25");
    // name built from first_name + last_name.
    expect(ada.name).toBe("Ada Lovelace");
    // email is trimmed + lowercased by cleanEmail.
    expect(ada.email).toBe("ada.lovelace@example.com");
    // phone comes straight from billing.phone.
    expect(ada.phone).toBe("+1 (415) 555-0100");
    // raw payload is preserved for debugging/enrichment.
    expect(ada.raw).toBe(SAMPLE[0]);

    // First name only, phone only.
    expect(grace.externalId).toBe("26");
    expect(grace.name).toBe("Grace");
    expect(grace.email).toBeNull();
    expect(grace.phone).toBe("020 7946 0991");

    // No name → name null; email only; no billing block → phone null.
    expect(acme.externalId).toBe("27");
    expect(acme.name).toBeNull();
    expect(acme.email).toBe("billing@acme.co");
    expect(acme.phone).toBeNull();
  });

  it("returns name=null when both name parts are missing/empty", () => {
    const customers: WooCommerceCustomer[] = [
      { id: 1, email: "no-name@example.com" },
      { id: 2, first_name: "", last_name: "", billing: { phone: "5551234" } },
    ];
    const out = mapWooCommerceCustomers(customers);
    expect(out).toHaveLength(2);
    expect(out[0]!.name).toBeNull();
    expect(out[1]!.name).toBeNull();
  });

  it("handles missing/empty/undefined input without throwing", () => {
    expect(mapWooCommerceCustomers(undefined)).toEqual([]);
    expect(mapWooCommerceCustomers(null)).toEqual([]);
    expect(mapWooCommerceCustomers([])).toEqual([]);
  });

  it("ignores records missing an id", () => {
    const customers = [
      { email: "orphan@example.com" } as unknown as WooCommerceCustomer,
      { id: 99, email: "kept@example.com" },
    ];
    const out = mapWooCommerceCustomers(customers);
    expect(out).toHaveLength(1);
    expect(out[0]!.externalId).toBe("99");
  });

  it("keeps a record with id=0 (a valid, falsy WooCommerce id)", () => {
    const out = mapWooCommerceCustomers([{ id: 0, email: "zero@example.com" }]);
    expect(out).toHaveLength(1);
    expect(out[0]!.externalId).toBe("0");
  });

  it("drops a record whose email is obviously invalid and has no phone", () => {
    const customers: WooCommerceCustomer[] = [
      {
        id: 5,
        first_name: "Bad",
        last_name: "Email",
        email: "x@",
        billing: { phone: null },
      },
    ];
    // cleanEmail rejects "x@" (too short / no domain) → no email, no phone → dropped.
    expect(mapWooCommerceCustomers(customers)).toEqual([]);
  });
});

describe("normalizeStoreUrl — store URL gating", () => {
  it("returns the origin for a full https URL (dropping path/query)", () => {
    expect(normalizeStoreUrl("https://shop.example.com/store?x=1")).toBe(
      "https://shop.example.com",
    );
  });

  it("defaults a bare host to https", () => {
    expect(normalizeStoreUrl("shop.example.com")).toBe("https://shop.example.com");
  });

  it("preserves an explicit http origin and a custom port", () => {
    expect(normalizeStoreUrl("http://localhost:8080")).toBe("http://localhost:8080");
  });

  it("returns null for missing/empty/garbage input", () => {
    expect(normalizeStoreUrl(null)).toBeNull();
    expect(normalizeStoreUrl(undefined)).toBeNull();
    expect(normalizeStoreUrl("")).toBeNull();
    expect(normalizeStoreUrl("   ")).toBeNull();
  });
});
