import { describe, expect, it } from "vitest";
import {
  formatAddress,
  outreachValues,
  resolveMergeTags,
  sampleContext,
} from "@/lib/outreach/merge-tags";

/**
 * Outreach merge-tags wrapper — verifies it resolves the spec's double-brace
 * tags AND the legacy camelCase aliases through the canonical engine, derives
 * first/last from a full name, and leaves unknown tags handled per options.
 */

describe("resolveMergeTags", () => {
  const ctx = {
    recipientName: "Jordan Smith",
    businessName: "Summit Dental",
    reviewLink: "https://g.page/r/x/review",
    establishmentAddress: "1 Main St, Austin",
  };

  it("substitutes all five new {{...}} tags", () => {
    const tpl =
      "Hi {{first_name}} {{last_name}}, thanks for visiting {{business_name}} at {{establishment_address}}: {{review_link}}";
    expect(resolveMergeTags(tpl, ctx)).toBe(
      "Hi Jordan Smith, thanks for visiting Summit Dental at 1 Main St, Austin: https://g.page/r/x/review",
    );
  });

  it("still resolves legacy camelCase tags ({{customerName}}/{{businessName}}/{{reviewLink}})", () => {
    const tpl = "Hi {{customerName}}, review {{businessName}}: {{reviewLink}}";
    expect(resolveMergeTags(tpl, ctx)).toBe(
      "Hi Jordan Smith, review Summit Dental: https://g.page/r/x/review",
    );
  });

  it("derives first/last from recipientName when explicit parts absent", () => {
    const v = outreachValues({ recipientName: "Maria Garcia Lopez", businessName: "B", reviewLink: "L" });
    expect(v.first_name).toBe("Maria");
    expect(v.last_name).toBe("Garcia Lopez");
  });

  it("prefers explicit firstName/lastName over derived", () => {
    const v = outreachValues({
      recipientName: "Ignore Me",
      firstName: "Sam",
      lastName: "Lee",
      businessName: "B",
      reviewLink: "L",
    });
    expect(v.first_name).toBe("Sam");
    expect(v.last_name).toBe("Lee");
  });

  it("falls back to 'there' for first_name when no name", () => {
    const v = outreachValues({ businessName: "B", reviewLink: "L" });
    expect(v.first_name).toBe("there");
    expect(v.customerName).toBe("there");
  });

  it("drops unknown tags by default, keeps them with keepUnknown", () => {
    const tpl = "Hello {{mystery}}!";
    expect(resolveMergeTags(tpl, ctx)).toBe("Hello !");
    expect(resolveMergeTags(tpl, ctx, { keepUnknown: true })).toBe("Hello {{mystery}}!");
  });

  it("does NOT substitute single-brace {tag} (canonical syntax is double-brace)", () => {
    const tpl = "Hi {first_name}, see {review_link}";
    expect(resolveMergeTags(tpl, ctx)).toBe("Hi {first_name}, see {review_link}");
  });
});

describe("sampleContext", () => {
  it("returns stable preview values", () => {
    const c = sampleContext("Acme", "9 Pine Rd");
    expect(c.firstName).toBe("Jordan");
    expect(c.businessName).toBe("Acme");
    expect(c.establishmentAddress).toBe("9 Pine Rd");
    expect(c.reviewLink).toContain("http");
  });

  it("supplies defaults when args omitted", () => {
    const c = sampleContext("");
    expect(c.businessName).toBe("Your Business");
    expect(c.establishmentAddress).toBeTruthy();
  });
});

describe("formatAddress", () => {
  it("formats the create-form shape (line1/state/postalCode)", () => {
    expect(
      formatAddress({ line1: "412 Congress Ave", city: "Austin", state: "TX", postalCode: "78701" }),
    ).toBe("412 Congress Ave, Austin, TX, 78701");
  });

  it("formats the legacy shape (street/region/postcode)", () => {
    expect(formatAddress({ street: "1 High St", city: "Leeds", region: "WY", postcode: "LS1" })).toBe(
      "1 High St, Leeds, WY, LS1",
    );
  });

  it("returns empty string for null/garbage", () => {
    expect(formatAddress(null)).toBe("");
    expect(formatAddress("nope")).toBe("");
    expect(formatAddress({})).toBe("");
  });
});
