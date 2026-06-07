import { publishDueAutoReplies } from "@/lib/auto-reply/executor";
import { logger } from "@/lib/logger";
import { getCronSecret, verifyCronRequest } from "@/lib/secrets";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/auto-reply-publish
 *
 * Every 5 minutes. Promotes drafted auto-reply replies whose durable
 * `scheduled_publish_at` has elapsed into a `published` state by calling the
 * platform's publish API (currently Google; Airbnb/Booking are no-ops since we
 * don't have programmatic publish there). The drain is column-driven: it picks
 * up BOTH executor-staged auto-replies and human-approved-then-scheduled
 * replies uniformly (`status='pending_review' AND scheduled_publish_at<=now()`,
 * excluding safety-blocked drafts). Pre-migration it transparently falls back
 * to the legacy `created_at + delay_minutes` derived window.
 *
 * Why 5 minutes (not 1):
 *   - The 5★ auto-reply window is a randomized 2–4h "reads as human" delay.
 *     Actual post time is the scheduled instant rounded up to the next 5-min
 *     tick — well within tolerance, and 12× fewer wakeups than a 1-min cron.
 *   - Keeps publish concurrency to one host's replies at a time per tick
 *     — predictable, and aligned with our hourly Google API quota.
 *
 * Auth: same dual auth as the other cron routes (Bearer header for
 * Vercel cron, ?key= for ad-hoc manual fires from an authorized box).
 */
export async function GET(req: NextRequest) {
  const headerOk = verifyCronRequest(req.headers.get("authorization"));
  const cronSecret = getCronSecret();
  const queryOk = cronSecret !== null && req.nextUrl.searchParams.get("key") === cronSecret;
  if (!headerOk && !queryOk) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();
  try {
    const summary = await publishDueAutoReplies();
    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - t0,
      ...summary,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ error, event: "cron.auto_reply_publish.failed" });
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
