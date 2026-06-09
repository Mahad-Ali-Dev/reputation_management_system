import { type NextRequest, NextResponse } from "next/server";
import { syncAllGmailConnections } from "@/lib/gmail/sync";
import { logger } from "@/lib/logger";
import { getCronSecret, verifyCronRequest } from "@/lib/secrets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/gmail-sync — Vercel Cron entrypoint for Gmail mailbox sync.
 *
 * Polls every active Connection(provider:"gmail") for new inbox mail and ingests
 * each message into the Unified Inbox on the "email" channel.
 *
 * Auth mirrors the other crons: `Authorization: Bearer ${CRON_SECRET}` header
 * (fail-closed in prod — verifyCronRequest throws if CRON_SECRET is missing),
 * with a `?key=` query fallback for local testing.
 *
 * Schedule (vercel.json): every 5 minutes.
 */
export async function GET(req: NextRequest) {
  const headerOk = verifyCronRequest(req.headers.get("authorization"));
  const cronSecret = getCronSecret(); // null only in dev with no secret
  const queryOk = cronSecret !== null && req.nextUrl.searchParams.get("key") === cronSecret;
  if (!headerOk && !queryOk) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();
  try {
    const summary = await syncAllGmailConnections();
    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - t0,
      ...summary,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ error, event: "cron.gmail.failed" });
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
