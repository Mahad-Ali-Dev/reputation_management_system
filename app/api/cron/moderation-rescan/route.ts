import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { getCronSecret, verifyCronRequest } from "@/lib/secrets";
import { evaluateInbound } from "@/lib/moderation/queue";
import { getModerationConfig, isMissingRelation, loadKeywordRules } from "@/lib/moderation/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/moderation-rescan  (Module 09 — Inbox, Wave 3c-A)
 *
 * Catch-up sweep (every 15 min, vercel.json). Finds recently-posted FB/IG
 * `SocialComment` rows that DON'T yet have a `ModerationItem` — content that
 * arrived before a moderation rule existed, or while the classifier was down —
 * and runs `evaluateInbound` on each, per org via `withTenant`.
 *
 * Auth: DUAL — `verifyCronRequest` (Authorization bearer) OR `?key=` query
 * secret (mirrors picker-reminder / contacts-rollup).
 *
 * Fail-soft everywhere:
 *   - moderation_items not migrated (42P01) → the per-org pass no-ops.
 *   - per-org errors are swallowed so one tenant can't fail the whole run.
 *   - no-ops cleanly when there's nothing pending.
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
    const summary = await runRescan();
    return NextResponse.json({ ok: true, durationMs: Date.now() - t0, ...summary });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ error, event: "cron.moderation_rescan.failed" });
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}

interface RescanSummary {
  orgsProcessed: number;
  orgsFailed: number;
  evaluated: number;
  enqueued: number;
}

/** Look back this far for un-moderated comments (matches the 15-min cadence + slack). */
const LOOKBACK_MS = 60 * 60 * 1000; // 1 hour
const PER_ORG_LIMIT = 200;

async function runRescan(): Promise<RescanSummary> {
  let orgs: Array<{ id: string }> = [];
  try {
    orgs = await prisma.organization.findMany({ select: { id: true }, take: 5000 });
  } catch (err) {
    logger.error({
      event: "cron.moderation_rescan.org_list_failed",
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  let orgsProcessed = 0;
  let orgsFailed = 0;
  let evaluated = 0;
  let enqueued = 0;

  const since = new Date(Date.now() - LOOKBACK_MS);

  for (const org of orgs) {
    try {
      const res = await rescanOrg(org.id, since);
      evaluated += res.evaluated;
      enqueued += res.enqueued;
      orgsProcessed++;
    } catch (err) {
      orgsFailed++;
      if (!isMissingRelation(err)) {
        logger.warn({
          event: "cron.moderation_rescan.org_failed",
          orgId: org.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return { orgsProcessed, orgsFailed, evaluated, enqueued };
}

async function rescanOrg(
  orgId: string,
  since: Date,
): Promise<{ evaluated: number; enqueued: number }> {
  // Pull recent FB/IG comments that are still actionable (not already hidden)
  // and the ids that already have a queue item, then diff.
  const { comments, moderatedIds } = await withTenant(orgId, async (tx) => {
    const comments = await tx.socialComment.findMany({
      where: {
        platform: { in: ["facebook", "instagram"] },
        postedAt: { gte: since },
        status: { in: ["needs_reply", "live"] },
      },
      orderBy: { postedAt: "desc" },
      take: PER_ORG_LIMIT,
      select: {
        id: true,
        platform: true,
        externalId: true,
        authorName: true,
        body: true,
      },
    });

    if (comments.length === 0) return { comments, moderatedIds: new Set<string>() };

    // Which of these already have a ModerationItem? Fail-soft when not migrated.
    let moderatedIds = new Set<string>();
    try {
      const existing = await tx.moderationItem.findMany({
        where: { sourceId: { in: comments.map((c) => c.id) } },
        select: { sourceId: true },
      });
      moderatedIds = new Set(existing.map((e) => e.sourceId));
    } catch (err) {
      if (!isMissingRelation(err)) throw err;
      // Not migrated → treat all as un-moderated (the enqueue below will no-op).
    }
    return { comments, moderatedIds };
  });

  const pending = comments.filter((c) => !moderatedIds.has(c.id));
  if (pending.length === 0) return { evaluated: 0, enqueued: 0 };

  // Load config + blacklist ONCE per org and thread into each evaluate call.
  const config = await getModerationConfig(orgId);
  const blacklist = await loadKeywordRules(orgId);

  let evaluated = 0;
  let enqueued = 0;
  for (const c of pending) {
    const source = c.platform === "facebook" ? "facebook" : "instagram";
    const res = await evaluateInbound(
      {
        orgId,
        source,
        sourceType: "comment",
        sourceId: c.id,
        externalId: c.externalId,
        authorName: c.authorName,
        body: c.body,
      },
      { config, blacklist },
    );
    evaluated++;
    if (res.outcome === "enqueued") enqueued++;
  }

  return { evaluated, enqueued };
}
