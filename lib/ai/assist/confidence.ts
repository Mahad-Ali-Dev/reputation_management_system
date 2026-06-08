import { type AiAssistPurpose, SELF_RATED_PURPOSES, confidenceThreshold } from "./types";

/**
 * Confidence scoring (00_foundation §A4.4) — deterministic, documented so it is
 * never re-decided per module.
 *
 * Final confidence = model self-rating when available, else a deterministic
 * proxy. The proxy exists because not every call uses a self-rating tool AND
 * the build must stay green without live API calls (tests pass a fixed
 * self-rating; the proxy is exercised when none is supplied).
 *
 *   proxy = clamp(
 *       (kbChunksUsed > 0 ? 0.4 : 0.15)
 *     + (rerankRationaleStrong ? 0.3 : 0.1)
 *     + (safetyClean ? 0.2 : 0)
 *     + lenHeuristic(0..0.1)
 *   )
 *
 * The threshold (default 0.7, env `AI_ASSIST_CONFIDENCE_THRESHOLD`) decides
 * whether a KnowledgeGap is written for the *best* option.
 */

export type ConfidenceSignals = {
  /** Number of KB chunks that fed the generation (0 when skipKb or no KB). */
  kbChunksUsed: number;
  /**
   * Whether the reranker returned a confident, on-topic rationale. We treat the
   * default vector-order fallback / "no rerank" sentinels as NOT strong.
   */
  rerankRationaleStrong: boolean;
  /** No blocking safety flags on this option. */
  safetyClean: boolean;
  /** Generated text length, for the small length heuristic. */
  textLength: number;
  /** Model-emitted self-rating in [0,1], when the generator produced one. */
  modelSelfRating?: number | null;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Length heuristic → 0..0.1. Too-short answers (< 40 chars) score 0; it ramps
 * to the full 0.1 by ~240 chars and stays there. Pure function of length so it
 * is reproducible in tests.
 */
function lengthHeuristic(textLength: number): number {
  if (textLength < 40) return 0;
  const ramp = (textLength - 40) / (240 - 40); // 0 at 40, 1 at 240
  return clamp01(ramp) * 0.1;
}

/** The deterministic proxy used when no model self-rating is available. */
export function proxyConfidence(signals: ConfidenceSignals): number {
  const kb = signals.kbChunksUsed > 0 ? 0.4 : 0.15;
  const rerank = signals.rerankRationaleStrong ? 0.3 : 0.1;
  const safety = signals.safetyClean ? 0.2 : 0;
  const len = lengthHeuristic(signals.textLength);
  return clamp01(kb + rerank + safety + len);
}

/**
 * Score one option's confidence in [0,1]. Uses the model self-rating when the
 * purpose benefits from it AND a rating was emitted; otherwise the proxy.
 */
export function scoreConfidence(
  purpose: AiAssistPurpose,
  signals: ConfidenceSignals,
): number {
  const rating = signals.modelSelfRating;
  if (
    SELF_RATED_PURPOSES.has(purpose) &&
    rating !== null &&
    rating !== undefined &&
    Number.isFinite(rating)
  ) {
    return clamp01(rating);
  }
  return proxyConfidence(signals);
}

/** True when `confidence` is below the (env-overridable) threshold. */
export function isLowConfidence(confidence: number): boolean {
  return confidence < confidenceThreshold();
}

export { confidenceThreshold };
