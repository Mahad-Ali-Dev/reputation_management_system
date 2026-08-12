import { resolveSessionOrg } from "@/lib/auth/active-org";
import { redirect } from "next/navigation";

/**
 * Intra-tenant role-based access control.
 *
 * RLS (`withTenant`) enforces org ISOLATION but not roles WITHIN an org —
 * without these checks a `viewer`/`member` could perform owner-only actions
 * (delete data, manage the team, start billing, spend on SMS/AI).
 *
 * Role hierarchy (matches the `memberships.role` enum):
 *   owner (4) > admin (3) > manager (2) > member (1) > viewer (0)
 *
 * Convention:
 *   - team / billing / destructive ops  → require "admin" (owner + admin)
 *   - content writes                    → require "manager" (owner/admin/manager)
 *   - reads                             → any member (no check)
 */
export type Role = "owner" | "admin" | "manager" | "member" | "viewer";

const RANK: Record<string, number> = {
  owner: 4,
  admin: 3,
  manager: 2,
  member: 1,
  viewer: 0,
};

/** True if `role` is at least as privileged as `min`. */
export function roleAtLeast(role: string | null | undefined, min: Role): boolean {
  return (RANK[role ?? ""] ?? -1) >= (RANK[min] ?? 0);
}

/** Thrown when a session is authenticated but lacks the required role. */
export class ForbiddenError extends Error {
  readonly code = "forbidden";
  constructor(min: Role, role: string | null | undefined) {
    super(`forbidden: requires ${min} role (you are ${role ?? "unknown"})`);
    this.name = "ForbiddenError";
  }
}

/**
 * Require an authenticated session whose active-org role is at least `min`.
 * Redirects to /login when unauthenticated; throws ForbiddenError when the
 * session exists but the role is insufficient. Returns the same shape the
 * per-file `requireOrg()` helpers do, so it can drop-in replace them.
 */
export async function requireRole(
  min: Role,
): Promise<{ orgId: string; userId: string; role: string }> {
  const sessionOrg = await resolveSessionOrg();
  if (!sessionOrg) redirect("/login");
  const { orgId, userId, role } = sessionOrg;
  if (!roleAtLeast(role, min)) throw new ForbiddenError(min, role);
  return { orgId, userId, role };
}
