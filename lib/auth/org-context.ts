import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { redirect } from "next/navigation";
import { cache } from "react";

/**
 * Per-request memoized org context.
 *
 * Multiple components (page + AppShellServer + TopBar + NotificationsBell)
 * all need the org row. React's `cache()` dedupes within a single server
 * request, so we only hit Postgres once per page load instead of 3-4 times.
 *
 * Returns the same data shape every caller needs; pages that only need orgId
 * can destructure { orgId } from it.
 */
export const getOrgContext = cache(async () => {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  const userId = session?.user?.id;
  if (!session?.user || !orgId || !userId) {
    redirect("/login");
  }
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      id: true,
      name: true,
      // Slug is the per-tenant URL identifier (used for inbound-email
      // routing like `reviews-<slug>@inbound.repulabs.com`). Keep it in
      // the org-context cache so onboarding pages don't have to re-fetch.
      slug: true,
      plan: true,
      stripeCustomerId: true,
      ownerName: true,
      ownerEmail: true,
      phone: true,
      country: true,
      websiteUrl: true,
      logoUrl: true,
      businessDescription: true,
    },
  });
  if (!org) redirect("/login");
  return {
    orgId,
    userId,
    userEmail: session.user.email ?? null,
    userName: session.user.name ?? null,
    org,
  };
});

/**
 * Lightweight variant for callers that only need the IDs without the full
 * org row. Still memoized; uses the same cache slot as getOrgContext.
 */
export const getOrgIds = cache(async () => {
  const ctx = await getOrgContext();
  return { orgId: ctx.orgId, userId: ctx.userId };
});
