import { describe, expect, it } from "vitest";

/**
 * Wix adapter — PURE mapping tests (no network).
 *
 * `mapWixContacts` turns the `contacts` array of a Wix Contacts API v4 `query`
 * response into NormalizedContact[]. These tests assert the field mapping
 * (name/email/phone/externalId from info.name / primaryInfo / id) and that
 * missing/partial fields are handled without throwing. No `fetch`, no DB.
 */

import {
  type WixContact,
  type WixQueryResponse,
  mapWixContacts,
} from "@/lib/connections/adapters/wix";

// A realistic slice of a `POST /contacts/v4/contacts/query` response.
const SAMPLE: WixQueryResponse = {
  contacts: [
    {
      id: "11111111-2222-3333-4444-555555555555",
      info: { name: { first: "Ada", last: "Lovelace" } },
      primaryInfo: { email: "Ada.Lovelace@EXAMPLE.com", phone: "+1 (415) 555-0100" },
    },
    {
      // First name only, phone only — kept, name from first.
      id: "66666666-7777-8888-9999-000000000000",
      info: { name: { first: "Grace", last: null } },
      primaryInfo: { email: null, phone: "020 7946 0991" },
    },
    {
      // No name at all, email only — kept, name null.
      id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      info: null,
      primaryInfo: { email: "billing@acme.co" },
    },
    {
      // No email + no phone — must be dropped.
      id: "ffffffff-0000-1111-2222-333333333333",
      info: { name: { first: "Ghost", last: "Record" } },
      primaryInfo: { email: null, phone: null },
    },
  ],
  pagingMetadata: { cursors: { next: null } },
};

describe("mapWixContacts — response → contact mapping", () => {
  it("maps id/name/email/phone and drops records with no email or phone", () => {
    const out = mapWixContacts(SAMPLE.contacts);

    // The no-email/no-phone "Ghost Record" is dropped: 4 in, 3 out.
    expect(out).toHaveLength(3);

    const ada = out[0]!;
    const grace = out[1]!;
    const acme = out[2]!;

    // externalId comes straight from the Wix contact id.
    expect(ada.externalId).toBe("11111111-2222-3333-4444-555555555555");
    // name built from info.name.first + info.name.last.
    expect(ada.name).toBe("Ada Lovelace");
    // email is trimmed + lowercased by cleanEmail.
    expect(ada.email).toBe("ada.lovelace@example.com");
    expect(ada.phone).toBe("+1 (415) 555-0100");
    // raw payload is preserved for debugging/enrichment.
    expect(ada.raw).toBe(SAMPLE.contacts![0]);

    // First name only, phone only.
    expect(grace.externalId).toBe("66666666-7777-8888-9999-000000000000");
    expect(grace.name).toBe("Grace");
    expect(grace.email).toBeNull();
    expect(grace.phone).toBe("020 7946 0991");

    // No name → name null; email only.
    expect(acme.externalId).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    expect(acme.name).toBeNull();
    expect(acme.email).toBe("billing@acme.co");
    expect(acme.phone).toBeNull();
  });

  it("returns name=null when there is no info/name block", () => {
    const contacts: WixContact[] = [
      { id: "no-name", primaryInfo: { email: "no-name@example.com" } },
    ];
    const out = mapWixContacts(contacts);
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBeNull();
    expect(out[0]!.email).toBe("no-name@example.com");
    expect(out[0]!.phone).toBeNull();
  });

  it("handles missing/empty/undefined contacts without throwing", () => {
    expect(mapWixContacts(undefined)).toEqual([]);
    expect(mapWixContacts(null)).toEqual([]);
    expect(mapWixContacts([])).toEqual([]);
  });

  it("ignores records missing an id", () => {
    const contacts = [
      { primaryInfo: { email: "orphan@example.com" } } as unknown as WixContact,
      { id: "kept", primaryInfo: { email: "kept@example.com" } },
    ];
    const out = mapWixContacts(contacts);
    expect(out).toHaveLength(1);
    expect(out[0]!.externalId).toBe("kept");
  });

  it("drops a record whose email is obviously invalid and has no phone", () => {
    const contacts: WixContact[] = [
      {
        id: "bad",
        info: { name: { first: "Bad", last: "Email" } },
        primaryInfo: { email: "x@", phone: null },
      },
    ];
    // cleanEmail rejects "x@" (too short / no domain) → no email, no phone → dropped.
    expect(mapWixContacts(contacts)).toEqual([]);
  });
});
