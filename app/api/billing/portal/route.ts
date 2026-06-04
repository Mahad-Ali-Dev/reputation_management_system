import { auth } from "@/lib/auth/config";
import { roleAtLeast } from "@/lib/auth/rbac";
import { createPortalSession } from "@/lib/billing/actions";
import { NextResponse } from "next/server";

export async function POST() {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  if (!session || !orgId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  // Billing is an owner/admin action.
  if (!roleAtLeast((session as { role?: string }).role, "admin")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const url = await createPortalSession(orgId);
    return NextResponse.json({ url });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error }, { status: 500 });
  }
}
