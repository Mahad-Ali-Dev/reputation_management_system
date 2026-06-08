/**
 * AiAssist — shared types (00_foundation §A4.3).
 *
 * THE PUBLIC INTERFACE every module codes against. This is the single
 * architectural object: every module's draft / suggest / insight / argument
 * feature calls `runAiAssist(...)` with one of the `AiAssistPurpose` strings
 * below so the agentic behavior (context assembly → budget → generate →
 * safety → confidence → knowledge-gap) is consistent and metered.
 *
 * ⚠️ DO NOT FORK THIS UNION. Per the master build order, Wave 0 owns the
 * purpose union; modules 05/06/08/09/10/11/13/15 *consume* an existing value.
 * The three "future" purposes (`dispute_argument`, `seo_recommendation`,
 * `ai_autopilot`) are already enumerated here so no downstream wave needs to
 * touch this file or add a per-purpose branch in the orchestrator.
 */

export type AiAssistPurpose =
  | "review_reply" // Step 6 — reply to a public review
  | "review_request" // Step 7 — outreach copy asking for a review
  | "dispute_argument" // Step 8 — argument to dispute/flag a review
  | "inbox_reply" // Step 9 — reply in the unified inbox / live chat
  | "social_caption" // Step 10 — social post caption
  | "survey_insight" // Step 11 — survey-response insight summary
  | "seo_recommendation" // Step 13 — SEO/competitor recommendation
  | "ai_autopilot" // Step 15 — reputation autopilot action draft
  | "kb_answer"; // Step 5 — KB Q&A / gap-fill answer

/**
 * Purposes that benefit from a model-emitted self-rated confidence (vs the
 * deterministic proxy). Kept here (not in confidence.ts) so callers and tests
 * can reason about which path a purpose takes. See §A4.4.
 */
export const SELF_RATED_PURPOSES: ReadonlySet<AiAssistPurpose> = new Set<AiAssistPurpose>([
  "inbox_reply",
  "kb_answer",
  "dispute_argument",
]);

/**
 * Caller-supplied, purpose-specific context the service treats as DATA and
 * fences inside `<untrusted_*>` tags (prompt-injection defense — same posture
 * as `generate-reply.ts`). The caller has already loaded these tenant-scoped.
 */
export type AiAssistDomain = {
  establishmentId?: string | null;
  /** Free-form rows the caller already loaded (tenant-scoped). Fenced as data. */
  rows?: Record<string, unknown>;
  /** The primary thing to write about (review body, thread text, survey text). */
  primaryText?: string;
};

export type AiAssistInput = {
  /** Verified by the caller (session orgId). The service trusts this. */
  orgId: string;
  purpose: AiAssistPurpose;
  /** The user's ask / the thing to respond to. */
  query: string;
  domain?: AiAssistDomain;
  /** How many options to generate. Default 3; clamped to 1..5. */
  optionCount?: number;
  /** Optional per-call tone nudge layered on top of the training profile. */
  toneHint?: string;
  /** On low confidence, fire the injected escalation hook (e.g. inbox handoff). */
  escalate?: boolean;
  /** Skip KB retrieval entirely (pure-generation callers like review_request). */
  skipKb?: boolean;
  /**
   * Texts to avoid regenerating (used by `regenerate`). The generator is asked
   * to produce materially different options from these.
   */
  avoidTexts?: string[];
};

export type AiAssistOption = {
  text: string;
  /** The logged `AiMessage` row id (forensics + cost). */
  aiMessageId: string;
  /** 0..1 — model self-rating when available, else the deterministic proxy. */
  confidence: number;
  /** Safety verdict had ≥1 blocking flag. Kept, but flagged for review. */
  blocked: boolean;
  /** Names of tripped safety flags (for the UI "Needs review" hint). */
  safetyFlags: string[];
};

export type AiAssistResult = {
  purpose: AiAssistPurpose;
  /** Best-first. */
  options: AiAssistOption[];
  /** KB provenance (also stored on each AiMessage.retrievedChunkIds). */
  usedChunkIds: string[];
  /** Summed cost across all options (micros). */
  costMicros: number;
  /** Set when a low-confidence gap was written; else null. */
  knowledgeGapId: string | null;
  escalated: boolean;
  promptVersionId: string | null;
};

/**
 * Thrown when the org's daily AI budget cap is already hit (from `checkBudget`).
 * Callers branch on `err.code === "ai_budget"` to show a soft "try again
 * tomorrow / upgrade" message rather than a generic error.
 */
export class AiBudgetError extends Error {
  readonly code = "ai_budget";
  constructor(
    public readonly spentMicros: number,
    public readonly capMicros: number,
  ) {
    super(
      `ai_budget: daily AI budget reached (${spentMicros}/${capMicros} micros). Try again tomorrow or raise the cap.`,
    );
    this.name = "AiBudgetError";
  }
}

/** Default confidence threshold below which a KnowledgeGap is written. */
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;

/** Resolve the configured threshold (env-overridable), clamped to (0,1]. */
export function confidenceThreshold(): number {
  const raw = Number(process.env.AI_ASSIST_CONFIDENCE_THRESHOLD);
  if (!Number.isFinite(raw) || raw <= 0 || raw > 1) return DEFAULT_CONFIDENCE_THRESHOLD;
  return raw;
}
