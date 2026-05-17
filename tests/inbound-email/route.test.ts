import { extractOrgSlugFromInboundAddress } from "@/lib/inbound-email/route-and-ingest";
import { describe, expect, it } from "vitest";

/**
 * Inbound address-routing tests.
 *
 * The router is the trust boundary between "any email on the internet" and
 * "a specific org's review inbox." If it misroutes, an attacker who can
 * forge an envelope-To header (limited but possible in some MTA chains)
 * could inject reviews into another tenant's inbox. So the parser is
 * deliberately strict:
 *   - lowercase the input
 *   - strip RFC 2822 display-name wrappers
 *   - take only the first address on a multi-recipient list
 *   - require exact `reviews-<slug>@inbound.repulabs.com` shape
 *   - reject slugs outside the org-slug character class
 *
 * Each test below targets one of those rules. If you change the routing
 * regex, this file MUST tell you what broke.
 */

describe("extractOrgSlugFromInboundAddress", () => {
  it("happy path: bare lowercase address", () => {
    expect(extractOrgSlugFromInboundAddress("reviews-acme@inbound.repulabs.com")).toBe("acme");
  });

  it("happy path: slug with hyphens and digits", () => {
    expect(extractOrgSlugFromInboundAddress("reviews-cliff-house-2026@inbound.repulabs.com")).toBe(
      "cliff-house-2026",
    );
  });

  it("normalizes upper-case input", () => {
    expect(extractOrgSlugFromInboundAddress("Reviews-ACME@Inbound.Repulabs.Com")).toBe("acme");
  });

  it("strips RFC 2822 display name", () => {
    expect(
      extractOrgSlugFromInboundAddress(
        '"Cliff House Inbox" <reviews-cliff-house@inbound.repulabs.com>',
      ),
    ).toBe("cliff-house");
  });

  it("takes the first address from a multi-recipient list", () => {
    expect(
      extractOrgSlugFromInboundAddress(
        "reviews-first-org@inbound.repulabs.com, reviews-second-org@inbound.repulabs.com",
      ),
    ).toBe("first-org");
  });

  it("rejects addresses to a different domain (anti-spoof)", () => {
    expect(extractOrgSlugFromInboundAddress("reviews-acme@evil.example")).toBeNull();
  });

  it("rejects bookings- prefix (not yet supported)", () => {
    expect(extractOrgSlugFromInboundAddress("bookings-acme@inbound.repulabs.com")).toBeNull();
  });

  it("rejects a slug that starts with a hyphen", () => {
    // Our org-slug regex doesn't allow leading hyphens; the router enforces
    // the same constraint to avoid weird matches.
    expect(extractOrgSlugFromInboundAddress("reviews--bad@inbound.repulabs.com")).toBeNull();
  });

  it("rejects a slug that ends with a hyphen", () => {
    expect(extractOrgSlugFromInboundAddress("reviews-bad-@inbound.repulabs.com")).toBeNull();
  });

  it("rejects a single-character slug", () => {
    // Our slugs must be 2–64 chars; one-char is reserved and shouldn't route.
    expect(extractOrgSlugFromInboundAddress("reviews-x@inbound.repulabs.com")).toBeNull();
  });

  it("rejects a 64-char slug + 1 (over the limit)", () => {
    const tooLong = "a".repeat(65);
    expect(extractOrgSlugFromInboundAddress(`reviews-${tooLong}@inbound.repulabs.com`)).toBeNull();
  });

  it("rejects underscores in slug (only hyphens allowed)", () => {
    expect(extractOrgSlugFromInboundAddress("reviews-bad_slug@inbound.repulabs.com")).toBeNull();
  });

  it("rejects dots in slug (subdomain injection attempt)", () => {
    expect(
      extractOrgSlugFromInboundAddress("reviews-evil.attacker@inbound.repulabs.com"),
    ).toBeNull();
  });

  it("rejects email with no local-part hyphen", () => {
    expect(extractOrgSlugFromInboundAddress("reviews@inbound.repulabs.com")).toBeNull();
  });

  it("rejects empty string", () => {
    expect(extractOrgSlugFromInboundAddress("")).toBeNull();
  });

  it("rejects whitespace-only", () => {
    expect(extractOrgSlugFromInboundAddress("   ")).toBeNull();
  });

  it("handles trailing whitespace gracefully", () => {
    expect(extractOrgSlugFromInboundAddress("  reviews-acme@inbound.repulabs.com  ")).toBe("acme");
  });
});
