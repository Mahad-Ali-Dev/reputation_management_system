import { describe, expect, it } from "vitest";

/**
 * Moderation RULES unit tests (Module 09 — Inbox, Wave 3c-A).
 *
 * Pins the core guardrail behaviour of `evaluateRules` (pure, no I/O):
 *   - explicit keyword blacklist  → AUTO-HIDE (reason "keyword")
 *   - built-in profanity (opt-in)  → AUTO-HIDE (reason "profanity")
 *   - negativity/sentiment         → FLAG-FOR-REVIEW only, NEVER auto-hide
 *   - spam auto-hide is opt-in (flag by default)
 *   - master switch off            → allow everything
 *   - matchMode contains/exact/regex semantics
 *   - config normalization defaults + clamps
 *
 * The Google-exclusion contract is enforced one layer up (queue.evaluateInbound
 * + the source allow-list); see queue.test.ts.
 */

import {
  DEFAULT_MODERATION_CONFIG,
  type KeywordRule,
  type ModerationConfig,
  evaluateRules,
  isMissingRelation,
  normalizeConfig,
} from "@/lib/moderation/rules";

const cfg = (over: Partial<ModerationConfig> = {}): ModerationConfig => ({
  ...DEFAULT_MODERATION_CONFIG,
  ...over,
});

const kw = (keyword: string, matchMode = "contains"): KeywordRule => ({ keyword, matchMode });

describe("evaluateRules — keyword auto-hide", () => {
  it("hides on a contains keyword match", () => {
    const d = evaluateRules(cfg(), [kw("scam")], "this is a total scam, avoid");
    expect(d.action).toBe("hide");
    expect(d.reason).toBe("keyword");
    expect(d.matchedKeyword).toBe("scam");
  });

  it("does NOT match a contains keyword that is absent", () => {
    const d = evaluateRules(cfg(), [kw("scam")], "great service, thank you!");
    expect(d.action).toBe("allow");
  });

  it("exact mode respects word boundaries", () => {
    // "ass" exact should NOT match inside "passionate"
    expect(evaluateRules(cfg(), [kw("ass", "exact")], "I am passionate about food").action).toBe(
      "allow",
    );
    expect(evaluateRules(cfg(), [kw("ass", "exact")], "what an ass").action).toBe("hide");
  });

  it("regex mode matches a pattern", () => {
    const d = evaluateRules(cfg(), [kw("rip[\\s-]?off", "regex")], "total rip-off here");
    expect(d.action).toBe("hide");
    expect(d.reason).toBe("keyword");
  });

  it("malformed regex falls back to substring (never throws)", () => {
    const d = evaluateRules(cfg(), [kw("(unclosed", "regex")], "literally (unclosed text");
    expect(d.action).toBe("hide");
  });

  it("keyword takes precedence over profanity + negativity", () => {
    const d = evaluateRules(cfg(), [kw("avoid")], "avoid this fuck place", 0.99);
    expect(d.reason).toBe("keyword");
    expect(d.matchedKeyword).toBe("avoid");
  });
});

describe("evaluateRules — profanity auto-hide (opt-in)", () => {
  it("hides built-in profanity when blockProfanity is on", () => {
    const d = evaluateRules(cfg({ blockProfanity: true }), [], "this is fucking awful");
    expect(d.action).toBe("hide");
    expect(d.reason).toBe("profanity");
  });

  it("does NOT hide profanity when blockProfanity is off", () => {
    const d = evaluateRules(cfg({ blockProfanity: false, flagNegativity: false }), [], "this is shit");
    // Falls through; with negativity off it's allow.
    expect(d.action).not.toBe("hide");
  });
});

describe("evaluateRules — negativity is FLAG ONLY (never auto-hide)", () => {
  it("flags negative content at/above threshold but never hides it", () => {
    const d = evaluateRules(cfg({ negativityThreshold: 0.7 }), [], "the staff were rude and slow", 0.85);
    expect(d.action).toBe("flag");
    expect(d.reason).toBe("negativity");
    expect(d.matchedKeyword).toBeNull();
  });

  it("allows negative content below threshold", () => {
    const d = evaluateRules(cfg({ negativityThreshold: 0.7 }), [], "could be a bit better", 0.4);
    expect(d.action).toBe("allow");
  });

  it("does not flag negativity when the toggle is off", () => {
    const d = evaluateRules(cfg({ flagNegativity: false }), [], "worst place ever", 0.99);
    expect(d.action).toBe("allow");
  });

  it("legitimate criticism (high score) is flagged, NOT auto-hidden — the safety property", () => {
    const d = evaluateRules(cfg(), [], "I waited an hour and the food was cold, very disappointed", 0.95);
    expect(d.action).toBe("flag");
    expect(d.action).not.toBe("hide");
  });
});

describe("evaluateRules — spam", () => {
  it("flags spam by default (autoHideSpam off)", () => {
    const d = evaluateRules(cfg({ autoHideSpam: false }), [], "FREE MONEY click here http://x.io");
    expect(d.action).toBe("flag");
    expect(d.reason).toBe("spam");
  });

  it("auto-hides spam when explicitly enabled", () => {
    const d = evaluateRules(cfg({ autoHideSpam: true }), [], "earn $$$ http://x.io https://y.io");
    expect(d.action).toBe("hide");
    expect(d.reason).toBe("spam");
  });
});

describe("evaluateRules — master switch + empties", () => {
  it("allows everything when disabled", () => {
    const d = evaluateRules(cfg({ enabled: false }), [kw("scam")], "scam scam fuck");
    expect(d.action).toBe("allow");
  });

  it("allows empty / whitespace body", () => {
    expect(evaluateRules(cfg(), [kw("scam")], "   ").action).toBe("allow");
    expect(evaluateRules(cfg(), [kw("scam")], "").action).toBe("allow");
  });
});

describe("normalizeConfig", () => {
  it("fills defaults from an empty/undefined blob", () => {
    expect(normalizeConfig(undefined)).toEqual(DEFAULT_MODERATION_CONFIG);
    expect(normalizeConfig({})).toEqual(DEFAULT_MODERATION_CONFIG);
  });

  it("clamps an out-of-range threshold back to the default", () => {
    expect(normalizeConfig({ negativityThreshold: 5 }).negativityThreshold).toBe(0.7);
    expect(normalizeConfig({ negativityThreshold: 0 }).negativityThreshold).toBe(0.7);
    expect(normalizeConfig({ negativityThreshold: 0.55 }).negativityThreshold).toBe(0.55);
  });

  it("preserves explicit booleans", () => {
    const c = normalizeConfig({ blockProfanity: false, autoHideSpam: true });
    expect(c.blockProfanity).toBe(false);
    expect(c.autoHideSpam).toBe(true);
  });
});

describe("isMissingRelation", () => {
  it("recognizes the not-migrated error codes", () => {
    expect(isMissingRelation({ code: "42P01" })).toBe(true);
    expect(isMissingRelation({ code: "42703" })).toBe(true);
    expect(isMissingRelation({ code: "P2021" })).toBe(true);
    expect(isMissingRelation({ code: "P2022" })).toBe(true);
    expect(isMissingRelation({ code: "40P01" })).toBe(false);
    expect(isMissingRelation(new Error("x"))).toBe(false);
  });
});
