import { resolveSessionOrg } from "@/lib/auth/active-org";
import { roleAtLeast } from "@/lib/auth/rbac";
import { createPortalSession } from "@/lib/billing/actions";
import { NextResponse } from "next/server";

// Auth-dependent handler (reads the session cookie via `auth()`) — never
// statically optimize.
export const dynamic = "force-dynamic";

export async function POST() {
  const sessionOrg = await resolveSessionOrg();
  if (!sessionOrg) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { orgId } = sessionOrg;
  // Billing is an owner/admin action.
  if (!roleAtLeast(sessionOrg.role, "admin")) {
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
