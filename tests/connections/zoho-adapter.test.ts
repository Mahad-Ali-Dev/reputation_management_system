import { describe, expect, it } from "vitest";

/**
 * Zoho CRM adapter — pure mapping tests (Module 14, Connections).
 *
 * These exercise `mapZohoContacts` (response → NormalizedContact[]) with NO
 * network, NO DB, and NO mocks. The adapter's credential-gating + zero-fetch
 * guardrails are covered by the shared `adapters.test.ts` registry suite once
 * the adapter is wired; here we pin the field mapping contract precisely.
 */

import { mapZohoContacts } from "@/lib/connections/adapters/zoho";

// A realistic slice of a Zoho CRM v3 GET /Contacts response.
const SAMPLE = {
  data: [
    {
      id: "554023000000327011",
      Full_Name: "Patricia Boyle",
      First_Name: "Patricia",
      Last_Name: "Boyle",
      Email: "Patricia.Boyle@example.com",
      Phone: "555-204-1100",
      Mobile: "555-999-2200",
    },
    {
      // Numeric id (within JS safe-integer range) → coerced to a string
      // externalId. No Full_Name → name is built from First_Name + Last_Name.
      id: 327099,
      First_Name: "Leo",
      Last_Name: "Tanaka",
      Email: "leo.tanaka@example.com",
      Phone: null,
      Mobile: "555-301-7788",
    },
    {
      // No email; phone-only contact is still reachable → kept.
      id: "554023000000327123",
      Full_Name: "Mara Singh",
      Email: "  ",
      Phone: "555-660-4321",
    },
    {
      // Neither email nor phone → dropped (nothing to reach them on).
      id: "554023000000327200",
      Full_Name: "Ghost Lead",
      Email: null,
      Phone: null,
    },
    {
      // Missing id → dropped (no stable externalId for dedupe).
      Full_Name: "No Id Person",
      Email: "noid@example.com",
    },
  ],
};

describe("mapZohoContacts — response → contact mapping", () => {
  it("maps a full record (id, Full_Name, Email, Phone → contact shape)", () => {
    const out = mapZohoContacts(SAMPLE);
    const patricia = out.find((c) => c.externalId === "554023000000327011");
    expect(patricia).toBeDefined();
    expect(patricia).toMatchObject({
      externalId: "554023000000327011",
      name: "Patricia Boyle",
      email: "patricia.boyle@example.com", // lowercased + trimmed by cleanEmail
      phone: "555-204-1100", // Phone preferred over Mobile
    });
    // The original payload is preserved for debugging/enrichment.
    expect((patricia?.raw as { id: string }).id).toBe("554023000000327011");
  });

  it("builds name from First_Name + Last_Name when Full_Name is absent", () => {
    const out = mapZohoContacts(SAMPLE);
    const leo = out.find((c) => c.externalId === "327099");
    expect(leo?.name).toBe("Leo Tanaka");
  });

  it("coerces a numeric id to a string externalId", () => {
    const out = mapZohoContacts(SAMPLE);
    expect(out.some((c) => c.externalId === "327099")).toBe(true);
  });

  it("falls back to Mobile when Phone is empty", () => {
    const out = mapZohoContacts(SAMPLE);
    const leo = out.find((c) => c.externalId === "327099");
    expect(leo?.phone).toBe("555-301-7788");
  });

  it("keeps a phone-only contact and nulls a blank email", () => {
    const out = mapZohoContacts(SAMPLE);
    const mara = out.find((c) => c.externalId === "554023000000327123");
    expect(mara).toBeDefined();
    expect(mara?.email).toBeNull();
    expect(mara?.phone).toBe("555-660-4321");
  });

  it("drops contacts with neither email nor phone", () => {
    const out = mapZohoContacts(SAMPLE);
    expect(out.some((c) => c.externalId === "554023000000327200")).toBe(false);
  });

  it("drops records missing a stable id", () => {
    const out = mapZohoContacts(SAMPLE);
    expect(out.some((c) => c.name === "No Id Person")).toBe(false);
  });

  it("handles missing / empty / malformed responses without throwing", () => {
    expect(mapZohoContacts(undefined)).toEqual([]);
    expect(mapZohoContacts(null)).toEqual([]);
    expect(mapZohoContacts({})).toEqual([]);
    expect(mapZohoContacts({ data: null })).toEqual([]);
    expect(mapZohoContacts({ data: [] })).toEqual([]);
  });
});
