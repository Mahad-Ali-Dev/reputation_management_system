/**
 * Scheduler — write-to-queue API (00_foundation.md A7).
 *
 * `schedule(...)` durably persists a "do this at time T" row in the
 * `scheduled_jobs` table. ONE per-minute cron (`/api/cron/dispatch-scheduled`)
 * drains the table by `kind` (see `./dispatch`). This is the durable,
 * cron-drained path that survives process restarts and is cancelable — distinct
 * from QStash (`lib/jobs/queue.ts`, fan-out/one-shot deferred work) and from the
 * existing derived-window auto-reply publish path (left unchanged).
 *
 * Guarantees:
 *   - All writes/reads go through `withTenant(orgId, …)` so RLS applies.
 *   - Idempotent on `dedupeKey`: re-`schedule(...)` with the same
 *     `(orgId, kind, dedupeKey)` returns the existing row instead of inserting a
 *     duplicate (backed by `@@unique([organizationId, kind, dedupeKey])`). A
 *     `dedupeKey` is REQUIRED for idempotency — NULL keys are always distinct
 *     (Postgres NULL semantics), matching the schema.
 *   - Fail-soft pre-migration: `scheduled_jobs` does not exist in the live DB
 *     until the founder runs the master-delta migration, so every access treats
 *     Postgres `42P01 undefined_table` / `42703 undefined_column` as
 *     "not configured" — `schedule` rethrows a typed soft error the caller can
 *     branch on, while `listScheduled`/`cancelScheduled` degrade to empty/false.
 */

import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { Prisma } from "@prisma/client";
import type { ScheduledKind } from "./handlers";

export type { ScheduledKind } from "./handlers";

/**
 * The shape `listScheduled` returns — a tenant-scoped projection of a
 * `scheduled_jobs` row (no joins). Kept explicit so callers don't depend on the
 * full generated model and so the fail-soft empty case is well-typed.
 */
export type ScheduledJobRow = {
  id: string;
  kind: ScheduledKind;
  status: string;
  runAt: Date;
  payload: Prisma.JsonValue;
  dedupeKey: string | null;
  attempts: number;
  maxAttempts: number;
  lockedAt: Date | null;
  ranAt: Date | null;
  lastError: string | null;
  createdAt: Date;
};

/**
 * Thrown when the `scheduled_jobs` table/column is absent (pre-migration). Lets a
 * caller (e.g. a composer "schedule for later") show "scheduling not available
 * yet" instead of a 500. `schedule()` is the one API that surfaces this rather
 * than silently succeeding, because losing a scheduled write would be invisible.
 */
export class SchedulerUnavailableError extends Error {
  readonly code = "scheduler_unavailable";
  constructor(message = "scheduled_jobs table not available (pre-migration)") {
    super(message);
    this.name = "SchedulerUnavailableError";
  }
}

const PG_UNDEFINED_TABLE = "42P01";
const PG_UNDEFINED_COLUMN = "42703";

/** True for the "table/column not migrated yet" Postgres error codes. */
function isMissingRelation(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P2010 = raw query failed; the underlying pg code is on `meta.code`.
    const metaCode = (err.meta as { code?: string } | undefined)?.code;
    if (metaCode === PG_UNDEFINED_TABLE || metaCode === PG_UNDEFINED_COLUMN) return true;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes(PG_UNDEFINED_TABLE) || msg.includes(PG_UNDEFINED_COLUMN);
}

export async function schedule(args: {
  orgId: string;
  kind: ScheduledKind;
  runAt: Date;
  payload: Record<string, unknown>;
  /** Optional uniqueness within (org, kind). Required for idempotency. */
  dedupeKey?: string;
}): Promise<{ id: string }> {
  const { orgId, kind, runAt, payload, dedupeKey } = args;
  try {
    return await withTenant(orgId, async (tx) => {
      // Idempotency: only meaningful when a dedupeKey is supplied (NULL keys are
      // always distinct under the unique index). If a row already exists for
      // (org, kind, dedupeKey), return it untouched — never reschedule/clobber.
      if (dedupeKey) {
        const existing = await tx.scheduledJob.findUnique({
          where: {
            organizationId_kind_dedupeKey: {
              organizationId: orgId,
              kind,
              dedupeKey,
            },
          },
          select: { id: true },
        });
        if (existing) {
          return { id: existing.id };
        }
      }

      try {
        const created = await tx.scheduledJob.create({
          data: {
            organizationId: orgId,
            kind,
            status: "pending",
            runAt,
            payload: payload as Prisma.InputJsonValue,
            dedupeKey: dedupeKey ?? null,
          },
          select: { id: true },
        });
        return { id: created.id };
      } catch (err) {
        // Race: a concurrent caller inserted the same dedupeKey between our
        // find and create. Resolve to the now-existing row (idempotent).
        if (
          dedupeKey &&
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          const existing = await tx.scheduledJob.findUnique({
            where: {
              organizationId_kind_dedupeKey: {
                organizationId: orgId,
                kind,
                dedupeKey,
              },
            },
            select: { id: true },
          });
          if (existing) return { id: existing.id };
        }
        throw err;
      }
    });
  } catch (err) {
    if (isMissingRelation(err)) {
      logger.warn(
        { orgId, kind, event: "scheduler.schedule.unavailable" },
        "scheduled_jobs not migrated — schedule() no-op",
      );
      throw new SchedulerUnavailableError();
    }
    throw err;
  }
}

/**
 * Cancel a pending job. Flips `pending` → `canceled` (the dispatcher's claim is
 * conditional on `status:"pending"`, so a canceled row is never run). Returns
 * true iff a pending row was actually transitioned (so a double-cancel or a
 * already-running/done row returns false). Fail-soft → false pre-migration.
 */
export async function cancelScheduled(orgId: string, id: string): Promise<boolean> {
  try {
    return await withTenant(orgId, async (tx) => {
      const res = await tx.scheduledJob.updateMany({
        where: { id, status: "pending" },
        data: { status: "canceled" },
      });
      return res.count > 0;
    });
  } catch (err) {
    if (isMissingRelation(err)) {
      logger.warn(
        { orgId, id, event: "scheduler.cancel.unavailable" },
        "scheduled_jobs not migrated — cancelScheduled() no-op",
      );
      return false;
    }
    throw err;
  }
}

/**
 * List a tenant's scheduled jobs (newest `runAt` first), optionally filtered by
 * kind. Fail-soft → [] pre-migration. Capped to a sane page so a runaway queue
 * can't OOM a list view.
 */
export async function listScheduled(
  orgId: string,
  kind?: ScheduledKind,
): Promise<ScheduledJobRow[]> {
  try {
    return await withTenant(orgId, async (tx) => {
      const rows = await tx.scheduledJob.findMany({
        where: kind ? { kind } : undefined,
        orderBy: { runAt: "desc" },
        take: 200,
        select: {
          id: true,
          kind: true,
          status: true,
          runAt: true,
          payload: true,
          dedupeKey: true,
          attempts: true,
          maxAttempts: true,
          lockedAt: true,
          ranAt: true,
          lastError: true,
          createdAt: true,
        },
      });
      return rows as ScheduledJobRow[];
    });
  } catch (err) {
    if (isMissingRelation(err)) {
      logger.warn(
        { orgId, kind, event: "scheduler.list.unavailable" },
        "scheduled_jobs not migrated — listScheduled() → []",
      );
      return [];
    }
    throw err;
  }
}
