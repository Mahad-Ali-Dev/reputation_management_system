import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { createCheckoutSession } from "@/lib/billing/actions";
import { logger } from "@/lib/logger";

/**
 * POST /api/billing/checkout
 *
 * For client-side / external callers. Server components / server actions should call
 * `createCheckoutSession()` directly to avoid an unnecessary HTTP round-trip + cookie issues.
 */
export async function POST() {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  const userEmail = session?.user?.email;
  if (!session || !orgId || !userEmail) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
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
