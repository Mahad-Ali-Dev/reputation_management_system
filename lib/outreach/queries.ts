import { withTenant } from "@/lib/db/with-tenant";

export async function listReviewRequests(orgId: string, limit = 50) {
  return withTenant(orgId, async (tx) => {
    return tx.reviewRequest.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        establishment: { select: { id: true, name: true } },
      },
    });
  });
}

export async function reviewRequestStats(orgId: string) {
  return withTenant(orgId, async (tx) => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [sent, delivered, opened, converted] = await Promise.all([
      tx.reviewRequest.count({ where: { sentAt: { gte: since } } }),
      tx.reviewRequest.count({ where: { deliveredAt: { gte: since } } }),
      tx.reviewRequest.count({ where: { openedAt: { gte: since } } }),
      tx.reviewRequest.count({ where: { convertedAt: { gte: since } } }),
    ]);
    return { sent, delivered, opened, converted };
  });
}
