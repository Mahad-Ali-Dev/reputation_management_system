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
