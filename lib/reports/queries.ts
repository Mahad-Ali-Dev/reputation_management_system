/**
 * Business Report data.
 *
 * Six independent sections, each read in ONE tenant-scoped pass and each
 * fail-soft on its own. That isolation is deliberate: the previous incarnation
 * of this route error-paged in production and the cause was never pinned down,
 * so no single unmigrated table, RLS grant gap or slow query is allowed to take
 * the whole report with it. A broken section renders as `available: false` and
 * says so in place; the other five still print.
 *
 * Aggregation happens in Postgres (groupBy/aggregate) rather than by pulling
 * rows and counting in JS — an established org has thousands of reviews and
 * scans, and a report must not be the thing that falls over at scale.
 */

import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { formatAddress } from "@/lib/outreach/merge-tags";
import { LIVE_ESTABLISHMENT } from "@/lib/reviews/scope";
import type { ReportRange } from "./range";

// ── shapes ───────────────────────────────────────────────────────

/** One bucket per day of the window, zero-filled. */
export type DailyPoint = { date: string; count: number };

export type Unavailable = { available: false };
type Available<T> = T & { available: true };

export type ReviewsSection = Available<{
  total: number;
  avgRating: number | null;
  byStar: Array<{ stars: number; count: number }>;
  bySource: Array<{ source: string; count: number }>;
  previousTotal: number;
  series: DailyPoint[];
  /** Whole-percent change vs the preceding window; null when there's no base. */
  changePct: number | null;
}>;

export type AutopilotSection = Available<{
  total: number;
  published: number;
  drafted: number;
  needsHuman: number;
  series: DailyPoint[];
  byLoop: Array<{ loop: string; count: number }>;
}>;

export type SocialSection = Available<{
  posted: number;
  scheduled: number;
  failed: number;
  series: DailyPoint[];
  byPlatform: Array<{ platform: string; count: number }>;
}>;

export type DisputesSection = Available<{
  total: number;
  removed: number;
  pending: number;
  byStatus: Array<{ status: string; count: number }>;
}>;

export type DevicesSection = Available<{
  totalScans: number;
  byDevice: Array<{ label: string; serial: string; location: string; scans: number }>;
  byLocation: Array<{ location: string; scans: number }>;
}>;

export type SurveyAnswerRow = { prompt: string; value: string };
export type SurveyResponseRow = {
  id: string;
  campaign: string;
  recipient: string | null;
  rating: number | null;
  submittedAt: string | null;
  answers: SurveyAnswerRow[];
};

export type SurveysSection = Available<{
  responses: number;
  completed: number;
  avgRating: number | null;
  byCampaign: Array<{ campaign: string; responses: number }>;
  detail: SurveyResponseRow[];
}>;

export type BusinessReport = {
  reviews: ReviewsSection | Unavailable;
  autopilot: AutopilotSection | Unavailable;
  social: SocialSection | Unavailable;
  disputes: DisputesSection | Unavailable;
  devices: DevicesSection | Unavailable;
  surveys: SurveysSection | Unavailable;
};

const UNAVAILABLE: Unavailable = { available: false };

/** Run one section, logging and degrading rather than propagating. */
async function section<T>(
  name: string,
  orgId: string,
  run: () => Promise<T>,
): Promise<T | Unavailable> {
  try {
    return await run();
  } catch (err) {
    logger.warn(
      {
        orgId,
        section: name,
        error: err instanceof Error ? err.message : String(err),
        event: "report.section.failed",
      },
      "business report section unavailable",
    );
    return UNAVAILABLE;
  }
}

function dayKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Bucket timestamps into one point per day across the WHOLE window.
 *
 * Zero-filling is the point: a trend line drawn only from days that happened to
 * have activity silently closes the gaps and reads as steady traffic when the
 * truth is "nothing for four days". Days are keyed in server-local time to match
 * the range boundaries, which are also local.
 */
function toSeries(dates: Date[], range: ReportRange): DailyPoint[] {
  const buckets = new Map<string, number>();
  const cursor = new Date(range.from);
  // The range is capped at 366 days upstream; the guard is belt-and-braces
  // against an unbounded loop if that ever changes.
  for (let i = 0; i < 400 && cursor <= range.to; i++) {
    buckets.set(dayKey(cursor), 0);
    cursor.setDate(cursor.getDate() + 1);
  }
  for (const d of dates) {
    const k = dayKey(d);
    const current = buckets.get(k);
    if (current !== undefined) buckets.set(k, current + 1);
  }
  return [...buckets.entries()].map(([date, count]) => ({ date, count }));
}

function pct(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Answer values are free-form JSON; render something a human can read. */
function answerToText(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(answerToText).filter(Boolean).join(", ");
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    // Common shapes from the survey renderer before falling back to raw JSON.
    for (const k of ["label", "text", "value", "answer"]) {
      if (typeof o[k] === "string") return o[k] as string;
    }
    return JSON.stringify(value);
  }
  return String(value);
}

// ── the report ───────────────────────────────────────────────────

export async function buildBusinessReport(
  orgId: string,
  range: ReportRange,
): Promise<BusinessReport> {
  const window = { gte: range.from, lte: range.to };

  const [reviews, autopilot, social, disputes, devices, surveys] = await Promise.all([
    section("reviews", orgId, () => reviewsSection(orgId, range, window)),
    section("autopilot", orgId, () => autopilotSection(orgId, range, window)),
    section("social", orgId, () => socialSection(orgId, range, window)),
    section("disputes", orgId, () => disputesSection(orgId, window)),
    section("devices", orgId, () => devicesSection(orgId, window)),
    section("surveys", orgId, () => surveysSection(orgId, window)),
  ]);

  return { reviews, autopilot, social, disputes, devices, surveys };
}

type Window = { gte: Date; lte: Date };

async function reviewsSection(
  orgId: string,
  range: ReportRange,
  window: Window,
): Promise<ReviewsSection> {
  return withTenant(orgId, async (tx) => {
    // LIVE_ESTABLISHMENT excludes soft-deleted locations — without it a removed
    // location's reviews keep counting and the totals read as doubled.
    const where = { postedAt: window, ...LIVE_ESTABLISHMENT };
    const [agg, byStarRaw, bySourceRaw, previousTotal, dates] = await Promise.all([
      tx.review.aggregate({ where, _avg: { rating: true }, _count: { _all: true } }),
      tx.review.groupBy({ by: ["rating"], where, _count: { _all: true } }),
      tx.review.groupBy({ by: ["source"], where, _count: { _all: true } }),
      tx.review.count({
        where: { postedAt: { gte: range.previousFrom, lt: range.from }, ...LIVE_ESTABLISHMENT },
      }),
      // Timestamps only — bucketed into the trend line below. Selecting the one
      // column keeps this cheap even on an org with thousands of reviews.
      tx.review.findMany({ where, select: { postedAt: true } }),
    ]);

    const starCounts = new Map<number, number>(byStarRaw.map((r) => [r.rating, r._count._all]));
    const total = agg._count._all;

    return {
      available: true,
      total,
      avgRating: agg._avg.rating ? Number(agg._avg.rating.toFixed(2)) : null,
      // Always emit all five rows so the chart keeps a stable shape at zero.
      byStar: [5, 4, 3, 2, 1].map((stars) => ({ stars, count: starCounts.get(stars) ?? 0 })),
      bySource: bySourceRaw
        .map((r) => ({ source: r.source, count: r._count._all }))
        .sort((a, b) => b.count - a.count),
      previousTotal,
      series: toSeries(
        dates.map((r) => r.postedAt),
        range,
      ),
      changePct: pct(total, previousTotal),
    };
  });
}

async function autopilotSection(
  orgId: string,
  range: ReportRange,
  window: Window,
): Promise<AutopilotSection> {
  return withTenant(orgId, async (tx) => {
    const where = { createdAt: window };
    const [byLoopAction, needsHuman, dates] = await Promise.all([
      tx.autopilotAction.groupBy({ by: ["loop", "action"], where, _count: { _all: true } }),
      tx.autopilotAction.count({ where: { ...where, requiresHuman: true } }),
      tx.autopilotAction.findMany({ where, select: { createdAt: true } }),
    ]);

    let total = 0;
    let published = 0;
    let drafted = 0;
    const loops = new Map<string, number>();
    for (const row of byLoopAction) {
      const n = row._count._all;
      total += n;
      if (row.action === "published") published += n;
      if (row.action === "drafted") drafted += n;
      loops.set(row.loop, (loops.get(row.loop) ?? 0) + n);
    }

    return {
      available: true,
      total,
      published,
      drafted,
      needsHuman,
      series: toSeries(
        dates.map((r) => r.createdAt),
        range,
      ),
      byLoop: [...loops.entries()]
        .map(([loop, count]) => ({ loop, count }))
        .sort((a, b) => b.count - a.count),
    };
  });
}

async function socialSection(
  orgId: string,
  range: ReportRange,
  window: Window,
): Promise<SocialSection> {
  return withTenant(orgId, async (tx) => {
    // `platforms` is a String[] — one post can target several, so per-platform
    // counts have to be tallied from the rows rather than grouped in SQL.
    const [postedRows, scheduled, failed] = await Promise.all([
      tx.socialPost.findMany({
        where: { status: "posted", postedAt: window },
        select: { platforms: true, postedAt: true },
      }),
      tx.socialPost.count({ where: { status: "scheduled", scheduledFor: window } }),
      tx.socialPost.count({ where: { status: "failed", updatedAt: window } }),
    ]);

    const counts = new Map<string, number>();
    for (const p of postedRows) {
      for (const platform of p.platforms) {
        counts.set(platform, (counts.get(platform) ?? 0) + 1);
      }
    }

    return {
      available: true,
      posted: postedRows.length,
      scheduled,
      failed,
      series: toSeries(
        postedRows.map((p) => p.postedAt).filter((d): d is Date => d !== null),
        range,
      ),
      byPlatform: [...counts.entries()]
        .map(([platform, count]) => ({ platform, count }))
        .sort((a, b) => b.count - a.count),
    };
  });
}

async function disputesSection(orgId: string, window: Window): Promise<DisputesSection> {
  return withTenant(orgId, async (tx) => {
    const byStatusRaw = await tx.reviewDispute.groupBy({
      by: ["status"],
      where: { createdAt: window },
      _count: { _all: true },
    });

    const byStatus = byStatusRaw
      .map((r) => ({ status: r.status, count: r._count._all }))
      .sort((a, b) => b.count - a.count);
    const total = byStatus.reduce((sum, r) => sum + r.count, 0);
    const removed = byStatus
      .filter((r) => r.status === "removed" || r.status === "accepted")
      .reduce((sum, r) => sum + r.count, 0);
    const pending = byStatus
      .filter((r) => r.status === "submitted" || r.status === "submitted_to_google")
      .reduce((sum, r) => sum + r.count, 0);

    return { available: true, total, byStatus, removed, pending };
  });
}

async function devicesSection(orgId: string, window: Window): Promise<DevicesSection> {
  return withTenant(orgId, async (tx) => {
    // Scoped through the device relation: DeviceScan.organizationId is nullable,
    // so filtering on it directly would drop scans recorded without one.
    const grouped = await tx.deviceScan.groupBy({
      by: ["deviceId"],
      where: { scannedAt: window, device: { organizationId: orgId } },
      _count: { _all: true },
    });
    if (grouped.length === 0) {
      return { available: true, totalScans: 0, byDevice: [], byLocation: [] };
    }

    const devices = await tx.device.findMany({
      where: { id: { in: grouped.map((g) => g.deviceId) } },
      select: {
        id: true,
        serial: true,
        shortSlug: true,
        productKind: true,
        establishment: { select: { name: true, deletedAt: true } },
      },
    });
    const byId = new Map(devices.map((d) => [d.id, d]));

    const byDevice = grouped
      .map((g) => {
        const d = byId.get(g.deviceId);
        const location =
          d?.establishment && !d.establishment.deletedAt ? d.establishment.name : "Unassigned";
        return {
          label: d ? `${d.productKind.toUpperCase()} · ${d.shortSlug}` : "Unknown device",
          serial: d?.serial ?? "—",
          location,
          scans: g._count._all,
        };
      })
      .sort((a, b) => b.scans - a.scans);

    const locations = new Map<string, number>();
    for (const d of byDevice) locations.set(d.location, (locations.get(d.location) ?? 0) + d.scans);

    return {
      available: true,
      totalScans: byDevice.reduce((sum, d) => sum + d.scans, 0),
      byDevice,
      byLocation: [...locations.entries()]
        .map(([location, scans]) => ({ location, scans }))
        .sort((a, b) => b.scans - a.scans),
    };
  });
}

/** Detail rows shown in the report + PDF. Bounded so one busy org can't produce
 *  a hundred-page export. */
const SURVEY_DETAIL_LIMIT = 50;

async function surveysSection(orgId: string, window: Window): Promise<SurveysSection> {
  return withTenant(orgId, async (tx) => {
    const rows = await tx.surveyResponse.findMany({
      where: { createdAt: window },
      select: {
        id: true,
        recipient: true,
        ratingSummary: true,
        completedAt: true,
        createdAt: true,
        campaign: { select: { name: true } },
        answers: {
          select: { value: true, question: { select: { prompt: true, position: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
      take: SURVEY_DETAIL_LIMIT,
    });

    // Totals come from counts, not from the capped detail list, so the headline
    // numbers stay correct once an org exceeds the limit.
    const [responses, completed, agg, byCampaignRaw] = await Promise.all([
      tx.surveyResponse.count({ where: { createdAt: window } }),
      tx.surveyResponse.count({ where: { createdAt: window, completedAt: { not: null } } }),
      tx.surveyResponse.aggregate({ where: { createdAt: window }, _avg: { ratingSummary: true } }),
      tx.surveyResponse.groupBy({
        by: ["campaignId"],
        where: { createdAt: window },
        _count: { _all: true },
      }),
    ]);

    const campaigns = byCampaignRaw.length
      ? await tx.surveyCampaign.findMany({
          where: { id: { in: byCampaignRaw.map((c) => c.campaignId) } },
          select: { id: true, name: true },
        })
      : [];
    const campaignName = new Map(campaigns.map((c) => [c.id, c.name]));

    return {
      available: true,
      responses,
      completed,
      avgRating: agg._avg.ratingSummary ? Number(Number(agg._avg.ratingSummary).toFixed(2)) : null,
      byCampaign: byCampaignRaw
        .map((c) => ({
          campaign: campaignName.get(c.campaignId) ?? "Untitled survey",
          responses: c._count._all,
        }))
        .sort((a, b) => b.responses - a.responses),
      detail: rows.map((r) => ({
        id: r.id,
        campaign: r.campaign?.name ?? "Untitled survey",
        recipient: r.recipient,
        rating: r.ratingSummary === null ? null : Number(r.ratingSummary),
        submittedAt: (r.completedAt ?? r.createdAt).toISOString(),
        answers: r.answers
          .slice()
          .sort((a, b) => (a.question?.position ?? 0) - (b.question?.position ?? 0))
          .map((a) => ({ prompt: a.question?.prompt ?? "Question", value: answerToText(a.value) })),
      })),
    };
  });
}

// ── report branding ──────────────────────────────────────────────

export type ReportBrand = {
  orgName: string;
  ownerName: string | null;
  logoUrl: string | null;
  address: string | null;
  locationCount: number;
};

/**
 * Header/cover details for the report and its PDF: the owner's own logo, name
 * and address, so an exported report looks like the business's document rather
 * than ours. All optional — a brand-new org with nothing filled in still gets a
 * clean header from its name alone.
 */
export async function getReportBrand(orgId: string): Promise<ReportBrand> {
  try {
    return await withTenant(orgId, async (tx) => {
      const [org, estab, locationCount] = await Promise.all([
        tx.organization.findFirst({
          select: { name: true, ownerName: true, logoUrl: true },
        }),
        tx.establishment.findFirst({
          where: { deletedAt: null },
          select: { address: true, imageUrl: true },
          orderBy: { createdAt: "asc" },
        }),
        tx.establishment.count({ where: { deletedAt: null } }),
      ]);
      const addr = formatAddress(estab?.address);
      return {
        orgName: org?.name ?? "Your business",
        ownerName: org?.ownerName ?? null,
        logoUrl: org?.logoUrl ?? estab?.imageUrl ?? null,
        address: addr?.trim() ? addr : null,
        locationCount,
      };
    });
  } catch (err) {
    logger.warn(
      {
        orgId,
        error: err instanceof Error ? err.message : String(err),
        event: "report.brand.failed",
      },
      "report brand unavailable",
    );
    return {
      orgName: "Your business",
      ownerName: null,
      logoUrl: null,
      address: null,
      locationCount: 0,
    };
  }
}
