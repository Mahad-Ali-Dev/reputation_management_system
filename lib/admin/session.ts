import { SignJWT, jwtVerify } from "jose";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";

/**
 * Admin session — completely separate from tenant Auth.js sessions.
 *
 * Uses a signed JWT in a HttpOnly cookie scoped to the admin subdomain. No DB session
 * row (stateless), but every action is audit-logged.
 *
 * Cookie: `admin_session` — value is the JWT.
 * Domain: admin.<root> in prod; localhost in dev.
 * TTL: 12 hours, no rolling.
 *
 * For v1 we use email+password only. WebAuthn / TOTP enrollment is Day-15 work per SECURITY_AND_OPS_REVIEW.
 */

const ALG = "HS256" as const;
const TTL_SECONDS = 12 * 60 * 60;
const COOKIE_NAME = "admin_session";

function getSecret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET not set (reused for admin session signing)");
  return new TextEncoder().encode(s);
}

export type AdminSessionClaims = {
  adminId: string;
  email: string;
  role: "super_admin" | "support" | "finance" | "engineering";
  // Impersonation context — if set, the admin is read-only viewing this tenant
  imp?: { orgId: string; startedAt: number; reason: string };
};

export async function signAdminSession(claims: Omit<AdminSessionClaims, "imp"> & { imp?: AdminSessionClaims["imp"] }): Promise<string> {
  return new SignJWT(claims as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function verifyAdminSession(token: string): Promise<AdminSessionClaims> {
  const { payload } = await jwtVerify(token, getSecret(), { algorithms: [ALG] });
  return payload as unknown as AdminSessionClaims;
}

export async function getAdminSession(): Promise<AdminSessionClaims | null> {
  const store = await cookies();
  const cookie = store.get(COOKIE_NAME);
  if (!cookie?.value) return null;
  try {
    return await verifyAdminSession(cookie.value);
  } catch {
    return null;
  }
}

export async function getAdminSessionFromRequest(req: NextRequest): Promise<AdminSessionClaims | null> {
  const cookie = req.cookies.get(COOKIE_NAME);
  if (!cookie?.value) return null;
  try {
    return await verifyAdminSession(cookie.value);
  } catch {
    return null;
  }
}

export { COOKIE_NAME as ADMIN_COOKIE_NAME, TTL_SECONDS as ADMIN_SESSION_TTL };
