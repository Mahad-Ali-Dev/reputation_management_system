import { NextResponse } from "next/server";
import { getOrgContext } from "@/lib/auth/org-context";
import { buildStatusResponse } from "@/lib/onboarding/status";
import { logger } from "@/lib/logger";

/**
 * GET /api/onboarding/status
 *
 * Poll target for the `/onboarding` progress page (~1.5s interval). Returns the
 * current/most-recent OnboardingRun for the caller's org as the stable
 * `OnboardingStatusResponse` shape (see lib/onboarding/constants.ts).
 *
 * AUTH — `getOrgContext()` resolves the session + org (redirects to /login when
 * unauthenticated). The org id comes from the VERIFIED session, never the
 * request, so a caller can only ever read their own org's run (RLS belt-and-
 * braces via `withTenant` inside the store).
 *
 * FAIL-SOFT — the run store treats a not-yet-migrated `onboarding_runs` table as
 * "no run" ({ hasRun:false }), so the poller degrades gracefully pre-migration
 * rather than 500ing.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { orgId } = await getOrgContext();
  try {
    const status = await buildStatusResponse(orgId);
    return NextResponse.json(status, {
      headers: { "cache-control": "no-store" },
    });
  } catch (err) {
    logger.error({
      orgId,
      error: err instanceof Error ? err.message : String(err),
      event: "onboarding.status.failed",
    });
    return NextResponse.json({ error: "status_unavailable" }, { status: 500 });
  }
}
