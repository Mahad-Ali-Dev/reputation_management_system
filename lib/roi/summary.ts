/**
 * ROI summary composers (Module 15 — Differentiators).
 *
 * Thin read-layer on top of `buildRoiFunnel` + `estimateRevenue`:
 *   - `getRoiHeadline(orgId, range)` — the one-liner for the weekly digest + the
 *     dashboard card ("$X estimated booked revenue, top driver: …").
 *   - `getDeviceRoi(orgId, deviceId)` — the per-plaque ROI line for the hardware
 *     page ("this $29 plaque generated 41 reviews and an estimated $X").
 *
 * All reads are tenant-scoped and tolerant of empty / unmigrated tables (zeros).
 */

import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { buildRoiFunnel, type RoiRange } from "./attribution";
import { estimateRevenue, type RoiSettingsInput, ROI_ASSUMPTIONS } from "./estimate";

/** Postgres "relation/column does not exist" → table not migrated. */
function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  if (code === "P2021" || code === "P2022" || code === "42P01" || code === "42703") return true;
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("42P01") || msg.includes("42703");
}

/** Default settings used when no `RoiSettings` row exists for the establishment. */
function defaultSettings(): RoiSettingsInput {
  return {
    averageJobValue: null, // → ROI_ASSUMPTIONS.DEFAULT_AVERAGE_JOB_VALUE
    bookingToJobRate: ROI_ASSUMPTIONS.DEFAULT_BOOKING_TO_JOB_RATE,
    reviewToCallRate: null, // → ROI_ASSUMPTIONS.DEFAULT_REVIEW_TO_CALL_RATE
    currency: "USD",
  };
}

/**
 * Load `RoiSettings` for one establishment (or the org's first configured row
 * when no establishment is given). Returns sensible defaults on missing
 * row / unmigrated table.
 */
export async function loadRoiSettings(
  orgId: string,
  establishmentId: string | null,
): Promise<RoiSettingsInput> {
  try {
    const row = await withTenant(orgId, (tx) =>
      establishmentId
        ? tx.roiSettings.findUnique({
            where: { organizationId_establishmentId: { organizationId: orgId, establishmentId } },
          })
        : tx.roiSettings.findFirst({ orderBy: { updatedAt: "desc" } }),
    );
    if (!row) return defaultSettings();
    return {
      averageJobValue: row.averageJobValue != null ? Number(row.averageJobValue) : null,
      bookingToJobRate:
        row.bookingToJobRate != null
          ? Number(row.bookingToJobRate)
          : ROI_ASSUMPTIONS.DEFAULT_BOOKING_TO_JOB_RATE,
      reviewToCallRate: row.reviewToCallRate != null ? Number(row.reviewToCallRate) : null,
      currency: row.currency || "USD",
    };
  } catch (err) {
    if (!isMissingRelation(err)) {
      logger.warn(
        { orgId, event: "roi.settings.load_failed", error: err instanceof Error ? err.message : String(err) },
        "failed loading RoiSettings — using defaults",
      );
    }
    return defaultSettings();
  }
}

export type RoiHeadline = {
  estimatedRevenue: number;
  currency: string;
  /** Human-readable top revenue driver ("Bookings", "QR reviews", "Voice→Review", …). */
  topDriver: string;
  /** Pass-through funnel counts for the digest one-liner. */
  reviews: number;
  calls: number;
  bookings: number;
};

const DRIVER_LABELS: Record<string, string> = {
  bookings: "Bookings",
  qrReviews: "QR reviews",
  outreachReviews: "Review requests",
  voiceReviews: "Voice → Review",
};

/**
 * The estimated-revenue headline for the digest + dashboard. Composes the funnel
 * and the estimator. Always returns a value (zeros when there's nothing yet).
 */
export async function getRoiHeadline(
  orgId: string,
  range: RoiRange,
  establishmentId: string | null = null,
): Promise<RoiHeadline> {
  const [funnel, settings] = await Promise.all([
    buildRoiFunnel(orgId, { establishmentId, range }),
    loadRoiSettings(orgId, establishmentId),
  ]);

  const estimate = estimateRevenue(
    {
      reviewsFromQr: funnel.reviews.fromQr,
      reviewsFromOutreach: funnel.reviews.fromOutreach,
      reviewsFromVoice: funnel.reviews.fromVoice,
      reviewsOrganic: funnel.reviews.organic,
      calls: funnel.calls,
      bookings: funnel.bookings.total,
    },
    settings,
  );

  // Top driver = the channel contributing the most estimated revenue.
  const entries = Object.entries(estimate.byChannel) as Array<[string, number]>;
  entries.sort((a, b) => b[1] - a[1]);
  const top = entries[0];
  const topDriver = top && top[1] > 0 ? (DRIVER_LABELS[top[0]] ?? top[0]) : "—";

  return {
    estimatedRevenue: estimate.estimatedRevenue,
    currency: estimate.assumptions.currency,
    topDriver,
    reviews: funnel.reviews.total,
    calls: funnel.calls,
    bookings: funnel.bookings.total,
  };
}

export type DeviceRoi = {
  deviceId: string;
  /** Reviews attributed to this specific device's scans. */
  reviews: number;
  /** Lifetime scan count on the device. */
  scans: number;
  /** Estimated booked revenue attributable to this device's reviews ($). */
  estimatedRevenue: number;
  currency: string;
};

/**
 * Per-device ROI for the hardware page line: "this plaque generated N reviews and
 * an estimated $X in booked revenue". Counts reviews with
 * `attributedDeviceId = deviceId` and runs them through the estimator as a QR
 * channel. Tolerant of missing tables → zeros.
 */
export async function getDeviceRoi(orgId: string, deviceId: string): Promise<DeviceRoi> {
  let reviews = 0;
  let scans = 0;
  let establishmentId: string | null = null;

  try {
    const result = await withTenant(orgId, async (tx) => {
      const device = await tx.device.findFirst({
        where: { id: deviceId },
        select: { id: true, scanCount: true, establishmentId: true },
      });
      const reviewCount = await tx.review.count({ where: { attributedDeviceId: deviceId } });
      return {
        scans: device?.scanCount ?? 0,
        establishmentId: device?.establishmentId ?? null,
        reviews: reviewCount,
      };
    });
    reviews = result.reviews;
    scans = result.scans;
    establishmentId = result.establishmentId;
  } catch (err) {
    if (!isMissingRelation(err)) {
      logger.warn(
        { orgId, deviceId, event: "roi.device.load_failed", error: err instanceof Error ? err.message : String(err) },
        "failed loading device ROI — zeros",
      );
    }
  }

  const settings = await loadRoiSettings(orgId, establishmentId);
  const estimate = estimateRevenue(
    {
      reviewsFromQr: reviews,
      reviewsFromOutreach: 0,
      reviewsFromVoice: 0,
      reviewsOrganic: 0,
      calls: 0,
      bookings: 0,
    },
    settings,
  );

  return {
    deviceId,
    reviews,
    scans,
    estimatedRevenue: estimate.estimatedRevenue,
    currency: estimate.assumptions.currency,
  };
}
