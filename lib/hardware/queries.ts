import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/with-tenant";

export async function listProducts() {
  return prisma.hardwareProduct.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
}

export async function listOrgOrders(orgId: string) {
  return withTenant(orgId, async (tx) => {
    return tx.hardwareOrder.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        items: {
          include: { product: { select: { sku: true, name: true } } },
        },
        devices: { select: { id: true, shortSlug: true, status: true } },
      },
    });
  });
}

export async function getOrder(orgId: string, orderId: string) {
  return withTenant(orgId, async (tx) => {
    return tx.hardwareOrder.findFirst({
      where: { id: orderId },
      include: {
        items: { include: { product: true } },
        devices: { select: { id: true, shortSlug: true, status: true, activationCodeHash: true } },
      },
    });
  });
}

export async function listOrgDevices(orgId: string) {
  return withTenant(orgId, async (tx) => {
    return tx.device.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      include: {
        establishment: { select: { name: true } },
      },
    });
  });
}

// ============================================================
// Module 04 — My Devices helpers
//
// Two thin, tenant-scoped data helpers + a couple of pure functions extracted
// so the page stays lean and the math is unit-testable. The existing exports
// above (listOrgDevices, listProducts, listOrgOrders, getOrder) are untouched —
// other callers depend on them.
// ============================================================

/** Org-aggregate device metrics powering the 3-pill summary row. */
export type DeviceMetrics = {
  /** Total scans across every device (all-time), summed from Device.scanCount. */
  totalScans: number;
  /** Reviews attributed to a scan (Review.attributedDeviceId IS NOT NULL). */
  reviewsFromScans: number;
  /** reviewsFromScans / totalScans, in [0,1]; 0 when there are no scans. */
  conversionRate: number;
};

/**
 * Pure conversion math. Kept separate so the summary pill, the per-device card,
 * and the unit tests all agree on a single formula. Returns 0 when there were
 * no scans (avoids NaN / divide-by-zero) — callers render "—" for that case.
 */
export function conversionRate(reviews: number, scans: number): number {
  if (scans <= 0) return 0;
  return reviews / scans;
}

/**
 * Format a conversion ratio as a one-decimal percentage string (e.g. "12.5%").
 * Renders an em-dash when there were no scans, matching the page's current
 * "no data yet" affordance.
 */
export function formatConversionPct(reviews: number, scans: number): string {
  if (scans <= 0) return "—";
  const pct = Math.round(conversionRate(reviews, scans) * 1000) / 10;
  return `${pct.toFixed(1)}%`;
}

/**
 * Whole-percent conversion for the compact per-device metric (e.g. "37%").
 * Em-dash when there were no scans.
 */
export function formatConversionWhole(reviews: number, scans: number): string {
  if (scans <= 0) return "—";
  return `${Math.round(conversionRate(reviews, scans) * 100)}%`;
}

/** The contextual next-step banner has exactly two shapes. */
export type BannerVariant = "pro" | "free";

/** Pure branch selector for the Pro/Free next-step banner. */
export function pickBannerVariant(isPro: boolean): BannerVariant {
  return isPro ? "pro" : "free";
}

/**
 * Org-aggregate metrics for the summary row. All inside one tenant-scoped
 * transaction so RLS predicates are evaluated once.
 *
 * - totalScans      : sum of Device.scanCount across active devices (cheapest
 *                     correct path; matches the lifetime "Total Scans" the spec
 *                     draws — not a 30d window).
 * - reviewsFromScans: COUNT(Review WHERE attributedDeviceId IS NOT NULL).
 * - conversionRate  : reviewsFromScans / totalScans (0 when no scans).
 */
export async function getDeviceMetrics(orgId: string): Promise<DeviceMetrics> {
  return withTenant(orgId, async (tx) => {
    const [scanAgg, reviewsFromScans] = await Promise.all([
      tx.device.aggregate({
        where: { organizationId: orgId, status: "active" },
        _sum: { scanCount: true },
      }),
      tx.review.count({
        where: { organizationId: orgId, attributedDeviceId: { not: null } },
      }),
    ]);
    const totalScans = scanAgg._sum.scanCount ?? 0;
    return {
      totalScans,
      reviewsFromScans,
      conversionRate: conversionRate(reviewsFromScans, totalScans),
    };
  });
}

/** A device row augmented with its catalog product thumbnail + name. */
export type DeviceWithProduct = Awaited<ReturnType<typeof listOrgDevices>>[number] & {
  productImageUrl: string | null;
  productName: string | null;
  /** Reviews attributed to THIS device (Review.attributedDeviceId === id). */
  reviewCount: number;
};

/**
 * Like `listOrgDevices` but additionally resolves each device's
 * `HardwareProduct` (for the card thumbnail) and its per-device review count.
 *
 * `hardware_products` is a global catalog keyed by `sku` (no RLS — see the
 * documented direct-prisma precedent in `lib/hardware/actions.ts`), so we fetch
 * the product set with one query OUTSIDE `withTenant` and join in JS by
 * `productSku`. A device whose SKU has no catalog row (e.g. `self-service-qr`)
 * falls back to a null image/name without throwing.
 */
export async function listOrgDevicesWithProduct(orgId: string): Promise<DeviceWithProduct[]> {
  const devices = await listOrgDevices(orgId);

  const skus = Array.from(new Set(devices.map((d) => d.productSku).filter(Boolean)));
  const deviceIds = devices.map((d) => d.id);

  // Per-device review counts (tenant-scoped) + global catalog read run in
  // parallel. The catalog read is the documented no-RLS exception.
  const [products, reviewsByDevice] = await Promise.all([
    skus.length > 0
      ? prisma.hardwareProduct.findMany({
          where: { sku: { in: skus } },
          select: { sku: true, name: true, imageUrl: true },
        })
      : Promise.resolve([] as Array<{ sku: string; name: string; imageUrl: string | null }>),
    deviceIds.length > 0
      ? withTenant(orgId, (tx) =>
          tx.review.groupBy({
            by: ["attributedDeviceId"],
            where: { organizationId: orgId, attributedDeviceId: { in: deviceIds } },
            _count: { _all: true },
          }),
        )
      : Promise.resolve(
          [] as Array<{ attributedDeviceId: string | null; _count: { _all: number } }>,
        ),
  ]);

  const productBySku = new Map(products.map((p) => [p.sku, p]));
  const reviewCountByDeviceId = new Map<string, number>();
  for (const r of reviewsByDevice) {
    if (r.attributedDeviceId) reviewCountByDeviceId.set(r.attributedDeviceId, r._count._all);
  }

  return devices.map((d) => {
    const product = productBySku.get(d.productSku);
    return {
      ...d,
      productImageUrl: product?.imageUrl ?? null,
      productName: product?.name ?? null,
      reviewCount: reviewCountByDeviceId.get(d.id) ?? 0,
    };
  });
}

// ============================================================
// My Devices kit — dashboard extras
//
// New fail-soft reads powering the redesigned dashboard's lower-section cards
// (Live feed · Reviews-by-rating · Devices-impact) plus the "Today" summary
// metric. All bound to REAL tenant data; any un-migrated relation/column
// (P2021/P2022/42P01/42703) degrades to an empty/zero shape so the page never
// 500s — mirroring the page's existing isMissingRelation pattern.
// ============================================================

/** A recent review row for the Live feed card (scan-attributed first). */
export type RecentReviewRow = {
  id: string;
  reviewerName: string | null;
  rating: number;
  body: string | null;
  source: string;
  postedAt: Date;
};

/** One day in the Devices-impact series. */
export type ImpactDay = {
  /** Short weekday label, e.g. "Mon". */
  label: string;
  scans: number;
  reviews: number;
};

export type DeviceDashboardExtras = {
  /** Org-wide scans recorded today (DeviceScan.scannedAt >= start of today). */
  todayScans: number;
  /** Count of currently-active devices (status === "active"). */
  activeDeviceCount: number;
  /** rating(1..5) → count, over all the org's reviews. */
  reviewsByRating: Record<1 | 2 | 3 | 4 | 5, number>;
  /** Last 7 days (oldest→newest) of org-wide scans + reviews. */
  impact: ImpactDay[];
  /** Up to `limit` most-recent reviews for the Live feed. */
  recentReviews: RecentReviewRow[];
};

function emptyExtras(activeDeviceCount = 0): DeviceDashboardExtras {
  return {
    todayScans: 0,
    activeDeviceCount,
    reviewsByRating: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    impact: buildEmptyImpact(),
    recentReviews: [],
  };
}

/** A code (P2021/P2022) or 42P01/42703 SQLSTATE → relation/column missing. */
function isMissingRelationErr(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  if (code === "P2021" || code === "P2022" || code === "42P01" || code === "42703") return true;
  const metaCode = (err as { meta?: { code?: string } } | null)?.meta?.code;
  return metaCode === "42P01" || metaCode === "42703";
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** A 7-element zeroed series ending today (oldest→newest). */
function buildEmptyImpact(): ImpactDay[] {
  const today = startOfDay(new Date());
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(today);
    day.setDate(today.getDate() - (6 - i));
    return { label: WEEKDAY_LABELS[day.getDay()] ?? "?", scans: 0, reviews: 0 };
  });
}

/**
 * One tenant-scoped read for every lower-section card on the My Devices
 * dashboard. Bins the last 7 days of DeviceScan + Review rows in JS so the SQL
 * stays portable. Fails soft to {@link emptyExtras}.
 */
export async function getDeviceDashboardExtras(
  orgId: string,
  recentLimit = 3,
): Promise<DeviceDashboardExtras> {
  const today = startOfDay(new Date());
  const since7d = new Date(today);
  since7d.setDate(today.getDate() - 6);

  try {
    return await withTenant(orgId, async (tx) => {
      const [activeDeviceCount, ratingGroups, scans, reviews, recent] = await Promise.all([
        tx.device.count({ where: { organizationId: orgId, status: "active" } }),
        tx.review.groupBy({
          by: ["rating"],
          where: { organizationId: orgId },
          _count: { _all: true },
        }),
        tx.deviceScan.findMany({
          where: { scannedAt: { gte: since7d } },
          select: { scannedAt: true },
        }),
        tx.review.findMany({
          where: { postedAt: { gte: since7d } },
          select: { postedAt: true },
        }),
        tx.review.findMany({
          orderBy: { postedAt: "desc" },
          take: Math.min(recentLimit, 10),
          select: {
            id: true,
            reviewerName: true,
            rating: true,
            body: true,
            source: true,
            postedAt: true,
          },
        }),
      ]);

      const reviewsByRating: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      for (const g of ratingGroups) {
        const r = g.rating as 1 | 2 | 3 | 4 | 5;
        if (r >= 1 && r <= 5) reviewsByRating[r] = g._count._all;
      }

      const impact = buildEmptyImpact();
      const dayIndex = (d: Date) => {
        const diff = Math.floor((startOfDay(d).getTime() - since7d.getTime()) / 86_400_000);
        return diff >= 0 && diff < 7 ? diff : -1;
      };
      let todayScans = 0;
      for (const s of scans) {
        const idx = dayIndex(s.scannedAt);
        if (idx >= 0) {
          const bucket = impact[idx];
          if (bucket) bucket.scans += 1;
        }
        if (s.scannedAt >= today) todayScans += 1;
      }
      for (const r of reviews) {
        const idx = dayIndex(r.postedAt);
        if (idx >= 0) {
          const bucket = impact[idx];
          if (bucket) bucket.reviews += 1;
        }
      }

      return {
        todayScans,
        activeDeviceCount,
        reviewsByRating,
        impact,
        recentReviews: recent,
      };
    });
  } catch (err) {
    if (isMissingRelationErr(err)) return emptyExtras();
    throw err;
  }
}
