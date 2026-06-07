import { withTenant } from "@/lib/db/with-tenant";

export type ListReviewRequestsOpts = {
  /** Filter by exact status (e.g. "sent", "failed"). */
  status?: string;
  /** Filter by trigger source (e.g. "manual", "automation"). */
  triggerSource?: string;
  /** Pagination offset. */
  skip?: number;
  /** Page size (default 50). */
  take?: number;
};

/**
 * List review requests for the Sent-History table (manual + automated — one
 * stream). Backward compatible: existing callers passing only `orgId` (and an
 * optional number limit) keep working.
 */
export async function listReviewRequests(orgId: string, opts: ListReviewRequestsOpts | number = {}) {
  // Back-compat: a bare number is treated as the old `limit` arg.
  const o: ListReviewRequestsOpts = typeof opts === "number" ? { take: opts } : opts;
  const take = o.take ?? 50;
  return withTenant(orgId, async (tx) => {
    return tx.reviewRequest.findMany({
      where: {
        ...(o.status ? { status: o.status } : {}),
        ...(o.triggerSource ? { triggerSource: o.triggerSource } : {}),
      },
      orderBy: { createdAt: "desc" },
      skip: o.skip ?? 0,
      take,
      select: {
        id: true,
        channel: true,
        recipient: true,
        recipientName: true,
        status: true,
        triggerSource: true,
        scheduledFor: true,
        sentAt: true,
        deliveredAt: true,
        openedAt: true,
        clickedAt: true,
        convertedAt: true,
        createdAt: true,
        establishment: { select: { id: true, name: true } },
      },
    });
  });
}

/**
 * 30-day funnel counts for the Sent-History stat cards:
 * Total Sent · Opened · Clicked · Reviews Left (converted).
 */
export async function reviewRequestStats(orgId: string) {
  return withTenant(orgId, async (tx) => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [sent, delivered, opened, clicked, converted] = await Promise.all([
      tx.reviewRequest.count({ where: { sentAt: { gte: since } } }),
      tx.reviewRequest.count({ where: { deliveredAt: { gte: since } } }),
      tx.reviewRequest.count({ where: { openedAt: { gte: since } } }),
      tx.reviewRequest.count({ where: { clickedAt: { gte: since } } }),
      tx.reviewRequest.count({ where: { convertedAt: { gte: since } } }),
    ]);
    return { sent, delivered, opened, clicked, converted };
  });
}
