import { describe, expect, it } from "vitest";
import {
  COMMON_TAGS,
  extractMergeTags,
  renderMergeTags,
  sampleDataFromTags,
  validateMergeTags,
} from "@/lib/merge-tags";

/**
 * Canonical merge-tag engine (00_foundation §A5) — the single resolver Steps 7
 * (review-request templates) and 11 (survey invites) share. These tests pin the
 * load-bearing decisions documented in the module header so a future refactor
 * can't silently re-introduce template-syntax drift:
 *
 *   - double-brace `{{tag}}` substitutes; single-brace `{tag}` is LITERAL text
 *   - unknown tags drop to "" by default, or stay literal under keepUnknown
 *   - extract/validate are pure functions of the template text
 *   - the rendered (substituted) length — not the raw template — is what an SMS
 *     segment counter must measure
 *
 * The module is pure (no React, no I/O) so it is node-env safe (vitest is
 * configured environment:"node").
 */

const VALUES = {
  first_name: "Alex",
  businessName: "Summit Dental Studio",
  reviewLink: "https://g.page/r/abc/review",
};

describe("renderMergeTags — substitution", () => {
  it("substitutes a known double-brace tag", () => {
    expect(renderMergeTags("Hi {{first_name}}!", VALUES)).toBe("Hi Alex!");
  });

  it("substitutes multiple distinct tags in one template", () => {
    const out = renderMergeTags(
      "Hi {{first_name}}, please review {{businessName}}: {{reviewLink}}",
      VALUES,
    );
    expect(out).toBe(
      "Hi Alex, please review Summit Dental Studio: https://g.page/r/abc/review",
    );
  });

  it("tolerates inner whitespace and trims the key ({{ first_name }})", () => {
    expect(renderMergeTags("Hi {{ first_name }}!", VALUES)).toBe("Hi Alex!");
  });

  it("is case-sensitive on keys (matches existing {{customerName}} rows)", () => {
    // `first_name` is known; `First_Name` is a DIFFERENT, unknown key.
    expect(renderMergeTags("{{First_Name}}", VALUES)).toBe("");
  });

  it("renders a null/undefined value as empty string, not the literal", () => {
    // hasOwnProperty is true but the value is null → coerced to "".
    expect(
      renderMergeTags("[{{x}}]", { x: null as unknown as string }),
    ).toBe("[]");
    expect(
      renderMergeTags("[{{x}}]", { x: undefined as unknown as string }),
    ).toBe("[]");
  });

  it("returns '' for an empty/falsy template", () => {
    expect(renderMergeTags("", VALUES)).toBe("");
  });

  it("supports dotted keys like {{business.name}}", () => {
    expect(
      renderMergeTags("{{business.name}}", { "business.name": "Acme" }),
    ).toBe("Acme");
  });
});

describe("renderMergeTags — unknown tags (both keepUnknown modes)", () => {
  it("DROPS unknown tags to '' by default (safe customer-facing send)", () => {
    expect(renderMergeTags("Hi {{nope}} there", VALUES)).toBe("Hi  there");
  });

  it("KEEPS the literal {{tag}} when keepUnknown:true (chained/partial render)", () => {
    expect(
      renderMergeTags("Hi {{nope}} there", VALUES, { keepUnknown: true }),
    ).toBe("Hi {{nope}} there");
  });

  it("keepUnknown re-emits the NORMALIZED (trimmed) key", () => {
    // `{{ nope }}` → kept as `{{nope}}` (whitespace inside braces normalized).
    expect(
      renderMergeTags("{{ nope }}", VALUES, { keepUnknown: true }),
    ).toBe("{{nope}}");
  });

  it("keepUnknown still substitutes KNOWN tags (mixed template)", () => {
    expect(
      renderMergeTags("{{first_name}} / {{nope}}", VALUES, { keepUnknown: true }),
    ).toBe("Alex / {{nope}}");
  });
});

describe("renderMergeTags — single-brace is LITERAL (the non-match guarantee)", () => {
  it("leaves single-brace text untouched (no substitution, default mode)", () => {
    expect(renderMergeTags("Hi {first_name}!", VALUES)).toBe("Hi {first_name}!");
  });

  it("leaves single-brace text untouched even with keepUnknown", () => {
    expect(
      renderMergeTags("Hi {first_name}!", VALUES, { keepUnknown: true }),
    ).toBe("Hi {first_name}!");
  });

  it("does not treat a lone brace pair {} or stray braces as a tag", () => {
    expect(renderMergeTags("a {} b } c {", VALUES)).toBe("a {} b } c {");
  });
});

describe("extractMergeTags", () => {
  it("returns [] for empty input", () => {
    expect(extractMergeTags("")).toEqual([]);
  });

  it("returns distinct keys in first-appearance order, duplicates collapsed", () => {
    expect(
      extractMergeTags("{{a}} {{b}} {{a}} text {{c}} {{b}}"),
    ).toEqual(["a", "b", "c"]);
  });

  it("trims keys and ignores single-brace text", () => {
    expect(extractMergeTags("{{ first_name }} and {literal}")).toEqual([
      "first_name",
    ]);
  });

  it("does not share regex lastIndex state across calls (g-flag safety)", () => {
    // Two consecutive calls on a tag-bearing template must both find it; a
    // leaked stateful global RegExp would make the 2nd call miss.
    expect(extractMergeTags("{{x}}")).toEqual(["x"]);
    expect(extractMergeTags("{{x}}")).toEqual(["x"]);
  });
});

describe("validateMergeTags", () => {
  const ALLOWED = ["first_name", "businessName", "reviewLink"];

  it("reports no unknowns when every tag is allowed", () => {
    expect(
      validateMergeTags("Hi {{first_name}} — {{businessName}}", ALLOWED),
    ).toEqual({ unknown: [] });
  });

  it("reports the unknown keys (template-present, not in allowed set)", () => {
    expect(
      validateMergeTags("{{first_name}} {{coupon}} {{ssn}}", ALLOWED).unknown,
    ).toEqual(["coupon", "ssn"]);
  });

  it("normalizes the allowed set (trims) before comparison", () => {
    expect(
      validateMergeTags("{{first_name}}", ["  first_name  "]).unknown,
    ).toEqual([]);
  });

  it("an empty template is always valid", () => {
    expect(validateMergeTags("", ALLOWED)).toEqual({ unknown: [] });
  });

  it("COMMON_TAGS keys validate a template built from those tags", () => {
    const tpl = COMMON_TAGS.map((t) => `{{${t.key}}}`).join(" ");
    expect(
      validateMergeTags(
        tpl,
        COMMON_TAGS.map((t) => t.key),
      ).unknown,
    ).toEqual([]);
  });
});

describe("sampleDataFromTags", () => {
  it("builds a key→example map (defaults to COMMON_TAGS)", () => {
    const sample = sampleDataFromTags();
    expect(sample.first_name).toBe("Alex");
    expect(sample.businessName).toBe("Summit Dental Studio");
  });

  it("renders a template using only sample data (the editor preview path)", () => {
    const sample = sampleDataFromTags();
    expect(renderMergeTags("Hi {{first_name}} from {{businessName}}", sample)).toBe(
      "Hi Alex from Summit Dental Studio",
    );
  });

  it("honors a bespoke tag list", () => {
    expect(
      sampleDataFromTags([{ key: "code", label: "Code", example: "1234" }]),
    ).toEqual({ code: "1234" });
  });
});

describe("SMS-length edge — measure the RENDERED length, not the template", () => {
  // A segment counter that measures the raw template over-counts because the
  // braces+key are longer than the substituted value, OR under-counts when the
  // value is longer. The contract: callers must length-check the rendered body.
  const SMS_SEGMENT = 160;

  it("rendered length differs from raw template length (value < placeholder)", () => {
    const tpl = "Hi {{first_name}}"; // 17 chars
    const rendered = renderMergeTags(tpl, { first_name: "Al" }); // "Hi Al" = 5
    expect(tpl.length).toBe(17);
    expect(rendered.length).toBe(5);
    expect(rendered.length).not.toBe(tpl.length);
  });

  it("rendered length can EXCEED the template when the value is long", () => {
    const tpl = "{{reviewLink}}"; // 14 chars
    const longUrl = "https://g.page/r/" + "a".repeat(300) + "/review";
    const rendered = renderMergeTags(tpl, { reviewLink: longUrl });
    expect(rendered.length).toBe(longUrl.length);
    expect(rendered.length).toBeGreaterThan(tpl.length);
  });

  it("a template that fits one segment can overflow once rendered", () => {
    const tpl = "Visit {{reviewLink}} for {{businessName}}"; // well under 160
    expect(tpl.length).toBeLessThanOrEqual(SMS_SEGMENT);
    const rendered = renderMergeTags(tpl, {
      reviewLink: "https://example.com/r/" + "x".repeat(160),
      businessName: "A Very Long Business Name LLC",
    });
    // The send-time check must use `rendered.length`, which here exceeds one
    // segment even though the authored template did not.
    expect(rendered.length).toBeGreaterThan(SMS_SEGMENT);
  });

  it("dropped unknowns shorten the rendered body (counter must reflect drop)", () => {
    const tpl = "Hello {{missing}} world"; // 23 chars raw
    const rendered = renderMergeTags(tpl, {}); // "Hello  world" = 12
    expect(rendered).toBe("Hello  world");
    expect(rendered.length).toBeLessThan(tpl.length);
  });
});
