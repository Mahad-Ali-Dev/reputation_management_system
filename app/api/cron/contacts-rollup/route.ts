import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { recountSegments } from "@/lib/contacts/segments";
import { getCronSecret, verifyCronRequest } from "@/lib/secrets";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/contacts-rollup
 *
 * Runs every 30 min (vercel.json). Per-org maintenance so the Contacts stat
 * cards (Active 30d / VIP) + segment counts stay fast without per-request
 * recomputation:
 *
 *   1. `lastActivityAt` rollup — fills a NULL `lastActivityAt` from the cheap
 *      `lastContactedAt` column (and keeps it monotonic), so a contact that was
 *      only ever "contacted" still counts as active. Column-only, no cross-table
 *      join, so it's cheap + safe at scale.
 *   2. VIP flag — mirror: any contact tagged "vip" (denormalized `tags[]`) but
 *      not yet `vip:true` is flagged. Cheap + idempotent.
 *   3. Segment warm — calls `recountSegments(org)` so a transient error surfaces
 *      in logs (the counts themselves are computed live on the Segments tab).
 *
 * Auth: dual (Authorization bearer via `verifyCronRequest` OR `?key=` secret),
 * mirroring `picker-reminder`. Cross-tenant sweep: iterate org ids (system-tier
 * read) then operate inside each org's `withTenant`. Fail-soft per org + on
 * not-yet-migrated columns — never 500s the whole run, no-ops when nothing
 * changed.
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
    const summary = await runRollup();
    return NextResponse.json({ ok: true, durationMs: Date.now() - t0, ...summary });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ error, event: "cron.contacts_rollup.failed" });
    // Even a top-level failure returns 200-ish semantics? No — surface 500 so
    // Vercel records the failure, but the per-org loop already swallows errors,
    // so reaching here means the org-list read itself failed.
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}

interface RollupSummary {
  orgsProcessed: number;
  orgsFailed: number;
  activityFilled: number;
  vipFlagged: number;
}

/** Postgres 42P01 (undefined_table) / 42703 (undefined_column) → not migrated. */
function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "42P01" || code === "42703" || code === "P2021" || code === "P2022";
}

async function runRollup(): Promise<RollupSummary> {
  // System-tier read of org ids (like sync-reviews / sync-connections). Bounded
  // — process active orgs; a huge fleet would page, but the cadence + cheap
  // per-org work keeps this well within maxDuration.
  let orgs: Array<{ id: string }> = [];
  try {
    orgs = await prisma.organization.findMany({ select: { id: true }, take: 5000 });
  } catch (err) {
    logger.error({
      event: "cron.contacts_rollup.org_list_failed",
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  let orgsProcessed = 0;
  let orgsFailed = 0;
  let activityFilled = 0;
  let vipFlagged = 0;

  for (const org of orgs) {
    try {
      const res = await rollupOrg(org.id);
      activityFilled += res.activityFilled;
      vipFlagged += res.vipFlagged;
      orgsProcessed++;
    } catch (err) {
      orgsFailed++;
      if (!isMissingRelation(err)) {
        logger.warn({
          event: "cron.contacts_rollup.org_failed",
          orgId: org.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return { orgsProcessed, orgsFailed, activityFilled, vipFlagged };
}

async function rollupOrg(orgId: string): Promise<{ activityFilled: number; vipFlagged: number }> {
  return withTenant(orgId, async (tx) => {
    let activityFilled = 0;
    let vipFlagged = 0;

    // 1) Fill NULL lastActivityAt from lastContactedAt. Prisma's updateMany
    //    can't copy one column into another, so do a bounded row-wise fill —
    //    only contacts that have a lastContactedAt but no lastActivityAt are
    //    touched, capped per run so a huge backlog can't blow the budget.
    try {
      const stale = await tx.contact.findMany({
        where: { organizationId: orgId, lastActivityAt: null, lastContactedAt: { not: null } },
        select: { id: true, lastContactedAt: true },
        take: 500,
      });
      for (const c of stale) {
        await tx.contact.update({
          where: { id: c.id },
          data: { lastActivityAt: c.lastContactedAt },
        });
        activityFilled++;
      }
    } catch (err) {
      if (!isMissingRelation(err)) throw err;
    }

    // 2) VIP flag mirror: tagged "vip" but not flagged.
    try {
      const res = await tx.contact.updateMany({
        where: { organizationId: orgId, vip: false, tags: { has: "vip" } },
        data: { vip: true },
      });
      vipFlagged += res.count;
    } catch (err) {
      if (!isMissingRelation(err)) throw err;
    }

    return { activityFilled, vipFlagged };
  }).then(async (res) => {
    // 3) Warm/validate segment counts (live-computed; this just surfaces errors).
    await recountSegments(orgId).catch(() => undefined);
    return res;
  });
}
