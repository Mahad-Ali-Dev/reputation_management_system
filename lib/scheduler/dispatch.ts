/**
 * Scheduler dispatcher — the per-minute drain (00_foundation.md A7).
 *
 * Called once per minute by `/api/cron/dispatch-scheduled`. Mirrors the
 * race-safe conditional-claim pattern proven in `dispatch-outbound`:
 *
 *   Stage 1 (unscoped `prisma`): select `pending` rows with `runAt <= now()`
 *     across tenants, oldest first, `take` ≤ limit. This is a sanctioned
 *     cross-tenant *candidate select* — every actual mutation below re-enters
 *     `withTenant(orgId)`.
 *   Per row: race-safe claim via `updateMany({where:{id, status:"pending"}, …})`
 *     inside `withTenant`. If `count === 0`, another tick already claimed it —
 *     skip silently (never double-run; matters for double-send safety).
 *   Run `HANDLERS[kind]`. On success → `done` + `ranAt`. On soft-fail/throw →
 *     back to `pending` if `attempts < maxAttempts`, else `failed`, recording
 *     `lastError`. All status writes are `withTenant`.
 *
 * Fail-soft: if `scheduled_jobs` isn't migrated yet the stage-1 select 42P01s;
 * we log and return zeros rather than 500 the cron.
 */

import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { Prisma } from "@prisma/client";
import { HANDLERS, type ScheduledKind } from "./handlers";

const DEFAULT_LIMIT = 200;

const PG_UNDEFINED_TABLE = "42P01";
const PG_UNDEFINED_COLUMN = "42703";

function isMissingRelation(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const metaCode = (err.meta as { code?: string } | undefined)?.code;
    if (metaCode === PG_UNDEFINED_TABLE || metaCode === PG_UNDEFINED_COLUMN) return true;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes(PG_UNDEFINED_TABLE) || msg.includes(PG_UNDEFINED_COLUMN);
}

const KNOWN_KINDS: ReadonlySet<string> = new Set<ScheduledKind>([
  "scheduled_post",
  "scheduled_request",
  "scheduled_reply",
]);

export type DrainSummary = {
  claimed: number;
  succeeded: number;
  failed: number;
};

export async function drainDueScheduledJobs(opts?: {
  limit?: number;
}): Promise<DrainSummary> {
  const limit = Math.max(1, Math.min(opts?.limit ?? DEFAULT_LIMIT, 1000));
  const now = new Date();

  // ---- Stage 1: cross-tenant candidate select (unscoped, read-only) ----
  let candidates: Array<{
    id: string;
    organizationId: string;
    kind: string;
    payload: Prisma.JsonValue;
    attempts: number;
    maxAttempts: number;
  }>;
  try {
    candidates = await prisma.scheduledJob.findMany({
      where: { status: "pending", runAt: { lte: now } },
      orderBy: { runAt: "asc" },
      take: limit,
      select: {
        id: true,
        organizationId: true,
        kind: true,
        payload: true,
        attempts: true,
        maxAttempts: true,
      },
    });
  } catch (err) {
    if (isMissingRelation(err)) {
      logger.warn(
        { event: "scheduler.dispatch.unavailable" },
        "scheduled_jobs not migrated — dispatcher no-op",
      );
      return { claimed: 0, succeeded: 0, failed: 0 };
    }
    throw err;
  }

  let claimed = 0;
  let succeeded = 0;
  let failed = 0;

  for (const job of candidates) {
    const { id, organizationId: orgId, kind } = job;

    // Guard against an unknown kind that somehow landed in the table (e.g. a
    // future kind written by a newer deploy). Mark it failed so it doesn't churn
    // the candidate window every tick.
    if (!KNOWN_KINDS.has(kind)) {
      try {
        await withTenant(orgId, async (tx) => {
          await tx.scheduledJob.updateMany({
            where: { id, status: "pending" },
            data: { status: "failed", lastError: `unknown kind: ${kind}` },
          });
        });
      } catch (err) {
        logger.error(
          {
            orgId,
            jobId: id,
            kind,
            error: err instanceof Error ? err.message : String(err),
            event: "scheduler.dispatch.unknown_kind_mark_failed_error",
          },
          "failed to mark unknown-kind job as failed",
        );
      }
      logger.warn(
        { orgId, jobId: id, kind, event: "scheduler.dispatch.unknown_kind" },
        "scheduled job has unknown kind — marked failed",
      );
      continue;
    }

    // ---- Race-safe claim: only ONE tick can transition pending → running ----
    let won = false;
    try {
      won = await withTenant(orgId, async (tx) => {
        const res = await tx.scheduledJob.updateMany({
          where: { id, status: "pending" },
          data: {
            status: "running",
            attempts: { increment: 1 },
            lockedAt: new Date(),
          },
        });
        return res.count > 0;
      });
    } catch (err) {
      logger.error(
        {
          orgId,
          jobId: id,
          kind,
          error: err instanceof Error ? err.message : String(err),
          event: "scheduler.dispatch.claim_error",
        },
        "error claiming scheduled job",
      );
      continue;
    }

    if (!won) {
      // Another concurrent tick claimed it first (or it was canceled). Skip.
      logger.debug(
        { orgId, jobId: id, kind, event: "scheduler.dispatch.claim_lost" },
        "scheduled job already claimed — skipping",
      );
      continue;
    }
    claimed += 1;

    // After our claim, this job's attempts is `job.attempts + 1`.
    const attemptsAfterClaim = job.attempts + 1;
    const maxAttempts = job.maxAttempts;

    // ---- Run the per-kind handler ----
    let ok = false;
    let detail: string | undefined;
    try {
      const handler = HANDLERS[kind as ScheduledKind];
      const result = await handler({
        id,
        orgId,
        kind: kind as ScheduledKind,
        payload: (job.payload ?? {}) as Record<string, unknown>,
      });
      ok = result.ok;
      detail = result.detail;
    } catch (err) {
      ok = false;
      detail = err instanceof Error ? err.message : String(err);
      logger.error(
        {
          orgId,
          jobId: id,
          kind,
          error: detail,
          event: "scheduler.dispatch.handler_threw",
        },
        "scheduled job handler threw",
      );
    }

    // ---- Record outcome (tenant-scoped) ----
    try {
      if (ok) {
        await withTenant(orgId, async (tx) => {
          await tx.scheduledJob.update({
            where: { id },
            data: { status: "done", ranAt: new Date(), lastError: null },
          });
        });
        succeeded += 1;
        logger.info(
          { orgId, jobId: id, kind, detail, event: "scheduler.dispatch.done" },
          "scheduled job completed",
        );
      } else {
        const exhausted = attemptsAfterClaim >= maxAttempts;
        await withTenant(orgId, async (tx) => {
          await tx.scheduledJob.update({
            where: { id },
            data: {
              // Retry: drop back to pending so a later tick re-claims it. Give
              // up after maxAttempts → failed (terminal).
              status: exhausted ? "failed" : "pending",
              lastError: detail ?? "handler returned ok:false",
            },
          });
        });
        failed += 1;
        logger.warn(
          {
            orgId,
            jobId: id,
            kind,
            attempts: attemptsAfterClaim,
            maxAttempts,
            exhausted,
            detail,
            event: exhausted
              ? "scheduler.dispatch.failed"
              : "scheduler.dispatch.retry",
          },
          exhausted
            ? "scheduled job failed permanently"
            : "scheduled job failed — will retry",
        );
      }
    } catch (err) {
      // We claimed (status=running) but couldn't record the outcome. Leave it
      // running; the lockedAt timestamp lets a future sweep reclaim stale rows.
      // Counted as failed for this tick's summary.
      failed += 1;
      logger.error(
        {
          orgId,
          jobId: id,
          kind,
          error: err instanceof Error ? err.message : String(err),
          event: "scheduler.dispatch.outcome_write_error",
        },
        "failed to record scheduled-job outcome; left running for reclaim",
      );
    }
  }

  logger.info(
    {
      candidates: candidates.length,
      claimed,
      succeeded,
      failed,
      event: "scheduler.dispatch.batch",
    },
    "scheduled-job dispatch batch complete",
  );

  return { claimed, succeeded, failed };
}
