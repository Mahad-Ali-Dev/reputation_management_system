/**
 * ContactActivity writer (module 12, Wave 3b).
 *
 * `ContactActivity` is the ONLY table we write for the timeline — it holds the
 * directory's own events (tag added/removed, note added, imported, merged,
 * manual log) plus the "captured via X" auto-capture markers. Rich events
 * (reviews, surveys, inbox messages, calls) are read LIVE from their home
 * tables by `timeline.ts`, never duplicated here.
 *
 * These are low-level helpers that accept a Prisma transaction client so the
 * caller (a server action) can batch the activity write with the mutation it
 * describes in one tenant transaction. Every write is fail-soft on a
 * not-yet-migrated table.
 */

import type { Prisma } from "@prisma/client";
import { withTenant } from "@/lib/db/with-tenant";
import { isMissingRelation } from "./fail-soft";
import { logger } from "@/lib/logger";

export type ContactActivityKind =
  | "captured"
  | "tag_added"
  | "tag_removed"
  | "note_added"
  | "imported"
  | "merged"
  | "manual";

export interface AppendActivityInput {
  orgId: string;
  contactId: string;
  kind: ContactActivityKind;
  source?: string | null;
  title?: string | null;
  body?: string | null;
  externalRef?: string | null;
  actorUserId?: string | null;
  occurredAt?: Date | null;
}

/**
 * Append a ContactActivity row using an EXISTING tenant transaction. Idempotent
 * on `(contactId, source, externalRef)` when an `externalRef` is provided (the
 * DB has a unique on that triple; we also find-first so it's correct
 * pre-migration). Fail-soft: a missing table / unique race is swallowed.
 */
export async function appendActivityTx(
  tx: Prisma.TransactionClient,
  input: AppendActivityInput,
): Promise<void> {
  try {
    if (input.externalRef) {
      const dup = await tx.contactActivity.findFirst({
        where: {
          contactId: input.contactId,
          source: input.source ?? null,
          externalRef: input.externalRef,
        },
        select: { id: true },
      });
      if (dup) return;
    }
    await tx.contactActivity.create({
      data: {
        organizationId: input.orgId,
        contactId: input.contactId,
        kind: input.kind,
        source: input.source ?? null,
        title: input.title ?? null,
        body: input.body ?? null,
        externalRef: input.externalRef ?? null,
        actorUserId: input.actorUserId ?? null,
        occurredAt: input.occurredAt ?? new Date(),
      },
    });
  } catch (err) {
    if (!isMissingRelation(err) && (err as { code?: string })?.code !== "P2002") {
      logger.warn({
        event: "contacts.activity.append_failed",
        orgId: input.orgId,
        contactId: input.contactId,
        kind: input.kind,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

/**
 * Append a ContactActivity row in its own tenant transaction. Convenience for
 * callers that aren't already inside `withTenant`. Fail-soft; never throws.
 */
export async function appendActivity(input: AppendActivityInput): Promise<void> {
  try {
    await withTenant(input.orgId, (tx) => appendActivityTx(tx, input));
  } catch (err) {
    if (!isMissingRelation(err)) {
      logger.warn({
        event: "contacts.activity.append_failed",
        orgId: input.orgId,
        contactId: input.contactId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
