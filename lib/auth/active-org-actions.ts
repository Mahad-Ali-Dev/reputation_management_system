"use server";

import { ACTIVE_ORG_COOKIE } from "@/lib/auth/active-org";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/** Only same-site relative paths are honored — never an open redirect. */
function safeRedirectTarget(raw: FormDataEntryValue | null): string {
  const path = typeof raw === "string" ? raw : "";
  return path.startsWith("/") && !path.startsWith("//") ? path : "/dashboard";
}

/**
 * Switch the signed-in user's active workspace (the sidebar workspace
 * switcher). Validates the target org against the user's own `Membership`
 * rows before writing the cookie — a user can only switch into a workspace
 * they actually belong to, never an arbitrary id.
 */
export async function switchOrg(form: FormData): Promise<void> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const orgId = String(form.get("orgId") ?? "");
  const redirectTo = safeRedirectTarget(form.get("redirectTo"));

  const membership = await prisma.membership.findUnique({
    where: { organizationId_userId: { organizationId: orgId, userId } },
    select: { organizationId: true },
  });
  if (!membership) {
    // Not a member of that org — no-op rather than switching into it.
    redirect(redirectTo);
  }

  const jar = await cookies();
  jar.set(ACTIVE_ORG_COOKIE, orgId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  redirect(redirectTo);
}
