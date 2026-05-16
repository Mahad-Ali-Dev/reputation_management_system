import { NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME, getAdminSession } from "@/lib/admin/session";
import { prisma } from "@/lib/db/client";

export const runtime = "nodejs";

export async function POST() {
  const session = await getAdminSession();
  if (session) {
    await prisma.auditLog.create({
      data: {
        actorType: "admin_user",
        actorId: session.adminId,
        action: "admin.logout",
      },
    });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(ADMIN_COOKIE_NAME);
  return res;
}
