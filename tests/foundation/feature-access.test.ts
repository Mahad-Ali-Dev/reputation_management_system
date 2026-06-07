import { PLAN, planAllowsPaidFeatures } from "@/lib/billing/entitlements";
import {
  FEATURE_REQUIREMENT,
  type FeatureKey,
  featureRequiresPlan,
  planHasFeature,
} from "@/lib/billing/feature-access";
import { describe, expect, it } from "vitest";

/**
 * Feature-access tests. The single most important property of this module is
 * that it does NOT fork entitlement logic — it must produce *exactly* what
 * `planAllowsPaidFeatures` produces, for every plan/feature pair. A divergence
 * here is the 2026-06 entitlement-drift bug returning, so the core test is a
 * delegation check, not a hand-written truth table that could itself drift.
 */

const ALL_FEATURES = Object.keys(FEATURE_REQUIREMENT) as FeatureKey[];

const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const PAST = new Date(Date.now() - 1000);

// (plan, trialEndsAt) cases spanning every entitlement branch.
const PLAN_CASES: Array<{ name: string; plan: string; trialEndsAt: Date | null }> = [
  { name: "pro", plan: PLAN.PRO, trialEndsAt: null },
  { name: "trial (active)", plan: PLAN.TRIAL, trialEndsAt: FUTURE },
  { name: "trial (no end date)", plan: PLAN.TRIAL, trialEndsAt: null },
  { name: "trial (expired)", plan: PLAN.TRIAL, trialEndsAt: PAST },
  { name: "past_due", plan: PLAN.PAST_DUE, trialEndsAt: null },
  { name: "suspended", plan: PLAN.SUSPENDED, trialEndsAt: null },
  { name: "free", plan: PLAN.FREE, trialEndsAt: null },
  { name: "unknown plan string", plan: "legacy_garbage", trialEndsAt: null },
];

describe("planHasFeature — delegates to planAllowsPaidFeatures (no drift)", () => {
  for (const c of PLAN_CASES) {
    for (const feature of ALL_FEATURES) {
      it(`${c.name} × ${feature} matches planAllowsPaidFeatures`, () => {
        const expected = planAllowsPaidFeatures(c.plan, c.trialEndsAt);
        expect(planHasFeature(c.plan, c.trialEndsAt, feature)).toBe(expected);
      });
    }
  }
});

describe("planHasFeature — concrete expectations", () => {
  it("grants every feature on an active paid plan", () => {
    for (const feature of ALL_FEATURES) {
      expect(planHasFeature(PLAN.PRO, null, feature)).toBe(true);
    }
  });

  it("grants on an in-window trial and denies once expired", () => {
    expect(planHasFeature(PLAN.TRIAL, FUTURE, "ai_autopilot")).toBe(true);
    expect(planHasFeature(PLAN.TRIAL, PAST, "ai_autopilot")).toBe(false);
  });

  it("denies every feature on free / past_due / suspended", () => {
    for (const feature of ALL_FEATURES) {
      expect(planHasFeature(PLAN.FREE, null, feature)).toBe(false);
      expect(planHasFeature(PLAN.PAST_DUE, null, feature)).toBe(false);
      expect(planHasFeature(PLAN.SUSPENDED, null, feature)).toBe(false);
    }
  });

  it("trial expiry boundary: just-future allowed, just-past denied", () => {
    // 1s in the future is still inside the window; 1s in the past is not.
    const justFuture = new Date(Date.now() + 1000);
    const justPast = new Date(Date.now() - 1000);
    expect(planHasFeature(PLAN.TRIAL, justFuture, "rank_tracking")).toBe(true);
    expect(planHasFeature(PLAN.TRIAL, justPast, "rank_tracking")).toBe(false);
  });
});

describe("featureRequiresPlan / FEATURE_REQUIREMENT", () => {
  it("returns the mapped requirement tier for every feature", () => {
    for (const feature of ALL_FEATURES) {
      expect(featureRequiresPlan(feature)).toBe(FEATURE_REQUIREMENT[feature]);
    }
  });

  it("v1 keeps all features on the binary paid gate (scale treated as paid)", () => {
    // If a future tier introduces a real "scale" requirement, this test should
    // be updated alongside the scale-tier check in planHasFeature.
    for (const feature of ALL_FEATURES) {
      expect(["paid", "scale"]).toContain(FEATURE_REQUIREMENT[feature]);
    }
  });
});
