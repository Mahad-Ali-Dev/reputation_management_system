import { ADMIN_COOKIE_NAME, ADMIN_SESSION_TTL, signAdminSession } from "@/lib/admin/session";
import { prisma } from "@/lib/db/client";
import { logger } from "@/lib/logger";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";
import argon2 from "argon2";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
});

/**
 * POST /api/admin/login — admin sign-in (email + argon2id password).
 *
 * Rate-limited per IP + per email (10 / 5min each, `login_attempt` limiter).
 * Audit logged regardless of outcome.
 */
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const { email, password } = parsed.data;
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;

  // Bound brute force on the admin plane: cap attempts per email AND per IP
  // (10 / 5 min each). argon2's CPU cost alone does not limit request volume.
  const [ipRl, emailRl] = await Promise.all([
    checkRateLimit("login_attempt", `admin_ip:${ip ?? "unknown"}`),
    checkRateLimit("login_attempt", `admin_email:${email}`),
  ]);
  const limited = !ipRl.success ? ipRl : !emailRl.success ? emailRl : null;
  if (limited) {
    logger.warn({ email, ip, event: "admin.login.rate_limited" });
    return (
      rateLimitResponse(limited) ?? NextResponse.json({ error: "rate_limited" }, { status: 429 })
    );
  }

  const admin = await prisma.adminUser.findUnique({ where: { email } });
  if (!admin || !admin.isActive) {
    // Constant-time-ish: still hash a dummy to slow brute force
    await argon2.verify("$argon2id$v=19$m=65536,t=3,p=4$dummy$dummy", password).catch(() => false);
    logger.warn({ email, ip, event: "admin.login.unknown_or_inactive" });
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const ok = await argon2.verify(admin.passwordHash, password).catch(() => false);
  if (!ok) {
    await prisma.auditLog.create({
      data: {
        actorType: "admin_user",
        actorId: admin.id,
        action: "admin.login.failed",
        ip,
        userAgent: req.headers.get("user-agent") ?? null,
      },
    });
    logger.warn({ adminId: admin.id, ip, event: "admin.login.bad_password" });
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date(), lastIp: ip },
  });

  await prisma.auditLog.create({
    data: {
      actorType: "admin_user",
      actorId: admin.id,
      action: "admin.login.success",
      ip,
      userAgent: req.headers.get("user-agent") ?? null,
    },
  });

  const jwt = await signAdminSession({
    adminId: admin.id,
    email: admin.email,
    role: admin.role as "super_admin" | "support" | "finance" | "engineering",
  });

  const res = NextResponse.json({ ok: true });
  // SameSite=strict on admin: no third-party site should ever be able to
  // initiate a request that carries the admin session, even via top-level
  // navigation. The admin login flow is fully same-origin so users won't
  // see logged-out state when arriving from external links.
  res.cookies.set(ADMIN_COOKIE_NAME, jwt, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: ADMIN_SESSION_TTL,
    path: "/",
  });

  logger.info({ adminId: admin.id, email: admin.email, event: "admin.login.success" });
  return res;
}
