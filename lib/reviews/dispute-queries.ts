import { withTenant } from "@/lib/db/with-tenant";

export async function getReviewDispute(orgId: string, reviewId: string) {
  return withTenant(orgId, async (tx) =>
    tx.reviewDispute.findUnique({
      where: { reviewId },
    }),
  );
}

export async function listOpenDisputes(orgId: string, limit = 50) {
  return withTenant(orgId, async (tx) =>
    tx.reviewDispute.findMany({
      where: { status: { in: ["submitted", "submitted_to_google"] } },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
  );
}
