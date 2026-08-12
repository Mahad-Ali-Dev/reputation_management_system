import { resolveSessionOrg } from "@/lib/auth/active-org";
import { roleAtLeast } from "@/lib/auth/rbac";
import { createCheckoutSession } from "@/lib/billing/actions";
import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";

// Auth-dependent handler (reads the session cookie via `auth()`) — never
// statically optimize.
export const dynamic = "force-dynamic";

/**
 * POST /api/billing/checkout
 *
 * For client-side / external callers. Server components / server actions should call
 * `createCheckoutSession()` directly to avoid an unnecessary HTTP round-trip + cookie issues.
 */
export async function POST() {
  const sessionOrg = await resolveSessionOrg();
  if (!sessionOrg || !sessionOrg.email) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { orgId, email: userEmail } = sessionOrg;
  // Billing is an owner/admin action.
  if (!roleAtLeast(sessionOrg.role, "admin")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const url = await createCheckoutSession(orgId, userEmail);
    return NextResponse.json({ url });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ orgId, error, event: "billing.checkout.failed" });
    return NextResponse.json({ error }, { status: 500 });
  }
}
