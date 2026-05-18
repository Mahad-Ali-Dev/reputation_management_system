import {
  defaultFromAddress,
  escapeHtml,
  firstName,
  formatHuman,
  sanitizeDisplay,
} from "@/lib/email/booking-confirmation";
import { describe, expect, it } from "vitest";

/**
 * Booking-confirmation rendering helpers.
 *
 * These helpers run on AI-receptionist-supplied inputs (attendeeName,
 * attendeePhone, notes), so the test focus is XSS-prevention + RFC 5322
 * From-header safety, not happy-path behavior.
 *
 * Specific things we test against:
 *   - Script tags in attendee names (a malicious caller pretending to
 *     be `<script>alert(1)</script>` for fun)
 *   - From-header injection via display name (a comma or angle bracket
 *     could otherwise let an attacker craft a second recipient)
 *   - Timezone fall-through when the AI captured a bogus tz
 *   - First-name extraction with international name patterns
 */

describe("escapeHtml — XSS gate", () => {
  it("escapes the four HTML metachars + ampersand + apostrophe", () => {
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
    expect(escapeHtml(`"O'Brien"`)).toBe("&quot;O&#39;Brien&quot;");
    expect(escapeHtml("A & B")).toBe("A &amp; B");
  });

  it("escapes ampersand FIRST so we don't double-escape", () => {
    // If you escape & after <, then "&lt;" becomes "&amp;lt;". This pin
    // catches that regression: input "<&>" must produce "&lt;&amp;&gt;".
    expect(escapeHtml("<&>")).toBe("&lt;&amp;&gt;");
  });

  it("leaves safe text untouched", () => {
    expect(escapeHtml("Just a normal name")).toBe("Just a normal name");
  });

  it("handles empty string", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("escapes a real-world XSS attempt — opening bracket is killed so the tag can't be parsed", () => {
    // The contract is "no actionable HTML tag in the output". Once `<`
    // is gone, the rest is inert text — `onerror=` as plaintext is fine.
    const payload = `<img src=x onerror="alert(1)">`;
    const out = escapeHtml(payload);
    expect(out).not.toContain("<img");
    expect(out).not.toContain(">"); // raw closer also gone
    expect(out).toContain("&lt;img");
    expect(out).toContain("&quot;alert(1)&quot;"); // attribute value is escaped
  });
});

describe("sanitizeDisplay — RFC 5322 From-header safety", () => {
  it("strips comma, semicolon, double-quote, and angle brackets", () => {
    // These are the characters that, if left in the display-name portion
    // of a From header, can be interpreted as a second recipient or break
    // the quoting model. We have to strip BEFORE concatenation.
    expect(sanitizeDisplay(`Acme "Inc.", Ltd.`)).toBe("Acme Inc. Ltd.");
    expect(sanitizeDisplay("evil>bob@elsewhere.com<")).toBe("evilbob@elsewhere.com");
  });

  it("trims surrounding whitespace", () => {
    expect(sanitizeDisplay("   Cliff House   ")).toBe("Cliff House");
  });

  it("caps display name at 60 chars", () => {
    const long = "x".repeat(200);
    expect(sanitizeDisplay(long).length).toBe(60);
  });

  it("returns empty string for whitespace-only input", () => {
    expect(sanitizeDisplay("   ")).toBe("");
  });
});

describe("defaultFromAddress", () => {
  it("uses the business display name when present", () => {
    const out = defaultFromAddress("Cliff House");
    // We can't pin the email side because EMAIL_FROM may vary in CI, so we
    // assert just the structure: `${display} <${verified}>`.
    expect(out).toMatch(/^Cliff House <[^>]+@[^>]+>$/);
  });

  it("falls back to the bare email when display name is unsafe-only", () => {
    // After sanitizing, ',<>";' becomes empty — should just return the email.
    const out = defaultFromAddress(`,,,;<<>>"`);
    expect(out).not.toContain("<");
    expect(out).toMatch(/@/);
  });

  it("never produces a value containing < or > outside the angle-bracketed email", () => {
    // The single source of < and > should be the email-wrapper, never the
    // display name (which would be a From-header injection).
    const out = defaultFromAddress("Evil>Co");
    // Count of angle brackets: exactly one pair (the email wrapper).
    const opens = (out.match(/</g) ?? []).length;
    const closes = (out.match(/>/g) ?? []).length;
    expect(opens).toBe(1);
    expect(closes).toBe(1);
  });
});

describe("firstName", () => {
  it("returns the first whitespace-separated token", () => {
    expect(firstName("Maria Lopez")).toBe("Maria");
  });

  it("handles single-word names", () => {
    expect(firstName("Cher")).toBe("Cher");
  });

  it("trims surrounding whitespace", () => {
    expect(firstName("   Sarah   Chen   ")).toBe("Sarah");
  });

  it("handles hyphenated first names as one token (no truncation)", () => {
    expect(firstName("Anne-Marie Dupont")).toBe("Anne-Marie");
  });

  it("falls back to trimmed input when empty after split", () => {
    expect(firstName("")).toBe("");
  });
});

describe("formatHuman — timezone handling", () => {
  it("formats in the supplied timezone with weekday + time + tz suffix", () => {
    const d = new Date("2026-06-15T14:00:00Z"); // 2 PM UTC
    const out = formatHuman(d, "America/New_York"); // 10 AM EDT
    expect(out).toMatch(/10:00/);
    // Date-fns/Intl emits "EDT" or "GMT-4" depending on environment — accept
    // either; the goal is "tz is rendered somewhere".
    expect(out).toMatch(/(EDT|GMT-4|EST)/);
  });

  it("falls back to UTC when the supplied timezone is invalid", () => {
    // toLocaleString with an invalid tz throws RangeError in Node — the
    // function must catch and re-format in UTC instead of crashing the
    // email send.
    const d = new Date("2026-06-15T14:00:00Z");
    const out = formatHuman(d, "Definitely/Not/A/Real/Timezone");
    expect(out).toMatch(/2026|14:00|2:00/); // UTC format renders
    expect(out.length).toBeGreaterThan(0);
  });

  it("formats midnight cleanly (no '24:00' or weird AM/PM)", () => {
    const d = new Date("2026-06-15T00:00:00Z");
    const out = formatHuman(d, "UTC");
    expect(out).toMatch(/12:00/); // 12 AM in 12-hour format
  });
});
