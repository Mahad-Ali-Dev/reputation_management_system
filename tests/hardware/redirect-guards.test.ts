import { describe, expect, it } from "vitest";
import {
  isAllowedReviewHost,
  isStorableRedirectUrl,
} from "@/lib/hardware/codes";

/**
 * Critical security tests: the two functions that gate the QR open-redirect
 * surface. Regressions here would re-introduce H-1 in the security audit
 * (repulabs.com used as first-hop laundering domain for phishing).
 *
 * If you touch isAllowedReviewHost or isStorableRedirectUrl in
 * `lib/hardware/codes.ts`, make sure this test still passes — and add a
 * positive + negative case for any new behavior.
 */

describe("isAllowedReviewHost", () => {
  it("allows the canonical Google review host variants", () => {
    const allowed = [
      "https://search.google.com/local/writereview?placeid=abc",
      "https://google.com/search?q=foo",
      "https://www.google.com/maps/place/abc",
      "https://maps.google.com/?cid=123",
      "https://business.google.com/dashboard",
      "https://g.page/r/aaaaaa",
      "https://goo.gl/abc",
      "https://www.google.co.uk/maps",
      "https://google.com.au/search",
      "https://google.co.in/foo",
    ];
    for (const url of allowed) {
      expect(isAllowedReviewHost(url), `should allow ${url}`).toBe(true);
    }
  });

  it("rejects look-alike phishing hosts that contain google.com as a suffix-of-token", () => {
    // host = "evil.com" — pure phishing
    expect(isAllowedReviewHost("https://evil.com/google.com")).toBe(false);
    // host = "google.com.attacker.com" — substring not at dot boundary on the right
    expect(isAllowedReviewHost("https://google.com.attacker.com/?q=foo")).toBe(false);
    // host = "fakegoogle.com" — endsWith("google.com") true but no dot prefix
    expect(isAllowedReviewHost("https://fakegoogle.com/foo")).toBe(false);
    // Path containing google.com doesn't change the host
    expect(isAllowedReviewHost("https://attacker.tld/?u=https://google.com")).toBe(false);
  });

  it("rejects non-http(s) schemes regardless of host", () => {
    expect(isAllowedReviewHost("javascript:alert(1)//google.com")).toBe(false);
    expect(isAllowedReviewHost("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isAllowedReviewHost("file:///etc/passwd")).toBe(false);
  });

  it("rejects IP-literal hosts", () => {
    expect(isAllowedReviewHost("http://127.0.0.1/google.com")).toBe(false);
    expect(isAllowedReviewHost("http://10.0.0.1/")).toBe(false);
    expect(isAllowedReviewHost("http://192.168.1.1/")).toBe(false);
  });

  it("rejects malformed URLs", () => {
    expect(isAllowedReviewHost("not-a-url")).toBe(false);
    expect(isAllowedReviewHost("")).toBe(false);
    expect(isAllowedReviewHost("https:///")).toBe(false);
  });
});

describe("isStorableRedirectUrl", () => {
  it("accepts plausible review and business destinations", () => {
    const accepted = [
      "https://search.google.com/local/writereview?placeid=abc",
      "https://g.page/r/aaa",
      "https://www.yelp.com/biz/abc", // non-Google but legitimate → interstitial-gated
      "https://www.trustpilot.com/review/example.com",
      "https://www.example.com/review-us",
      "http://example.com/review", // http allowed; interstitial covers risk
    ];
    for (const url of accepted) {
      expect(isStorableRedirectUrl(url), `should accept ${url}`).toBe(true);
    }
  });

  it("rejects non-http(s) schemes (XSS payloads, exfil vectors)", () => {
    expect(isStorableRedirectUrl("javascript:alert(document.cookie)")).toBe(false);
    expect(isStorableRedirectUrl("data:text/html,<script>")).toBe(false);
    expect(isStorableRedirectUrl("file:///etc/hosts")).toBe(false);
    expect(isStorableRedirectUrl("ftp://example.com/")).toBe(false);
    expect(isStorableRedirectUrl("vbscript:Msgbox(1)")).toBe(false);
  });

  it("rejects IPv4-literal hosts (defeats SSRF-style abuse)", () => {
    expect(isStorableRedirectUrl("http://127.0.0.1/")).toBe(false);
    expect(isStorableRedirectUrl("http://10.0.0.1/")).toBe(false);
    expect(isStorableRedirectUrl("http://192.168.1.1/")).toBe(false);
    expect(isStorableRedirectUrl("https://8.8.8.8/")).toBe(false);
  });

  it("rejects localhost in production but allows in dev", () => {
    const prev = process.env.NODE_ENV;
    try {
      // @ts-expect-error — readonly in @types/node, but Node lets us reassign at runtime
      process.env.NODE_ENV = "production";
      expect(isStorableRedirectUrl("http://localhost:3000/")).toBe(false);
      expect(isStorableRedirectUrl("http://foo.localhost/")).toBe(false);

      // @ts-expect-error — see above
      process.env.NODE_ENV = "development";
      expect(isStorableRedirectUrl("http://localhost:3000/")).toBe(true);
    } finally {
      // @ts-expect-error — see above
      process.env.NODE_ENV = prev;
    }
  });

  it("rejects malformed inputs", () => {
    expect(isStorableRedirectUrl("")).toBe(false);
    expect(isStorableRedirectUrl("not-a-url")).toBe(false);
    // `new URL("https:///path-only")` normalizes to https://path-only/ — that's
    // a valid (if non-resolving) URL. Not an attack vector; we accept it.
    expect(isStorableRedirectUrl("https://")).toBe(false);
  });
});
