import { type NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { getCronSecret, verifyCronRequest } from "@/lib/secrets";
import { closeStaleLiveSessions, orgsWithLiveChat } from "@/lib/inbox/livechat";
import { isMissingRelation } from "@/lib/inbox/fail-soft";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/livechat-stale-sweep  (Module 09 — Inbox, Wave 3c-B)
 *
 * Every 5 min (vercel.json): closes abandoned website-chat sessions. A `webchat`
 * InboxThread that's still `open` with no activity for > IDLE_MINUTES is marked
 * `resolved` (the visitor left; nothing is pending). No-ops when nothing is idle.
 *
 * Auth: DUAL — `verifyCronRequest` (Authorization bearer) OR `?key=` query secret
 * (mirrors moderation-rescan / contacts-rollup).
 *
 * Fail-soft: a not-yet-migrated relation no-ops; per-org errors are swallowed so
 * one tenant can't fail the whole run.
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
    const orgs = await orgsWithLiveChat();
    let orgsProcessed = 0;
    let orgsFailed = 0;
    let closed = 0;
    for (const orgId of orgs) {
      try {
        closed += await closeStaleLiveSessions({ orgId, idleMinutes: IDLE_MINUTES });
        orgsProcessed++;
      } catch (err) {
        orgsFailed++;
        if (!isMissingRelation(err)) {
          logger.warn({
            event: "cron.livechat_stale_sweep.org_failed",
            orgId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - t0,
      orgsProcessed,
      orgsFailed,
      closed,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ error, event: "cron.livechat_stale_sweep.failed" });
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}

const IDLE_MINUTES = 30;
