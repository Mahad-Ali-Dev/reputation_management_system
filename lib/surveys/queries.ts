import { withTenant } from "@/lib/db/with-tenant";

/**
 * Pure NPS computation — `% promoters − % detractors`, rounded to an integer.
 *
 * Buckets (industry standard): promoters 9–10, passives 7–8, detractors 0–6.
 * Scores outside 0–10 are ignored. Empty input → `null` (no score). Extracted
 * so it is unit-testable without a DB and reused by every aggregate below.
 */
export function computeNps(scores: number[]): number | null {
  const valid = scores.filter((s) => Number.isFinite(s) && s >= 0 && s <= 10);
  if (valid.length === 0) return null;
  const promoters = valid.filter((s) => s >= 9).length;
  const detractors = valid.filter((s) => s <= 6).length;
  return Math.round(((promoters - detractors) / valid.length) * 100);
}

/** Bucket a 0–10 NPS score. */
export function npsBucket(score: number): "promoter" | "passive" | "detractor" {
  if (score >= 9) return "promoter";
  if (score >= 7) return "passive";
  return "detractor";
}

export async function listCampaigns(orgId: string) {
  return withTenant(orgId, async (tx) => {
    return tx.surveyCampaign.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { responses: true, tokens: true } },
      },
    });
  });
}

export async function getCampaign(orgId: string, id: string) {
  return withTenant(orgId, async (tx) => {
    return tx.surveyCampaign.findFirst({
      where: { id },
      include: {
        questions: { orderBy: { position: "asc" } },
        responses: {
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            answers: { include: { question: { select: { type: true, prompt: true } } } },
          },
        },
        _count: { select: { responses: true, tokens: true } },
      },
    });
  });
}

export async function campaignStats(orgId: string, campaignId: string) {
  return withTenant(orgId, async (tx) => {
    const responses = await tx.surveyResponse.findMany({
      where: { campaignId },
      select: { ratingSummary: true, smartRouteTo: true },
    });
    const ratings = responses
      .map((r) => (r.ratingSummary ? Number(r.ratingSummary) : null))
      .filter((n): n is number => n !== null);
    const npsScores = ratings.map((r) => (r / 5) * 10); // back to 0-10 scale
    const promoters = npsScores.filter((s) => s >= 9).length;
    const detractors = npsScores.filter((s) => s <= 6).length;
    const passives = npsScores.length - promoters - detractors;
    return {
      total: responses.length,
      promoters,
      passives,
      detractors,
      nps: computeNps(npsScores),
      smartRouted: responses.filter((r) => r.smartRouteTo === "review_request").length,
      alerted: responses.filter((r) => r.smartRouteTo === "internal_alert").length,
    };
  });
}

// ── Org-wide aggregates (Module 11 ENHANCE) ──────────────────────────────────

export type SurveysOverview = {
  totalSent: number;
  completed: number;
  completionRate: number; // 0–100
  avgNps: number | null; // 0–100 NPS index across all responses
  scheduled: number;
};

/**
 * Org-wide survey KPIs across all campaigns (the Surveys-tab stat cards).
 * `totalSent` = tokens issued; `completed` = responses; `avgNps` reuses
 * `computeNps`; `scheduled` = unconsumed, unexpired tokens.
 */
export async function surveysOverview(orgId: string): Promise<SurveysOverview> {
  return withTenant(orgId, async (tx) => {
    const now = new Date();
    const [totalSent, completed, responses, scheduled] = await Promise.all([
      tx.surveyResponseToken.count(),
      tx.surveyResponse.count(),
      tx.surveyResponse.findMany({ select: { ratingSummary: true } }),
      tx.surveyResponseToken.count({ where: { consumedAt: null, expiresAt: { gt: now } } }),
    ]);
    const npsScores = responses
      .map((r) => (r.ratingSummary ? (Number(r.ratingSummary) / 5) * 10 : null))
      .filter((n): n is number => n !== null);
    const completionRate = totalSent === 0 ? 0 : Math.round((completed / totalSent) * 100);
    return {
      totalSent,
      completed,
      completionRate,
      avgNps: computeNps(npsScores),
      scheduled,
    };
  });
}

export type NpsDistribution = { promoters: number; passives: number; detractors: number };

/** Promoter/passive/detractor counts (org-wide or one campaign). */
export async function npsDistribution(orgId: string, campaignId?: string): Promise<NpsDistribution> {
  return withTenant(orgId, async (tx) => {
    const rows = await tx.surveyResponse.findMany({
      where: campaignId ? { campaignId } : {},
      select: { ratingSummary: true },
    });
    let promoters = 0;
    let passives = 0;
    let detractors = 0;
    for (const r of rows) {
      if (r.ratingSummary == null) continue;
      const score = (Number(r.ratingSummary) / 5) * 10;
      const b = npsBucket(score);
      if (b === "promoter") promoters++;
      else if (b === "passive") passives++;
      else detractors++;
    }
    return { promoters, passives, detractors };
  });
}

export type ResponseRatePoint = { date: string; sent: number; completed: number };

/**
 * Sent vs completed per day over the last `days` (response-rate-over-time line).
 * Buckets tokens by `createdAt` (sent) and responses by `createdAt` (completed).
 */
export async function responseRateOverTime(
  orgId: string,
  days = 30,
  campaignId?: string,
): Promise<ResponseRatePoint[]> {
  return withTenant(orgId, async (tx) => {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - (days - 1));

    const [tokens, responses] = await Promise.all([
      tx.surveyResponseToken.findMany({
        where: { createdAt: { gte: since }, ...(campaignId ? { campaignId } : {}) },
        select: { createdAt: true },
      }),
      tx.surveyResponse.findMany({
        where: { createdAt: { gte: since }, ...(campaignId ? { campaignId } : {}) },
        select: { createdAt: true },
      }),
    ]);

    const dayKey = (d: Date) => d.toISOString().slice(0, 10);
    const buckets = new Map<string, ResponseRatePoint>();
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setUTCDate(since.getUTCDate() + i);
      const key = dayKey(d);
      buckets.set(key, { date: key, sent: 0, completed: 0 });
    }
    for (const t of tokens) {
      const b = buckets.get(dayKey(t.createdAt));
      if (b) b.sent++;
    }
    for (const r of responses) {
      const b = buckets.get(dayKey(r.createdAt));
      if (b) b.completed++;
    }
    return [...buckets.values()];
  });
}

export type DetailedResponse = {
  id: string;
  recipient: string | null;
  npsScore: number | null;
  rating: number | null;
  comment: string | null;
  smartRouteTo: string | null;
  createdAt: Date;
  campaignName: string;
};

/** Individual responses for the Responses table (org-wide or one campaign). */
export async function listResponsesDetailed(
  orgId: string,
  campaignId?: string,
  limit = 200,
): Promise<DetailedResponse[]> {
  return withTenant(orgId, async (tx) => {
    const rows = await tx.surveyResponse.findMany({
      where: campaignId ? { campaignId } : {},
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        recipient: true,
        ratingSummary: true,
        smartRouteTo: true,
        createdAt: true,
        campaign: { select: { name: true } },
        answers: { select: { value: true, question: { select: { type: true } } } },
      },
    });
    return rows.map((r): DetailedResponse => {
      const npsAns = r.answers.find((a) => a.question.type === "nps");
      const npsScore = (npsAns?.value as { number?: number } | null)?.number ?? null;
      const ratingAns = r.answers.find((a) => a.question.type === "rating");
      const rating = (ratingAns?.value as { number?: number } | null)?.number ?? null;
      const textAns = r.answers.find((a) => a.question.type === "text");
      const comment = (textAns?.value as { text?: string } | null)?.text ?? null;
      return {
        id: r.id,
        recipient: r.recipient,
        npsScore,
        rating,
        comment,
        smartRouteTo: r.smartRouteTo,
        createdAt: r.createdAt,
        campaignName: r.campaign?.name ?? "",
      };
    });
  });
}
