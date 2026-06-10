import { describe, expect, it } from "vitest";

/**
 * Klaviyo adapter — PURE mapping tests (no network).
 *
 * `mapKlaviyoProfiles` turns the `data` array of a `GET /api/profiles/`
 * (JSON:API) response into NormalizedContact[]. These tests assert the field
 * mapping (id/name/email/phone) from `attributes`, the first_name/last_name
 * name build, the drop-if-no-email-and-no-phone rule, and that
 * missing/partial fields are handled without throwing. No `fetch`, no DB.
 */

import {
  type KlaviyoProfilesResponse,
  mapKlaviyoProfiles,
} from "@/lib/connections/adapters/klaviyo";

// A realistic slice of a `GET /api/profiles/` response.
const SAMPLE: KlaviyoProfilesResponse = {
  data: [
    {
      type: "profile",
      id: "01HXYZABC0001",
      attributes: {
        email: "Ada.Lovelace@EXAMPLE.com",
        first_name: "Ada",
        last_name: "Lovelace",
        phone_number: "+1 (415) 555-0100",
      },
    },
    {
      // No phone; name from first/last; email lowercased.
      type: "profile",
      id: "01HXYZABC0002",
      attributes: {
        email: "billing@acme.co",
        first_name: null,
        last_name: null,
        phone_number: null,
      },
    },
    {
      // No email + no phone — must be dropped.
      type: "profile",
      id: "01HXYZABC0003",
      attributes: { email: null, first_name: "Ghost", last_name: "Profile", phone_number: "" },
    },
    {
      // Phone only, no attributes name.
      type: "profile",
      id: "01HXYZABC0004",
      attributes: { phone_number: "+44 20 7946 0991" },
    },
  ],
  links: { next: null },
};

describe("mapKlaviyoProfiles — response → contact mapping", () => {
  it("maps id/name/email/phone and drops profiles with no email or phone", () => {
    const out = mapKlaviyoProfiles(SAMPLE.data);

    // The no-email/no-phone "Ghost Profile" is dropped: 4 in, 3 out.
    expect(out).toHaveLength(3);

    const ada = out[0]!;
    const acme = out[1]!;
    const phoneOnly = out[2]!;

    expect(ada.externalId).toBe("01HXYZABC0001");
    expect(ada.name).toBe("Ada Lovelace");
    // email trimmed + lowercased by cleanEmail.
    expect(ada.email).toBe("ada.lovelace@example.com");
    expect(ada.phone).toBe("+1 (415) 555-0100");
    // raw payload preserved for debugging/enrichment.
    expect(ada.raw).toBe(SAMPLE.data![0]);

    // No first/last → name null.
    expect(acme.externalId).toBe("01HXYZABC0002");
    expect(acme.name).toBeNull();
    expect(acme.email).toBe("billing@acme.co");
    expect(acme.phone).toBeNull();

    // Phone-only profile: no name, no email.
    expect(phoneOnly.externalId).toBe("01HXYZABC0004");
    expect(phoneOnly.name).toBeNull();
    expect(phoneOnly.email).toBeNull();
    expect(phoneOnly.phone).toBe("+44 20 7946 0991");
  });

  it("handles missing/empty/undefined data without throwing", () => {
    expect(mapKlaviyoProfiles(undefined)).toEqual([]);
    expect(mapKlaviyoProfiles(null)).toEqual([]);
    expect(mapKlaviyoProfiles([])).toEqual([]);
  });

  it("ignores profiles missing an id", () => {
    const out = mapKlaviyoProfiles([
      { attributes: { email: "orphan@example.com" } } as never,
      { id: "keep1", attributes: { email: "kept@example.com" } },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.externalId).toBe("keep1");
  });

  it("drops a profile whose email is invalid and has no phone", () => {
    expect(
      mapKlaviyoProfiles([
        { id: "z", attributes: { email: "x@", first_name: "Bad", last_name: "Email" } },
      ]),
    ).toEqual([]);
  });

  it("tolerates a profile with no attributes object", () => {
    expect(mapKlaviyoProfiles([{ id: "noattr" }])).toEqual([]);
  });
});
