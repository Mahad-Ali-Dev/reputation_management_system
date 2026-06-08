/**
 * ROI funnel builder (Module 15 — Differentiators).
 *
 * Joins the data repulabs uniquely owns into the spec's attribution funnel:
 *   QR scans → reviews → GBP views → calls → bookings → $
 *
 * The genuinely-differentiated link is reviews → calls → bookings: only repulabs
 * owns the phone (`PhoneCall`) + booking (`PhoneBooking`) data competitors lack.
 *
 * Reads only (tenant-scoped via `withTenant`). Tolerant of:
 *   - empty / unmigrated tables (42P01/42703 → zeros, never a 500),
 *   - a missing GBP-Insights adapter (`13_reports` owns it; we soft-import it and
 *     treat `{ available:false }` / any error as "no gbpViews stage").
 *
 * Attribution split (from `Review`):
 *   - QR        → `attributedDeviceId` is set
 *   - outreach  → `attributedRequestId` is set (and the request was NOT voice)
 *   - voice     → `attributedRequestId` → `ReviewRequest.triggerSource = "voice_call"`
 *   - organic   → neither attribution column set
 */

import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";

export type RoiRange = { start: Date; end: Date };

export type RoiFunnel = {
  /** Inclusive window the funnel covers. */
  range: { start: string; end: string };
  /** Optional establishment filter (null = whole org). */
  establishmentId: string | null;
  /** QR scans recorded in range (DeviceScan). */
  scans: number;
  /** Reviews in range, split by attribution origin. */
  reviews: {
    total: number;
    fromQr: number;
    fromOutreach: number;
    fromVoice: number;
    organic: number;
  };
  /**
   * GBP profile views in range. `null` when the GBP-Insights adapter is absent
   * or reports `{ available:false }` — an OPTIONAL stage, never a hard dep.
   */
  gbpViews: number | null;
  /** Inbound phone calls in range (PhoneCall). */
  calls: number;
  /** Bookings in range (PhoneBooking), with a confirmed subset. */
  bookings: { total: number; confirmed: number };
};

/** Postgres "relation/column does not exist" → table not migrated. */
function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  if (code === "P2021" || code === "P2022" || code === "42P01" || code === "42703") return true;
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("42P01") || msg.includes("42703");
}

const EMPTY_REVIEWS = { total: 0, fromQr: 0, fromOutreach: 0, fromVoice: 0, organic: 0 } as const;

/**
 * Build the ROI funnel for an org (optionally one establishment) over a range.
 * Always returns a fully-formed funnel; on any missing-table error the affected
 * stage degrades to zero rather than throwing.
 */
export async function buildRoiFunnel(
  orgId: string,
  opts: { establishmentId?: string | null; range: RoiRange },
): Promise<RoiFunnel> {
  const establishmentId = opts.establishmentId ?? null;
  const { start, end } = opts.range;

  const base: RoiFunnel = {
    range: { start: start.toISOString(), end: end.toISOString() },
    establishmentId,
    scans: 0,
    reviews: { ...EMPTY_REVIEWS },
    gbpViews: null,
    calls: 0,
    bookings: { total: 0, confirmed: 0 },
  };

  // ---- Reviews + attribution split, scans, calls, bookings (one tx) ----
  try {
    const result = await withTenant(orgId, async (tx) => {
      const reviewWhere = {
        postedAt: { gte: start, lt: end },
        ...(establishmentId ? { establishmentId } : {}),
      };

      // When filtering by establishment, DeviceScan has no establishment column,
      // so resolve the establishment's device ids first (small list).
      const deviceIds = establishmentId
        ? (
            await tx.device.findMany({
              where: { establishmentId },
              select: { id: true },
              take: 5000,
            })
          ).map((d) => d.id)
        : null;
      const scanWhere =
        deviceIds === null
          ? { scannedAt: { gte: start, lt: end } }
          : { deviceId: { in: deviceIds }, scannedAt: { gte: start, lt: end } };
      // An establishment with no devices has no scans — skip the query.
      const scanQuery =
        deviceIds !== null && deviceIds.length === 0
          ? Promise.resolve(0)
          : tx.deviceScan.count({ where: scanWhere });

      const [total, qr, outreach, voiceRequests, scans, calls, bookingRows] = await Promise.all([
        tx.review.count({ where: reviewWhere }),
        tx.review.count({ where: { ...reviewWhere, attributedDeviceId: { not: null } } }),
        tx.review.count({ where: { ...reviewWhere, attributedRequestId: { not: null } } }),
        // Voice-origin reviews: reviews whose attributedRequestId points to a
        // ReviewRequest with triggerSource "voice_call". We resolve the set of
        // voice request ids first (small), then count reviews against it.
        tx.reviewRequest.findMany({
          where: {
            triggerSource: "voice_call",
            ...(establishmentId ? { establishmentId } : {}),
          },
          select: { id: true },
          take: 5000,
        }),
        scanQuery,
        tx.phoneCall.count({
          where: { startedAt: { gte: start, lt: end } },
        }),
        tx.phoneBooking.findMany({
          where: { startAt: { gte: start, lt: end } },
          select: { status: true },
          take: 5000,
        }),
      ]);

      const voiceIds = voiceRequests.map((r) => r.id);
      const fromVoice =
        voiceIds.length === 0
          ? 0
          : await tx.review.count({
              where: { ...reviewWhere, attributedRequestId: { in: voiceIds } },
            });

      // Outreach (non-voice) = all request-attributed minus the voice subset.
      const fromOutreach = Math.max(0, outreach - fromVoice);
      const organic = Math.max(0, total - qr - outreach);
      const confirmed = bookingRows.filter((b) =>
        ["confirmed", "completed", "booked"].includes(b.status),
      ).length;

      return {
        scans,
        calls,
        reviews: { total, fromQr: qr, fromOutreach, fromVoice, organic },
        bookings: { total: bookingRows.length, confirmed },
      };
    });

    base.scans = result.scans;
    base.calls = result.calls;
    base.reviews = result.reviews;
    base.bookings = result.bookings;
  } catch (err) {
    if (!isMissingRelation(err)) {
      logger.error(
        { orgId, event: "roi.funnel.query_failed", error: err instanceof Error ? err.message : String(err) },
        "ROI funnel query failed — degrading to zeros",
      );
    } else {
      logger.warn({ orgId, event: "roi.funnel.table_not_ready" }, "ROI funnel: a table is not migrated — zeros");
    }
    // base already holds zeros — fall through.
  }

  // ---- Optional GBP views (13_reports adapter; soft dependency) ----
  base.gbpViews = await maybeGbpViews(orgId, establishmentId);

  return base;
}

/**
 * Soft-call the `13_reports` GBP-Insights adapter. We DYNAMICALLY import it so
 * this module compiles and runs whether or not that module has landed, and so a
 * missing/erroring adapter degrades to `null` (no gbpViews stage) — never a hard
 * dependency. Returns total profile views in range, or null.
 */
async function maybeGbpViews(orgId: string, establishmentId: string | null): Promise<number | null> {
  try {
    // Indirected through a variable so bundlers/tsc don't hard-resolve a module
    // that may not exist yet in this wave.
    const modPath = "@/lib/seo/adapters/gbp-insights";
    const mod = (await import(/* @vite-ignore */ modPath as string).catch(() => null)) as
      | {
          fetchGbpInsights?: (args: {
            orgId: string;
            establishmentId?: string | null;
          }) => Promise<{ available: boolean; views?: number; profileViews?: number }>;
        }
      | null;
    if (!mod?.fetchGbpInsights) return null;
    const res = await mod.fetchGbpInsights({ orgId, establishmentId });
    if (!res || res.available === false) return null;
    const views = res.views ?? res.profileViews ?? null;
    return typeof views === "number" && Number.isFinite(views) ? views : null;
  } catch {
    return null;
  }
}
