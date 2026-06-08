import { runAiAssist, AiBudgetError } from "@/lib/ai/assist";
import { PlanInactiveError } from "@/lib/billing/entitlements";
import { logger } from "@/lib/logger";
import { buildOverviewMetrics, type OverviewMetrics } from "./overview";

/**
 * AI Executive Summary (Module 13).
 *
 * `generateExecSummary(orgId, rangeDays)` gathers the Overview deltas and asks
 * the shared `runAiAssist({ purpose: "seo_recommendation" })` for a 2–3 sentence
 * plain-English summary of how the business's reputation + visibility moved over
 * the window. Entitlement, budget, safety, and AiMessage cost-logging are all
 * handled INSIDE the service — this module does not re-implement them and does
 * not fork the purpose union.
 *
 * ENV-GATED + NO-OP-SAFE: with `ANTHROPIC_API_KEY` unset, the org not entitled,
 * the budget hit, or any generation error, it returns a DETERMINISTIC non-AI
 * fallback string (never throws, never a paid call). The caller can cache the
 * result on `SeoSnapshot.execSummary` so re-renders are free.
 */

export type ExecSummary = {
  summary: string;
  generatedAt: Date;
  /** True when produced by the model; false when the deterministic fallback. */
  ai: boolean;
};

function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Deterministic, non-AI summary built purely from the metrics — the always-safe
 * fallback. Plain sentences, no model call.
 */
export function fallbackSummary(m: OverviewMetrics): string {
  const rep = m.reputation;
  const parts: string[] = [];

  if (rep.reviewCount === 0) {
    parts.push(
      `No new reviews in the last ${m.rangeDays} days — connect Google and start requesting reviews to build momentum.`,
    );
  } else {
    parts.push(
      `${rep.reviewCount} new review${rep.reviewCount === 1 ? "" : "s"} in the last ${m.rangeDays} days at a ${rep.avgRating.toFixed(2)}★ average.`,
    );
    parts.push(
      rep.responseRate >= 80
        ? `You're replying to ${rep.responseRate}% of reviews — keep it up.`
        : `Only ${rep.responseRate}% of reviews have a reply; responding to more lifts your score.`,
    );
  }

  if (m.seo.localPackPosition != null) {
    parts.push(`Local pack position: #${m.seo.localPackPosition}.`);
  } else if (!m.connected.rankTracking) {
    parts.push("Connect rank tracking to see your local-pack position and keyword movement.");
  }

  parts.push(`Reputation score: ${m.seo.reputationScore}/100.`);
  return parts.join(" ");
}

/** Compact, fenced data block describing the window for the model. */
function renderMetricsForPrompt(m: OverviewMetrics): string {
  const rep = m.reputation;
  return [
    `range_days=${m.rangeDays}`,
    `reviews=${rep.reviewCount}`,
    `avg_rating=${rep.avgRating.toFixed(2)}`,
    `response_rate_pct=${rep.responseRate}`,
    `review_velocity=${rep.recentReviewVelocity}`,
    `days_since_last_review=${rep.daysSinceLastReview ?? "n/a"}`,
    `nps=${rep.npsScore ?? "n/a"}`,
    `qr_scans=${rep.scanCount}`,
    `reputation_score=${m.seo.reputationScore}`,
    `local_pack_position=${m.seo.localPackPosition ?? "n/a"}`,
    `website_sessions=${m.seo.websiteSessions ?? "n/a"}`,
    `connected_gbp=${m.connected.gbp}`,
    `connected_ga4=${m.connected.ga4}`,
    `connected_rank_tracking=${m.connected.rankTracking}`,
  ].join("; ");
}

/**
 * Generate (or fall back to) the executive summary for a date range. Optionally
 * accepts pre-built metrics to avoid a second aggregate pass when the caller
 * already has them.
 */
export async function generateExecSummary(
  orgId: string,
  rangeDays: number,
  prebuilt?: OverviewMetrics,
): Promise<ExecSummary> {
  const metrics = prebuilt ?? (await buildOverviewMetrics(orgId, rangeDays));
  const generatedAt = new Date();

  // Env gate: no key ⇒ deterministic fallback, NEVER call the service.
  if (!isAiConfigured()) {
    return { summary: fallbackSummary(metrics), generatedAt, ai: false };
  }

  try {
    const result = await runAiAssist({
      orgId,
      purpose: "seo_recommendation",
      query:
        "Write a 2-3 sentence executive summary of this local business's reputation and visibility over the period. Be specific about the numbers and name the single highest-impact next action. Plain text, no markdown.",
      domain: {
        rows: { metrics: renderMetricsForPrompt(metrics) },
      },
      optionCount: 1,
      skipKb: true, // this is a data-summary, not a KB-grounded answer
    });

    const best = result.options[0];
    const text = best?.text?.trim();
    if (!text) {
      return { summary: fallbackSummary(metrics), generatedAt, ai: false };
    }
    return { summary: text, generatedAt, ai: true };
  } catch (err) {
    // Entitlement/budget/transport errors all degrade to the fallback — no throw.
    if (err instanceof PlanInactiveError || err instanceof AiBudgetError) {
      logger.info({
        orgId,
        event: "seo.exec_summary.fallback",
        reason: err instanceof AiBudgetError ? "budget" : "plan_inactive",
      });
    } else {
      logger.warn({
        orgId,
        event: "seo.exec_summary.failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return { summary: fallbackSummary(metrics), generatedAt, ai: false };
  }
}
