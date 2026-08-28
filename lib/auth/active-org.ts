import { SESSION_COOKIE_NAME, auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
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
  /** Whitelist of tab keys (lib/access/tabs.ts) this membership is restricted
   *  to. Empty = unrestricted (default for every membership). */
  allowedTabs: string[];
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
 * Role AND `allowedTabs` are always read fresh from `Membership` here (never
 * from the session cookie), so an admin narrowing a teammate's tab access
 * takes effect on their very next request rather than waiting out the
 * session's cache lifetime.
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
 * to a single `auth()` call + one Membership lookup, same as `getOrgContext`
 * already does for the org row.
 */
export const resolveSessionOrg = cache(async (): Promise<SessionOrg | null> => {
  const session = await auth();
  const userId = session?.user?.id;
  const sessionOrgId = (session as { orgId?: string } | null)?.orgId;
  if (!session?.user || !userId || !sessionOrgId) return null;

  const identity = { userId, email: session.user.email ?? null, name: session.user.name ?? null };

  // 2FA gate: a signed-in-but-unverified session (TOTP enabled, this session
  // hasn't passed the code check yet) may not resolve an org — every tenant
  // page goes through here, so this one check covers all of them. `/login/2fa`
  // itself reads `auth()` directly and never calls this, so there's no loop.
  const jar = await cookies();
  const sessionToken = jar.get(SESSION_COOKIE_NAME)?.value;
  if (sessionToken) {
    const sessionRow = await prisma.session.findUnique({
      where: { sessionToken },
      select: { twoFactorVerified: true, user: { select: { totpEnabled: true } } },
    });
    if (sessionRow?.user.totpEnabled && !sessionRow.twoFactorVerified) {
      redirect("/login/2fa");
    }
  } else {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { totpEnabled: true } });
    if (user?.totpEnabled) redirect("/login/2fa");
  }

  const requestedOrgId = jar.get(ACTIVE_ORG_COOKIE)?.value;
  const targetOrgId = requestedOrgId ?? sessionOrgId;

  let membership = await prisma.membership.findUnique({
    where: { organizationId_userId: { organizationId: targetOrgId, userId } },
    select: { organizationId: true, role: true, allowedTabs: true },
  });
  // The cookie pointed at an org the user is no longer a member of (removed,
  // or a stale value from before) — fall back to the session default rather
  // than leaking a permission-denied vs. logged-out ambiguity.
  if (!membership && targetOrgId !== sessionOrgId) {
    membership = await prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId: sessionOrgId, userId } },
      select: { organizationId: true, role: true, allowedTabs: true },
    });
  }
  if (!membership) return null;

  return {
    ...identity,
    orgId: membership.organizationId,
    role: membership.role,
    allowedTabs: membership.allowedTabs,
  };
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
