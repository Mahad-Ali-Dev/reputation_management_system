import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { cookies } from "next/headers";
import { cache } from "react";

/**
 * Cookie holding the user's chosen "active" workspace when they belong to more
 * than one — set by `switchOrg()` (lib/auth/active-org-actions.ts) and by
 * `acceptInvite()` (lib/account/actions.ts) right after a new membership is
 * created, so accepting an invite actually lands the user IN that workspace.
 */
export const ACTIVE_ORG_COOKIE = "rl_active_org";

export type SessionOrg = {
  userId: string;
  email: string | null;
  name: string | null;
  orgId: string;
  role: string;
};

/**
 * Resolve the signed-in user's ACTIVE org + role for this request.
 *
 * Every new user gets an auto-created personal workspace on first sign-in
 * (see `ensureOrgForUser` in lib/auth/config.ts) — including someone signing
 * in purely to accept a team invite, since account creation happens before
 * they ever reach /accept-invite. So accepting an invite almost always leaves
 * a user with TWO memberships: their own workspace (older) and the one they
 * were just invited into (newer). The Auth.js `session` callback picks a
 * stable DEFAULT (their oldest membership) so a returning user always lands
 * somewhere predictable — but that default can never be the workspace they
 * were just invited into.
 *
 * This resolver is what makes that workspace reachable: a validated
 * `rl_active_org` cookie overrides the session default. It's re-checked
 * against `Membership` on every call (never trusted blindly), so a stale or
 * foreign id — e.g. after being removed from a workspace — silently falls
 * back to the session default instead of leaking access.
 *
 * This is the SINGLE place org/role resolution happens. Every server action,
 * route handler and page should go through this (directly, or via
 * `getOrgContext()` / `requireRole()`, which both delegate to it) rather than
 * reading `session.orgId` / `session.role` directly — reading the session
 * fields directly means acting on the OLD org's role even after the user has
 * switched to a different workspace.
 *
 * Wrapped in React `cache()`: AppShellServer, TopBar and the page itself all
 * resolve this independently within one request, and this dedupes them down
 * to a single `auth()` call + (at most) one Membership lookup, same as
 * `getOrgContext` already does for the org row.
 */
export const resolveSessionOrg = cache(async (): Promise<SessionOrg | null> => {
  const session = await auth();
  const userId = session?.user?.id;
  const sessionOrgId = (session as { orgId?: string } | null)?.orgId;
  const sessionRole = (session as { role?: string } | null)?.role;
  if (!session?.user || !userId || !sessionOrgId || !sessionRole) return null;

  const base: SessionOrg = {
    userId,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
    orgId: sessionOrgId,
    role: sessionRole,
  };

  const requestedOrgId = (await cookies()).get(ACTIVE_ORG_COOKIE)?.value;
  if (!requestedOrgId || requestedOrgId === sessionOrgId) return base;

  const membership = await prisma.membership.findUnique({
    where: { organizationId_userId: { organizationId: requestedOrgId, userId } },
    select: { organizationId: true, role: true },
  });
  if (!membership) return base;

  return { ...base, orgId: membership.organizationId, role: membership.role };
});

export type Workspace = {
  orgId: string;
  name: string;
  role: string;
  isActive: boolean;
};

/** Every workspace the user belongs to, for the workspace switcher UI. */
export async function listUserWorkspaces(userId: string, activeOrgId: string): Promise<Workspace[]> {
  const rows = await prisma.membership.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { role: true, organization: { select: { id: true, name: true } } },
  });
  return rows.map((m) => ({
    orgId: m.organization.id,
    name: m.organization.name,
    role: m.role,
    isActive: m.organization.id === activeOrgId,
  }));
}
