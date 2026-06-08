import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import {
  fetchPostMetrics,
  isMetricsRefreshEnabled,
  upsertPostMetric,
} from "@/lib/social/metrics";
import { verifyCronRequest } from "@/lib/secrets";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/refresh-social-metrics
 *
 * Daily. For recently-published posts, fetch per-platform engagement and upsert
 * a `SocialPostMetric` snapshot (one per post+platform).
 *
 * Guardrails:
 *  - **Env-gated.** If Meta isn't enabled → 200 `{ skipped:"not_configured" }`
 *    with ZERO adapter/network calls (default unattended path).
 *  - **Dual-auth.** `verifyCronRequest` (fail-closed in prod).
 *  - **Bounded.** `take: 200` published posts in the last 30 days with
 *    `externalIds` present.
 *  - **Per-row try/catch + fail-soft 42P01.**
 *
 * Vercel cron: { "path": "/api/cron/refresh-social-metrics", "schedule": "0 7 * * *" }
 */

const TAKE = 200;
const WINDOW_DAYS = 30;

function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "42P01" || code === "42703";
}

export async function GET(req: NextRequest) {
  if (!verifyCronRequest(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Env gate — no paid calls in the default path.
  if (!isMetricsRefreshEnabled()) {
    return NextResponse.json({ ok: true, skipped: "not_configured" });
  }

  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  let posts: Array<{
    id: string;
    organizationId: string;
    platforms: string[];
    externalIds: unknown;
    establishmentId: string | null;
  }>;
  try {
    // Recently-published posts in the window. We don't filter on externalIds in
    // SQL (Prisma JSON-null filters are fiddly + the dev-stub path stores `{}`);
    // the loop skips posts whose externalIds carry no real platform id, and the
    // adapter no-ops anyway when there's nothing to fetch.
    posts = await prisma.socialPost.findMany({
      where: {
        status: "published",
        postedAt: { gte: since },
      },
      orderBy: { postedAt: "desc" },
      take: TAKE,
      select: {
        id: true,
        organizationId: true,
        platforms: true,
        externalIds: true,
        establishmentId: true,
      },
    });
  } catch (err) {
    if (isMissingRelation(err)) {
      return NextResponse.json({ ok: true, skipped: "not_migrated" });
    }
    logger.error({
      event: "social.metrics_cron.query_failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ ok: false, error: "query_failed" }, { status: 500 });
  }

  let refreshed = 0;
  let failed = 0;

  for (const post of posts) {
    // Skip posts with no real external ids (e.g. dev-stub published rows store
    // `{}` / null) — nothing to fetch metrics for.
    const ext = post.externalIds as Record<string, string> | null;
    if (!ext || Object.keys(ext).length === 0) continue;
    try {
      const { skipped, snapshots } = await fetchPostMetrics(post, post.organizationId);
      if (skipped) continue;
      let wroteAny = false;
      for (const snap of snapshots) {
        const ok = await upsertPostMetric(post.organizationId, post.id, snap);
        wroteAny = wroteAny || ok;
      }
      if (wroteAny) refreshed++;
    } catch (err) {
      failed++;
      logger.warn({
        orgId: post.organizationId,
        postId: post.id,
        event: "social.metrics_cron.row_failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ ok: true, scanned: posts.length, refreshed, failed });
}
