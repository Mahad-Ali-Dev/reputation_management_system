import { NextResponse, type NextRequest } from "next/server";
import { processTopicSentimentBatch } from "@/lib/ai/topic-sentiment";
import { verifyCronRequest } from "@/lib/secrets";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/extract-topics
 *
 * Suggested schedule: every 30 min. Processes up to 100 reviews per run with
 * Haiku tool-use. At Haiku pricing (~$0.001/review), 100 reviews = ~$0.10 per
 * run, or ~$5/day if we run continuously. The cost cap (100/run) is the throttle.
 *
 * Vercel cron config (add to vercel.json):
 *   { "path": "/api/cron/extract-topics", "schedule": "*\/30 * * * *" }
 */
export async function GET(req: NextRequest) {
  if (!verifyCronRequest(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await processTopicSentimentBatch();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ event: "topic_sentiment.cron.failed", error: msg });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
