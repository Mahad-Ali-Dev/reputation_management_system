/**
 * Autopilot policy resolver (Module 15 — Differentiators).
 *
 * The agentic loops scattered across the thirteen modules (auto-reply, KB
 * refresh, review requests, dispute drafting, survey insights, social
 * best-time, inbox auto-reply, geo-posting) consult THIS file to decide whether
 * to auto-act, draft-for-approval, or escalate to a human — driven by a single
 * per-org `AutopilotConfig` and a `riskTolerance` enum.
 *
 * Two functions, two responsibilities:
 *   - `resolveAutopilotPolicy(orgId)` — loads the org's `AutopilotConfig` row
 *     (via `withTenant`) and maps it to a normalized, serializable `AutopilotPolicy`.
 *     Fail-SAFE: no row, or a pre-migration `autopilot_configs` table → Autopilot
 *     is treated as **off** (never auto-acts). The only side effect is a read.
 *   - `shouldAutoAct(policy, loop, signal)` — the single, PURE decision function.
 *     Given a resolved policy, a loop, and a lightweight signal, returns
 *     `"auto" | "draft" | "escalate"`. No I/O, no Date, no randomness — so the
 *     risk semantics live in exactly one unit-tested place.
 *
 * Hard invariants the matrix guarantees (covered by tests/autopilot/policy.test.ts):
 *   - Autopilot disabled  → NOTHING is ever "auto" (draft/escalate only).
 *   - Low-star reviews     → NEVER "auto" (draft or escalate, by risk).
 *   - 5★ auto-reply        → "auto" only when enabled && the loop toggle is on &&
 *                            riskTolerance !== "conservative".
 *   - A loop whose toggle is off → its draft/escalate posture, never "auto".
 */

import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";

export type RiskTolerance = "conservative" | "balanced" | "aggressive";

export type AutopilotDecision = "auto" | "draft" | "escalate";

/**
 * The loops Autopilot governs. Each maps 1:1 to an `AutopilotConfig` boolean
 * (except `escalateToHuman`, which is a behavior toggle consulted in the matrix).
 */
export type AutopilotLoop =
  | "auto_reply" // reply to a public review (5★ may auto; low-star never)
  | "review_request" // send a post-purchase/post-call review request
  | "voice_review" // the Voice→Review funnel
  | "dispute" // draft a dispute/flag argument
  | "geo_post" // geo-targeted social post
  | "inbox_reply"; // reply in the unified inbox / live chat

/** Per-loop on/off switches mirrored from `AutopilotConfig`. */
export type AutopilotLoops = {
  autoReply5Star: boolean;
  draftLowStar: boolean;
  sendReviewRequests: boolean;
  voiceToReviewEnabled: boolean;
  draftDisputes: boolean;
  geoPosts: boolean;
  inboxAutoReply: boolean;
  escalateToHuman: boolean;
};

/** Normalized, serializable policy returned by `resolveAutopilotPolicy`. */
export type AutopilotPolicy = {
  enabled: boolean;
  riskTolerance: RiskTolerance;
  loops: AutopilotLoops;
  /** Whether a weekly digest should be assembled + sent for this org. */
  weeklyDigestEnabled: boolean;
};

/**
 * A lightweight, caller-supplied description of the thing being acted on. Only
 * the fields the decision matrix needs — kept tiny so callers don't over-fetch
 * and so the function stays pure + trivially testable.
 */
export type AutopilotSignal = {
  /** Star rating for review-touching loops (1..5). Omit for non-review loops. */
  rating?: number | null;
  /** AiAssist self-rated confidence (0..1) when known — gates auto on quality. */
  confidence?: number | null;
  /** Safety verdict tripped a blocking flag → never auto, always escalate. */
  blocked?: boolean | null;
  /** Caller already knows this needs a human (e.g. complaint intent) → escalate. */
  forceEscalate?: boolean | null;
};

/** Defaults applied when there is no config row (fail-safe = Autopilot off). */
export const DEFAULT_LOOPS: AutopilotLoops = {
  autoReply5Star: true,
  draftLowStar: true,
  sendReviewRequests: true,
  voiceToReviewEnabled: true,
  draftDisputes: false,
  geoPosts: false,
  inboxAutoReply: false,
  escalateToHuman: true,
};

/**
 * Confidence floor required before an otherwise-eligible action may auto-act,
 * per risk tier. Conservative never auto-acts on AI-generated content; balanced
 * requires solid confidence; aggressive is permissive. Below the floor → draft.
 * Pure constant so re-tuning risk appetite is a one-line change.
 */
export const AUTO_CONFIDENCE_FLOOR: Record<RiskTolerance, number> = {
  conservative: 2, // unreachable (>1) — conservative never auto-acts on AI content
  balanced: 0.7,
  aggressive: 0.5,
};

/** Coerce an arbitrary string to a known `RiskTolerance` (defaults to balanced). */
export function normalizeRisk(value: string | null | undefined): RiskTolerance {
  return value === "conservative" || value === "aggressive" || value === "balanced"
    ? value
    : "balanced";
}

/**
 * The single decision function. PURE — no I/O. Returns the posture a loop should
 * take for one signal under the resolved policy.
 *
 * Decision order (first match wins):
 *   1. Autopilot disabled, or a hard signal (blocked / forceEscalate) → never auto.
 *   2. The loop's own toggle is off → never auto (draft or escalate).
 *   3. Loop-specific rules (low-star never auto; 5★ auto gated on risk+confidence).
 */
export function shouldAutoAct(
  policy: AutopilotPolicy,
  loop: AutopilotLoop,
  signal: AutopilotSignal = {},
): AutopilotDecision {
  const escalateFallback: AutopilotDecision = policy.loops.escalateToHuman
    ? "escalate"
    : "draft";

  // 1. Master switch + hard signals — never auto-act.
  if (!policy.enabled) return escalateFallback;
  if (signal.blocked) return "escalate";
  if (signal.forceEscalate) return "escalate";

  switch (loop) {
    case "auto_reply": {
      const rating = typeof signal.rating === "number" ? signal.rating : null;
      // Low-star (1–4★): NEVER auto. Draft when drafting is on, else escalate.
      if (rating !== null && rating < 5) {
        return policy.loops.draftLowStar ? "draft" : escalateFallback;
      }
      // 5★ (or unknown rating treated as non-5★ → draft): auto only when the
      // toggle is on, risk isn't conservative, and confidence clears the floor.
      if (rating === 5) {
        if (!policy.loops.autoReply5Star) return escalateFallback;
        if (policy.riskTolerance === "conservative") return "draft";
        if (clearsConfidenceFloor(policy.riskTolerance, signal.confidence)) return "auto";
        return "draft";
      }
      // Unknown rating — be cautious, draft.
      return policy.loops.autoReply5Star ? "draft" : escalateFallback;
    }

    case "review_request": {
      // Sending a review request is a safe, compliance-gated action (consent +
      // unsubscribe are enforced downstream). Auto when the toggle is on and
      // risk isn't conservative; otherwise the owner sends manually.
      if (!policy.loops.sendReviewRequests) return escalateFallback;
      return policy.riskTolerance === "conservative" ? "draft" : "auto";
    }

    case "voice_review": {
      if (!policy.loops.voiceToReviewEnabled) return escalateFallback;
      // Voice→Review is the same safe outreach action; conservative still sends
      // (it's the headline differentiator) — risk only changes review-REPLY auto.
      return "auto";
    }

    case "dispute": {
      // Disputes are always a DRAFT for human approval — never auto-filed.
      return policy.loops.draftDisputes ? "draft" : escalateFallback;
    }

    case "geo_post": {
      if (!policy.loops.geoPosts) return escalateFallback;
      return policy.riskTolerance === "aggressive" ? "auto" : "draft";
    }

    case "inbox_reply": {
      if (!policy.loops.inboxAutoReply) return escalateFallback;
      if (policy.riskTolerance === "conservative") return "draft";
      if (clearsConfidenceFloor(policy.riskTolerance, signal.confidence)) return "auto";
      return "draft";
    }

    default: {
      // Exhaustiveness guard — a new loop must be wired above.
      const _never: never = loop;
      void _never;
      return escalateFallback;
    }
  }
}

/**
 * True when the signal's confidence is known AND clears the risk tier's floor.
 * Unknown confidence is treated as "below the floor" (cautious → draft), so a
 * loop that can't produce a confidence never silently auto-acts.
 */
function clearsConfidenceFloor(
  risk: RiskTolerance,
  confidence: number | null | undefined,
): boolean {
  const floor = AUTO_CONFIDENCE_FLOOR[risk];
  if (typeof confidence !== "number" || Number.isNaN(confidence)) return false;
  return confidence >= floor;
}

/**
 * Map a raw `AutopilotConfig` row (or null) → normalized policy. Exported as a
 * PURE helper so `resolveAutopilotPolicy` (which does the DB read) and tests can
 * share the exact mapping without a DB.
 */
export function policyFromRow(
  row: {
    enabled?: boolean | null;
    riskTolerance?: string | null;
    autoReply5Star?: boolean | null;
    draftLowStar?: boolean | null;
    sendReviewRequests?: boolean | null;
    voiceToReviewEnabled?: boolean | null;
    draftDisputes?: boolean | null;
    geoPosts?: boolean | null;
    inboxAutoReply?: boolean | null;
    escalateToHuman?: boolean | null;
    weeklyDigestEnabled?: boolean | null;
  } | null,
): AutopilotPolicy {
  if (!row) {
    return {
      enabled: false,
      riskTolerance: "balanced",
      loops: { ...DEFAULT_LOOPS },
      weeklyDigestEnabled: true,
    };
  }
  return {
    enabled: row.enabled ?? false,
    riskTolerance: normalizeRisk(row.riskTolerance),
    loops: {
      autoReply5Star: row.autoReply5Star ?? DEFAULT_LOOPS.autoReply5Star,
      draftLowStar: row.draftLowStar ?? DEFAULT_LOOPS.draftLowStar,
      sendReviewRequests: row.sendReviewRequests ?? DEFAULT_LOOPS.sendReviewRequests,
      voiceToReviewEnabled: row.voiceToReviewEnabled ?? DEFAULT_LOOPS.voiceToReviewEnabled,
      draftDisputes: row.draftDisputes ?? DEFAULT_LOOPS.draftDisputes,
      geoPosts: row.geoPosts ?? DEFAULT_LOOPS.geoPosts,
      inboxAutoReply: row.inboxAutoReply ?? DEFAULT_LOOPS.inboxAutoReply,
      escalateToHuman: row.escalateToHuman ?? DEFAULT_LOOPS.escalateToHuman,
    },
    weeklyDigestEnabled: row.weeklyDigestEnabled ?? true,
  };
}

/** Postgres "relation/column does not exist" — table not migrated yet. */
function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  if (code === "P2021" || code === "P2022" || code === "42P01" || code === "42703") return true;
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("42P01") || msg.includes("42703");
}

/**
 * Load the org's `AutopilotConfig` and return a normalized policy. The ONLY
 * impure function here — a single tenant-scoped read. Fail-SAFE: if the row is
 * absent OR the `autopilot_configs` table isn't migrated yet (42P01/42703),
 * returns the default policy with `enabled:false` so no loop ever auto-acts on a
 * pre-migration deploy. Never throws into a calling loop.
 */
export async function resolveAutopilotPolicy(orgId: string): Promise<AutopilotPolicy> {
  try {
    const row = await withTenant(orgId, (tx) =>
      tx.autopilotConfig.findUnique({ where: { organizationId: orgId } }),
    );
    return policyFromRow(row);
  } catch (err) {
    if (isMissingRelation(err)) {
      logger.warn(
        { orgId, event: "autopilot.policy.table_not_ready" },
        "autopilot_configs not migrated — defaulting to Autopilot off",
      );
      return policyFromRow(null);
    }
    // Any other read failure also fails safe (off) but is surfaced for ops.
    logger.error(
      { orgId, event: "autopilot.policy.resolve_failed", error: err instanceof Error ? err.message : String(err) },
      "failed to resolve autopilot policy — defaulting to off",
    );
    return policyFromRow(null);
  }
}
