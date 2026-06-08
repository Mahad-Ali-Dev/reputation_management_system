import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import {
  coercePriority,
  coerceType,
  MIN_RESPONSES_FOR_INSIGHTS,
  type SurveyInsight,
} from "./insights";


/**
 * Read-side helpers for survey AI Insights (Module 11).
 *
 * Split from `insights.ts` (the generator) so server components can read the
 * cache without importing the Anthropic client. Every NEW-table access fail-soft
 * on 42P01/42703 — `survey_insights` is not migrated in this build.
 */

/** Postgres 42P01 (undefined_table) / 42703 (undefined_column) → not migrated. */
function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "42P01" || code === "42703";
}

export type CachedInsights = {
  insights: SurveyInsight[];
  generatedAt: Date | null;
  basedOnResponseCount: number;
};

/** Read the org's cached insights (newest run). Fail-soft → empty. */
export async function getCachedInsights(orgId: string): Promise<CachedInsights> {
  try {
    return await withTenant(orgId, async (tx) => {
      const rows = await tx.surveyInsight.findMany({
        orderBy: { generatedAt: "desc" },
        take: 8,
      });
      return {
        insights: rows.map((r) => ({
          type: coerceType(r.type),
          priority: coercePriority(r.priority),
          headline: r.headline,
          description: r.description,
          recommendation: r.recommendation,
          evidenceCount: r.evidenceCount,
        })),
        generatedAt: rows[0]?.generatedAt ?? null,
        basedOnResponseCount: rows[0]?.basedOnResponseCount ?? 0,
      };
    });
  } catch (err) {
    if (!isMissingRelation(err)) {
      logger.warn({ orgId, error: String(err), event: "survey.insights.cache_read_failed" });
    }
    return { insights: [], generatedAt: null, basedOnResponseCount: 0 };
  }
}

/** Total survey responses for the org (drives the gate). Fail-soft → 0. */
export async function countResponsesForInsights(orgId: string): Promise<number> {
  try {
    return await withTenant(orgId, async (tx) => tx.surveyResponse.count());
  } catch (err) {
    if (!isMissingRelation(err)) {
      logger.warn({ orgId, error: String(err), event: "survey.insights.count_failed" });
    }
    return 0;
  }
}

/** Staleness thresholds for auto-refresh + the weekly cron. */
const STALE_NEW_RESPONSES = 20;
const STALE_AGE_DAYS = 7;

export type Staleness = {
  /** True when a refresh is warranted (and the org has enough responses). */
  stale: boolean;
  reason: "never_run" | "new_responses" | "aged" | "fresh" | "below_threshold";
  responseCount: number;
  basedOnResponseCount: number;
  generatedAt: Date | null;
};

/**
 * Is the org's cached insight set stale? Stale when never run (with ≥ threshold
 * responses), or >20 new responses since the last run, or >7 days old. Returns
 * `below_threshold` (not stale) when there aren't enough responses to analyze.
 */
export async function insightsStaleness(orgId: string): Promise<Staleness> {
  const [count, cached] = await Promise.all([
    countResponsesForInsights(orgId),
    getCachedInsights(orgId),
  ]);

  if (count < MIN_RESPONSES_FOR_INSIGHTS) {
    return {
      stale: false,
      reason: "below_threshold",
      responseCount: count,
      basedOnResponseCount: cached.basedOnResponseCount,
      generatedAt: cached.generatedAt,
    };
  }

  if (cached.generatedAt === null) {
    return {
      stale: true,
      reason: "never_run",
      responseCount: count,
      basedOnResponseCount: 0,
      generatedAt: null,
    };
  }

  const newResponses = count - cached.basedOnResponseCount;
  if (newResponses > STALE_NEW_RESPONSES) {
    return {
      stale: true,
      reason: "new_responses",
      responseCount: count,
      basedOnResponseCount: cached.basedOnResponseCount,
      generatedAt: cached.generatedAt,
    };
  }

  const ageMs = Date.now() - cached.generatedAt.getTime();
  if (ageMs > STALE_AGE_DAYS * 24 * 60 * 60 * 1000) {
    return {
      stale: true,
      reason: "aged",
      responseCount: count,
      basedOnResponseCount: cached.basedOnResponseCount,
      generatedAt: cached.generatedAt,
    };
  }

  return {
    stale: false,
    reason: "fresh",
    responseCount: count,
    basedOnResponseCount: cached.basedOnResponseCount,
    generatedAt: cached.generatedAt,
  };
}
