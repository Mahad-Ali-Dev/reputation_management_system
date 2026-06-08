import { describe, expect, it } from "vitest";
import {
  type AutopilotPolicy,
  DEFAULT_LOOPS,
  policyFromRow,
  shouldAutoAct,
} from "@/lib/autopilot/policy";

/**
 * Pure decision-matrix tests for `shouldAutoAct` + `policyFromRow`.
 * No DB, no mocks — the risk semantics live in one file so they live in one test.
 */

function policy(
  overrides: Partial<Omit<AutopilotPolicy, "loops">> & { loops?: Partial<AutopilotPolicy["loops"]> } = {},
): AutopilotPolicy {
  const { loops: loopOverrides, ...rest } = overrides;
  return {
    enabled: true,
    riskTolerance: "balanced",
    weeklyDigestEnabled: true,
    ...rest,
    loops: { ...DEFAULT_LOOPS, ...(loopOverrides ?? {}) },
  };
}

describe("policyFromRow", () => {
  it("defaults to Autopilot OFF when there is no config row", () => {
    const p = policyFromRow(null);
    expect(p.enabled).toBe(false);
    expect(p.riskTolerance).toBe("balanced");
    expect(p.weeklyDigestEnabled).toBe(true);
  });

  it("maps a row faithfully and normalizes an unknown risk to balanced", () => {
    const p = policyFromRow({
      enabled: true,
      riskTolerance: "wild",
      autoReply5Star: false,
      escalateToHuman: false,
    });
    expect(p.enabled).toBe(true);
    expect(p.riskTolerance).toBe("balanced");
    expect(p.loops.autoReply5Star).toBe(false);
    expect(p.loops.escalateToHuman).toBe(false);
  });
});

describe("shouldAutoAct — master switch", () => {
  it("never auto-acts when Autopilot is disabled (escalates by default)", () => {
    const p = policy({ enabled: false });
    expect(shouldAutoAct(p, "auto_reply", { rating: 5, confidence: 1 })).toBe("escalate");
    expect(shouldAutoAct(p, "review_request")).toBe("escalate");
    expect(shouldAutoAct(p, "voice_review")).toBe("escalate");
  });

  it("disabled + escalateToHuman off → draft (still never auto)", () => {
    const p = policy({ enabled: false, loops: { escalateToHuman: false } });
    expect(shouldAutoAct(p, "auto_reply", { rating: 5, confidence: 1 })).toBe("draft");
    expect(shouldAutoAct(p, "review_request")).toBe("draft");
  });

  it("a blocked safety verdict always escalates, even at 5★", () => {
    const p = policy({ riskTolerance: "aggressive" });
    expect(shouldAutoAct(p, "auto_reply", { rating: 5, confidence: 1, blocked: true })).toBe(
      "escalate",
    );
  });

  it("forceEscalate (e.g. complaint intent) always escalates", () => {
    const p = policy({ riskTolerance: "aggressive" });
    expect(shouldAutoAct(p, "inbox_reply", { confidence: 1, forceEscalate: true })).toBe(
      "escalate",
    );
  });
});

describe("shouldAutoAct — auto_reply rating matrix", () => {
  it("5★ auto only when enabled && toggle on && risk != conservative && confidence clears floor", () => {
    // balanced + high confidence → auto
    expect(shouldAutoAct(policy(), "auto_reply", { rating: 5, confidence: 0.9 })).toBe("auto");
    // conservative → draft, never auto
    expect(
      shouldAutoAct(policy({ riskTolerance: "conservative" }), "auto_reply", {
        rating: 5,
        confidence: 1,
      }),
    ).toBe("draft");
    // toggle off → escalate (fallback)
    expect(
      shouldAutoAct(policy({ loops: { autoReply5Star: false } }), "auto_reply", {
        rating: 5,
        confidence: 1,
      }),
    ).toBe("escalate");
  });

  it("5★ below the confidence floor drafts instead of auto", () => {
    // balanced floor is 0.7
    expect(shouldAutoAct(policy(), "auto_reply", { rating: 5, confidence: 0.5 })).toBe("draft");
    // aggressive floor is 0.5 → the same confidence now auto-acts
    expect(
      shouldAutoAct(policy({ riskTolerance: "aggressive" }), "auto_reply", {
        rating: 5,
        confidence: 0.5,
      }),
    ).toBe("auto");
  });

  it("5★ with unknown confidence never auto-acts (cautious → draft)", () => {
    expect(shouldAutoAct(policy(), "auto_reply", { rating: 5 })).toBe("draft");
    expect(shouldAutoAct(policy(), "auto_reply", { rating: 5, confidence: null })).toBe("draft");
  });

  it("low-star (1–4★) is NEVER auto — drafts when drafting is on", () => {
    for (const rating of [1, 2, 3, 4]) {
      expect(
        shouldAutoAct(policy({ riskTolerance: "aggressive" }), "auto_reply", {
          rating,
          confidence: 1,
        }),
      ).toBe("draft");
    }
  });

  it("low-star with drafting OFF escalates (or drafts if escalation off) — never auto", () => {
    const p = policy({ loops: { draftLowStar: false } });
    expect(shouldAutoAct(p, "auto_reply", { rating: 1, confidence: 1 })).toBe("escalate");
    const p2 = policy({ loops: { draftLowStar: false, escalateToHuman: false } });
    expect(shouldAutoAct(p2, "auto_reply", { rating: 1, confidence: 1 })).toBe("draft");
  });
});

describe("shouldAutoAct — other loops", () => {
  it("review_request auto when on + non-conservative; drafts when conservative", () => {
    expect(shouldAutoAct(policy(), "review_request")).toBe("auto");
    expect(shouldAutoAct(policy({ riskTolerance: "conservative" }), "review_request")).toBe(
      "draft",
    );
    expect(
      shouldAutoAct(policy({ loops: { sendReviewRequests: false } }), "review_request"),
    ).toBe("escalate");
  });

  it("voice_review auto across all risk tiers when toggle on (headline differentiator)", () => {
    for (const riskTolerance of ["conservative", "balanced", "aggressive"] as const) {
      expect(shouldAutoAct(policy({ riskTolerance }), "voice_review")).toBe("auto");
    }
    expect(
      shouldAutoAct(policy({ loops: { voiceToReviewEnabled: false } }), "voice_review"),
    ).toBe("escalate");
  });

  it("dispute is always a draft (never auto-filed)", () => {
    expect(shouldAutoAct(policy({ loops: { draftDisputes: true } }), "dispute")).toBe("draft");
    expect(
      shouldAutoAct(policy({ riskTolerance: "aggressive", loops: { draftDisputes: true } }), "dispute"),
    ).toBe("draft");
    expect(shouldAutoAct(policy({ loops: { draftDisputes: false } }), "dispute")).toBe("escalate");
  });

  it("geo_post auto only when aggressive + toggle on", () => {
    expect(
      shouldAutoAct(policy({ riskTolerance: "aggressive", loops: { geoPosts: true } }), "geo_post"),
    ).toBe("auto");
    expect(shouldAutoAct(policy({ loops: { geoPosts: true } }), "geo_post")).toBe("draft");
    expect(shouldAutoAct(policy({ loops: { geoPosts: false } }), "geo_post")).toBe("escalate");
  });

  it("inbox_reply mirrors the confidence-gated auto path", () => {
    expect(
      shouldAutoAct(policy({ loops: { inboxAutoReply: true } }), "inbox_reply", {
        confidence: 0.9,
      }),
    ).toBe("auto");
    expect(
      shouldAutoAct(policy({ loops: { inboxAutoReply: true } }), "inbox_reply", {
        confidence: 0.4,
      }),
    ).toBe("draft");
    expect(shouldAutoAct(policy(), "inbox_reply", { confidence: 1 })).toBe("escalate"); // toggle off by default
  });
});
