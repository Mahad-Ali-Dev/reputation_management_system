import { matchTabForPath } from "@/lib/access/tabs";
import { resolveSessionOrg } from "@/lib/auth/active-org";
import { prisma } from "@/lib/db/client";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

/**
 * Per-request memoized org context.
 *
 * Multiple components (page + AppShellServer + TopBar + NotificationsBell)
 * all need the org row. React's `cache()` dedupes within a single server
 * request, so we only hit Postgres once per page load instead of 3-4 times.
 *
 * orgId/role come from `resolveSessionOrg()` — the user's ACTIVE workspace,
 * which may differ from their session default after `switchOrg()` or right
 * after accepting a team invite (see lib/auth/active-org.ts for why that
 * distinction exists).
 *
 * Also enforces per-member tab access here (see lib/access/tabs.ts): if the
 * requested path belongs to a cataloged tab the member's `allowedTabs`
 * doesn't include, this redirects to /restricted before the page ever renders
 * — a locked sidebar item is a hint, not the actual gate. Centralized here
 * (rather than in each of the ~15 top-level pages) because EVERY tenant page
 * already calls this on its way in, so one check covers all of them, top-level
 * route and nested sub-route alike.
 *
 * Returns the same data shape every caller needs; pages that only need orgId
 * can destructure { orgId } from it.
 */
export const getOrgContext = cache(async () => {
  const sessionOrg = await resolveSessionOrg();
  if (!sessionOrg) redirect("/login");
  const { orgId, userId, role, allowedTabs } = sessionOrg;

  if (allowedTabs.length > 0) {
    const pathname = (await headers()).get("x-pathname") ?? "";
    const tab = matchTabForPath(pathname);
    if (tab && !allowedTabs.includes(tab.key)) {
      redirect(`/restricted?feature=${encodeURIComponent(tab.label)}`);
    }
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
    userEmail: sessionOrg.email,
    userName: sessionOrg.name,
    /** The user's role in `org` — NOT necessarily their role in every org
     *  they belong to (see resolveSessionOrg). */
    role,
    allowedTabs,
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
