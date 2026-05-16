import { type NextRequest, NextResponse } from "next/server";
import {
  ADMIN_COOKIE_NAME,
  ADMIN_SESSION_TTL,
  getAdminSession,
  signAdminSession,
} from "@/lib/admin/session";
import { prisma } from "@/lib/db/client";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * POST /api/admin/impersonate
 *
 * action=start  → set `imp` claim on the admin JWT (read-only view of a tenant)
 * action=end    → clear `imp` claim
 *
 * All actions are audit-logged (with mandatory reason on start).
 */
export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }

  const form = await req.formData();
  const action = form.get("action");
  const orgId = form.get("orgId");
  const reason = (form.get("reason") as string | null) ?? "";

  if (action === "start") {
    if (typeof orgId !== "string" || !/^[0-9a-f-]{36}$/i.test(orgId)) {
      return NextResponse.json({ error: "invalid_org_id" }, { status: 400 });
    }
    if (reason.trim().length < 6) {
      return NextResponse.json({ error: "reason_required" }, { status: 400 });
    }

    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) return NextResponse.json({ error: "org_not_found" }, { status: 404 });

    const newJwt = await signAdminSession({
      adminId: session.adminId,
      email: session.email,
      role: session.role,
      imp: {
        orgId,
        startedAt: Date.now(),
        reason: reason.trim().slice(0, 200),
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "admin_user",
        actorId: session.adminId,
        action: "admin.impersonation.started",
        afterData: { reason: reason.trim() },
        ip: req.headers.get("x-forwarded-for") ?? null,
        userAgent: req.headers.get("user-agent") ?? null,
      },
    });

    logger.info(
      { adminId: session.adminId, orgId, reason: reason.trim(), event: "admin.impersonation.started" },
      "admin impersonation started",
    );

    const res = NextResponse.redirect(new URL(`/admin/tenants/${orgId}`, req.url), { status: 303 });
    res.cookies.set(ADMIN_COOKIE_NAME, newJwt, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: ADMIN_SESSION_TTL,
      path: "/",
    });
    return res;
  }

  if (action === "end") {
    if (session.imp) {
      await prisma.auditLog.create({
        data: {
          organizationId: session.imp.orgId,
          actorType: "admin_user",
          actorId: session.adminId,
          action: "admin.impersonation.ended",
          beforeData: { reason: session.imp.reason, startedAt: session.imp.startedAt },
        },
      });
    }
    const cleared = await signAdminSession({
      adminId: session.adminId,
      email: session.email,
      role: session.role,
    });
    const res = NextResponse.redirect(new URL("/admin", req.url), { status: 303 });
    res.cookies.set(ADMIN_COOKIE_NAME, cleared, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: ADMIN_SESSION_TTL,
      path: "/",
    });
    return res;
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
