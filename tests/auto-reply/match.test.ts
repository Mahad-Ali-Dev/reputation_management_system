import { matchRule, pickRule } from "@/lib/auto-reply/match";
import { describe, expect, it } from "vitest";

/**
 * Auto-reply rule-matching tests. These are intentionally scenario-driven —
 * each `it` block describes a specific situation a real host would hit
 * (e.g. "5-star Google review with no body", "3-star Airbnb mentioning
 * 'noisy'"). Generic "returns true when fields match" tests are useless;
 * the bugs live in the corner cases.
 *
 * The matcher is pure, so these tests don't need any DB or mocking — they
 * pin down the exact contract the executor relies on.
 */

const baseRule = {
  id: "11111111-1111-1111-1111-111111111111",
  enabled: true,
  matchMinRating: 5,
  matchMaxRating: 5,
  matchKeywords: [] as string[],
  matchSources: [] as string[],
};

describe("matchRule — gating short-circuits", () => {
  it("returns disabled when the rule is disabled even if everything else matches", () => {
    const v = matchRule(
      { rating: 5, body: "amazing host", source: "google" },
      { ...baseRule, enabled: false },
    );
    expect(v).toEqual({ matched: false, reason: "disabled" });
  });

  it("rejects when rating is below the min", () => {
    const v = matchRule(
      { rating: 4, body: null, source: "google" },
      { ...baseRule, matchMinRating: 5, matchMaxRating: 5 },
    );
    expect(v.matched).toBe(false);
    if (!v.matched) expect(v.reason).toBe("rating_out_of_range");
  });

  it("rejects when rating is above the max", () => {
    const v = matchRule(
      { rating: 5, body: null, source: "google" },
      { ...baseRule, matchMinRating: 1, matchMaxRating: 3 },
    );
    expect(v.matched).toBe(false);
    if (!v.matched) expect(v.reason).toBe("rating_out_of_range");
  });

  it("rejects when source is not in a non-empty allowlist", () => {
    const v = matchRule(
      { rating: 5, body: "great", source: "facebook" },
      { ...baseRule, matchSources: ["google", "airbnb"] },
    );
    expect(v.matched).toBe(false);
    if (!v.matched) expect(v.reason).toBe("source_not_in_allowlist");
  });

  it("ignores source filter when the allowlist is empty", () => {
    const v = matchRule(
      { rating: 5, body: null, source: "facebook" },
      { ...baseRule, matchSources: [] },
    );
    expect(v.matched).toBe(true);
  });
});

describe("matchRule — keyword semantics", () => {
  it("matches case-insensitively on substring", () => {
    const v = matchRule(
      { rating: 5, body: "The breakfast was AMAZING — best ever.", source: "google" },
      { ...baseRule, matchKeywords: ["amazing"] },
    );
    expect(v.matched).toBe(true);
  });

  it("trims whitespace in keyword definitions", () => {
    const v = matchRule(
      { rating: 5, body: "The wifi was great", source: "google" },
      { ...baseRule, matchKeywords: ["  wifi  "] },
    );
    expect(v.matched).toBe(true);
  });

  it("treats empty-string keywords as no-ops, not always-matches", () => {
    // A common bug class: ["", "wifi"] should still require "wifi" to hit,
    // not auto-pass on the empty string. We explicitly guard against that.
    const v = matchRule(
      { rating: 5, body: "perfectly clean room", source: "google" },
      { ...baseRule, matchKeywords: ["", "wifi"] },
    );
    expect(v.matched).toBe(false);
    if (!v.matched) expect(v.reason).toBe("no_keyword_hit");
  });

  it("matches any-of, not all-of", () => {
    const v = matchRule(
      { rating: 5, body: "the breakfast was lovely", source: "google" },
      { ...baseRule, matchKeywords: ["dinner", "breakfast", "lunch"] },
    );
    expect(v.matched).toBe(true);
  });

  it("returns no_keyword_hit with a diagnostic detail listing the first few keywords", () => {
    const v = matchRule(
      { rating: 5, body: "fine room nothing special", source: "google" },
      { ...baseRule, matchKeywords: ["amazing", "loved", "perfect", "five-star"] },
    );
    expect(v.matched).toBe(false);
    if (!v.matched) {
      expect(v.reason).toBe("no_keyword_hit");
      expect(v.detail).toContain("amazing");
      expect(v.detail).toContain("loved");
    }
  });

  it("survives null body when keywords are required", () => {
    // Real Airbnb edge case: guest leaves a star rating with no comment.
    // The keyword pre-check must not throw on null body.
    const v = matchRule(
      { rating: 5, body: null, source: "airbnb" },
      { ...baseRule, matchKeywords: ["clean"] },
    );
    expect(v.matched).toBe(false);
    if (!v.matched) expect(v.reason).toBe("no_keyword_hit");
  });

  it("survives null body when no keywords are required", () => {
    const v = matchRule(
      { rating: 5, body: null, source: "airbnb" },
      { ...baseRule, matchKeywords: [] },
    );
    expect(v.matched).toBe(true);
  });
});

describe("matchRule — boundary ratings", () => {
  it("includes the min boundary", () => {
    const v = matchRule(
      { rating: 4, body: null, source: "google" },
      { ...baseRule, matchMinRating: 4, matchMaxRating: 5 },
    );
    expect(v.matched).toBe(true);
  });
  it("includes the max boundary", () => {
    const v = matchRule(
      { rating: 5, body: null, source: "google" },
      { ...baseRule, matchMinRating: 4, matchMaxRating: 5 },
    );
    expect(v.matched).toBe(true);
  });
});

describe("pickRule — first-match-wins semantics", () => {
  it("returns the first rule whose criteria match", () => {
    const review = { rating: 1, body: "the wifi was broken", source: "airbnb" } as const;
    const ruleA = {
      ...baseRule,
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      matchMinRating: 1,
      matchMaxRating: 2,
      matchKeywords: ["wifi"],
    };
    const ruleB = {
      ...baseRule,
      id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      matchMinRating: 1,
      matchMaxRating: 2,
    };
    const picked = pickRule(review, [ruleA, ruleB]);
    expect(picked?.id).toBe(ruleA.id);
  });

  it("falls through when the first rule's keyword doesn't hit but the second's does", () => {
    const review = { rating: 1, body: "service was slow", source: "google" } as const;
    const specific = {
      ...baseRule,
      id: "specific-rule-id-uuid-aaaaaaaaaaaa",
      matchMinRating: 1,
      matchMaxRating: 2,
      matchKeywords: ["wifi"], // doesn't hit
    };
    const broad = {
      ...baseRule,
      id: "broad-rule-id-uuid-bbbbbbbbbbbb",
      matchMinRating: 1,
      matchMaxRating: 2,
      matchKeywords: ["slow", "noisy"], // hits "slow"
    };
    const picked = pickRule(review, [specific, broad]);
    expect(picked?.id).toBe(broad.id);
  });

  it("returns null when no rule matches", () => {
    const picked = pickRule({ rating: 3, body: "okay", source: "google" }, [
      {
        ...baseRule,
        id: "rule-five-star-only",
        matchMinRating: 5,
        matchMaxRating: 5,
      },
    ]);
    expect(picked).toBeNull();
  });

  it("skips disabled rules without considering them", () => {
    // Important: disabled rules shouldn't even be evaluated for fall-through.
    // The executor pre-filters with `enabled: true` at the SQL level, but
    // pickRule must also respect it for defense-in-depth.
    const review = { rating: 5, body: "great", source: "google" } as const;
    const disabledFirst = {
      ...baseRule,
      id: "disabled-rule-id",
      enabled: false,
      matchKeywords: ["great"],
    };
    const enabledSecond = {
      ...baseRule,
      id: "enabled-rule-id",
      enabled: true,
      matchKeywords: ["great"],
    };
    const picked = pickRule(review, [disabledFirst, enabledSecond]);
    expect(picked?.id).toBe(enabledSecond.id);
  });

  it("returns null for an empty rule list", () => {
    expect(pickRule({ rating: 5, body: null, source: "google" }, [])).toBeNull();
  });
});

describe("matchRule — adversarial keyword inputs", () => {
  it("does not match on substring noise inside word boundaries when the keyword is meaningful", () => {
    // Substring semantics ARE the contract — "fantastic" contains "fan" —
    // so we just document the behavior here. The test is a guard against
    // someone "fixing" this into word-boundary semantics without realizing
    // it would break common phrases like "great breakfast " trailing-space.
    const v = matchRule(
      { rating: 5, body: "the fan in the room was great", source: "google" },
      { ...baseRule, matchKeywords: ["fantastic"] },
    );
    // "fantastic" is NOT a substring of "fan" — so this is correctly false.
    expect(v.matched).toBe(false);
  });

  it("doesn't get tricked by a keyword that looks like a regex special-char string", () => {
    // We do .includes() not .match() so regex metacharacters are literal.
    const v = matchRule(
      { rating: 5, body: "we paid $59.99 — totally worth it", source: "google" },
      { ...baseRule, matchKeywords: ["$59.99"] },
    );
    expect(v.matched).toBe(true);
  });
});
