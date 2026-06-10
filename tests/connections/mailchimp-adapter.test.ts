import { describe, expect, it } from "vitest";

/**
 * Mailchimp adapter — PURE mapping tests (no network).
 *
 * `mapMailchimpMembers` turns the `members` array of a `/3.0/lists/{id}/members`
 * response into NormalizedContact[]. `dataCenterFromExternalId` resolves the
 * data-center prefix the callback stored on the connection. These tests assert
 * the field mapping (id/name/email/phone), the FNAME/LNAME name build, the
 * drop-if-no-email-and-no-phone rule, dc resolution, and that
 * missing/partial fields are handled without throwing. No `fetch`, no DB.
 */

import {
  type MailchimpMembersResponse,
  dataCenterFromExternalId,
  mapMailchimpMembers,
} from "@/lib/connections/adapters/mailchimp";

// A realistic slice of a `GET /3.0/lists/{id}/members` response.
const SAMPLE: MailchimpMembersResponse = {
  total_items: 4,
  members: [
    {
      id: "a1b2c3d4e5",
      email_address: "Ada.Lovelace@EXAMPLE.com",
      merge_fields: {
        FNAME: "Ada",
        LNAME: "Lovelace",
        PHONE: "+1 (415) 555-0100",
      },
    },
    {
      // No phone, name from merge fields, email lowercased.
      id: "f6g7h8i9j0",
      email_address: "billing@acme.co",
      merge_fields: { FNAME: "", LNAME: "", PHONE: "" },
    },
    {
      // No email + no phone — must be dropped.
      id: "k1l2m3n4o5",
      email_address: null,
      merge_fields: { FNAME: "Ghost", LNAME: "Member", PHONE: null },
    },
    {
      // Phone only, no name fields at all.
      id: "p6q7r8s9t0",
      email_address: "",
      merge_fields: { PHONE: "020 7946 0991" },
    },
  ],
};

describe("mapMailchimpMembers — response → contact mapping", () => {
  it("maps id/name/email/phone and drops members with no email or phone", () => {
    const out = mapMailchimpMembers(SAMPLE.members);

    // The no-email/no-phone "Ghost Member" is dropped: 4 in, 3 out.
    expect(out).toHaveLength(3);

    const ada = out[0]!;
    const acme = out[1]!;
    const phoneOnly = out[2]!;

    expect(ada.externalId).toBe("a1b2c3d4e5");
    expect(ada.name).toBe("Ada Lovelace");
    // email trimmed + lowercased by cleanEmail.
    expect(ada.email).toBe("ada.lovelace@example.com");
    expect(ada.phone).toBe("+1 (415) 555-0100");
    // raw payload preserved for debugging/enrichment.
    expect(ada.raw).toBe(SAMPLE.members![0]);

    // Empty FNAME/LNAME → name null; empty phone → null.
    expect(acme.externalId).toBe("f6g7h8i9j0");
    expect(acme.name).toBeNull();
    expect(acme.email).toBe("billing@acme.co");
    expect(acme.phone).toBeNull();

    // Phone-only member: no name, no email.
    expect(phoneOnly.externalId).toBe("p6q7r8s9t0");
    expect(phoneOnly.name).toBeNull();
    expect(phoneOnly.email).toBeNull();
    expect(phoneOnly.phone).toBe("020 7946 0991");
  });

  it("handles missing/empty/undefined members without throwing", () => {
    expect(mapMailchimpMembers(undefined)).toEqual([]);
    expect(mapMailchimpMembers(null)).toEqual([]);
    expect(mapMailchimpMembers([])).toEqual([]);
  });

  it("ignores members missing an id", () => {
    const out = mapMailchimpMembers([
      { email_address: "orphan@example.com" } as never,
      { id: "keep1", email_address: "kept@example.com" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.externalId).toBe("keep1");
  });

  it("drops a member whose email is invalid and has no phone", () => {
    expect(
      mapMailchimpMembers([
        { id: "z", email_address: "x@", merge_fields: { FNAME: "Bad", LNAME: "Email" } },
      ]),
    ).toEqual([]);
  });
});

describe("dataCenterFromExternalId — dc resolution", () => {
  it("extracts the dc from a `{user_id}@{dc}` externalId", () => {
    expect(dataCenterFromExternalId("123456@us21")).toBe("us21");
  });

  it("returns a bare dc unchanged", () => {
    expect(dataCenterFromExternalId("us6")).toBe("us6");
  });

  it("trims surrounding whitespace", () => {
    expect(dataCenterFromExternalId("  789@us19  ")).toBe("us19");
  });

  it("returns null for empty/missing/unsafe values", () => {
    expect(dataCenterFromExternalId(null)).toBeNull();
    expect(dataCenterFromExternalId(undefined)).toBeNull();
    expect(dataCenterFromExternalId("")).toBeNull();
    expect(dataCenterFromExternalId("   ")).toBeNull();
    // A value with a host-breaking character is rejected.
    expect(dataCenterFromExternalId("us21/evil")).toBeNull();
    expect(dataCenterFromExternalId("us21.example.com")).toBeNull();
  });
});
