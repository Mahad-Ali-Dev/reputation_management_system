import { describe, expect, it } from "vitest";

/**
 * Salesforce adapter — PURE mapping tests (no network).
 *
 * `mapSalesforceContacts` turns the records array of a Salesforce SOQL `query`
 * response into NormalizedContact[]. These tests assert the field mapping
 * (name/email/phone/externalId), the Account.Name name fallback, and that
 * missing/partial fields are handled without throwing. No `fetch`, no DB.
 */

import {
  type SalesforceContact,
  type SalesforceQueryResponse,
  mapSalesforceContacts,
} from "@/lib/connections/adapters/salesforce";

// A realistic slice of a `GET /services/data/v59.0/query?q=...` response.
const SAMPLE: SalesforceQueryResponse = {
  totalSize: 4,
  done: true,
  records: [
    {
      Id: "003ABC000000001",
      FirstName: "Ada",
      LastName: "Lovelace",
      Email: "Ada.Lovelace@EXAMPLE.com",
      Phone: "+1 (415) 555-0100",
      Account: { Name: "Analytical Engines Inc" },
    },
    {
      // No name fields — should fall back to the Account name.
      Id: "003ABC000000002",
      FirstName: null,
      LastName: null,
      Email: "billing@acme.co",
      Phone: null,
      Account: { Name: "Acme Co" },
    },
    {
      // No email + no phone — must be dropped.
      Id: "003ABC000000003",
      FirstName: "Ghost",
      LastName: "Record",
      Email: null,
      Phone: null,
      Account: null,
    },
    {
      // Phone only, no Account relationship at all.
      Id: "003ABC000000004",
      LastName: "Phone-Only",
      Phone: "020 7946 0991",
    },
  ],
};

describe("mapSalesforceContacts — response → contact mapping", () => {
  it("maps Id/name/email/phone and drops records with no email or phone", () => {
    const out = mapSalesforceContacts(SAMPLE.records);

    // The no-email/no-phone "Ghost Record" is dropped: 4 in, 3 out.
    expect(out).toHaveLength(3);

    const ada = out[0]!;
    const acme = out[1]!;
    const phoneOnly = out[2]!;

    // externalId comes straight from the Salesforce Id.
    expect(ada.externalId).toBe("003ABC000000001");
    // name built from FirstName + LastName.
    expect(ada.name).toBe("Ada Lovelace");
    // email is trimmed + lowercased by cleanEmail.
    expect(ada.email).toBe("ada.lovelace@example.com");
    expect(ada.phone).toBe("+1 (415) 555-0100");
    // raw payload is preserved for debugging/enrichment.
    expect(ada.raw).toBe(SAMPLE.records![0]);

    // No first/last name → falls back to Account.Name.
    expect(acme.externalId).toBe("003ABC000000002");
    expect(acme.name).toBe("Acme Co");
    expect(acme.email).toBe("billing@acme.co");
    expect(acme.phone).toBeNull();

    // Phone-only contact with no Account: name from LastName, email null.
    expect(phoneOnly.externalId).toBe("003ABC000000004");
    expect(phoneOnly.name).toBe("Phone-Only");
    expect(phoneOnly.email).toBeNull();
    expect(phoneOnly.phone).toBe("020 7946 0991");
  });

  it("returns name=null when there is no name and no Account", () => {
    const records: SalesforceContact[] = [
      { Id: "003X", Email: "no-name@example.com" },
    ];
    const out = mapSalesforceContacts(records);
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBeNull();
    expect(out[0]!.email).toBe("no-name@example.com");
    expect(out[0]!.phone).toBeNull();
  });

  it("handles missing/empty/undefined records without throwing", () => {
    expect(mapSalesforceContacts(undefined)).toEqual([]);
    expect(mapSalesforceContacts(null)).toEqual([]);
    expect(mapSalesforceContacts([])).toEqual([]);
  });

  it("ignores records missing an Id", () => {
    const records = [
      { Email: "orphan@example.com" } as unknown as SalesforceContact,
      { Id: "003Y", Email: "kept@example.com" },
    ];
    const out = mapSalesforceContacts(records);
    expect(out).toHaveLength(1);
    expect(out[0]!.externalId).toBe("003Y");
  });

  it("drops a record whose email is obviously invalid and has no phone", () => {
    const records: SalesforceContact[] = [
      { Id: "003Z", FirstName: "Bad", LastName: "Email", Email: "x@" },
    ];
    // cleanEmail rejects "x@" (too short / no domain) → no email, no phone → dropped.
    expect(mapSalesforceContacts(records)).toEqual([]);
  });
});
