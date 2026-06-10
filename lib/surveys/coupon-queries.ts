import { withTenant } from "@/lib/db/with-tenant";

/**
 * Read-side queries for the survey Incentives (coupons) tab.
 *
 * Extracted from the old standalone `/surveys/coupons` page so the Surveys
 * workspace can fetch incentive data server-side and render it inside the
 * Incentives tab. All reads fail soft (un-migrated DB → empty / zeros) so the
 * workspace never errors on a fresh org.
 */

export type IncentiveCoupon = {
  id: string;
  code: string;
  valueCents: number;
  createdAt: string;
  expiresAt: string;
  redeemedAt: string | null;
};

export type IncentiveStats = { issued: number; redeemed: number; expired: number };

/** Recent issued coupons (newest first), capped. Fail-soft → []. */
export async function listCoupons(orgId: string, take = 50): Promise<IncentiveCoupon[]> {
  try {
    return await withTenant(orgId, async (tx) => {
      const rows = await tx.surveyCoupon.findMany({
        orderBy: { createdAt: "desc" },
        take,
      });
      return rows.map((c) => ({
        id: c.id,
        code: c.code,
        valueCents: c.valueCents,
        createdAt: c.createdAt.toISOString(),
        expiresAt: c.expiresAt.toISOString(),
        redeemedAt: c.redeemedAt ? c.redeemedAt.toISOString() : null,
      }));
    });
  } catch {
    return [];
  }
}

/** Issued / redeemed / expired-unredeemed counts. Fail-soft → zeros. */
export async function couponStats(orgId: string): Promise<IncentiveStats> {
  try {
    return await withTenant(orgId, async (tx) => {
      const [issued, redeemed, expired] = await Promise.all([
        tx.surveyCoupon.count(),
        tx.surveyCoupon.count({ where: { redeemedAt: { not: null } } }),
        tx.surveyCoupon.count({ where: { redeemedAt: null, expiresAt: { lt: new Date() } } }),
      ]);
      return { issued, redeemed, expired };
    });
  } catch {
    return { issued: 0, redeemed: 0, expired: 0 };
  }
}
