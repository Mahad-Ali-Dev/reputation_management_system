/**
 * Contact tag operations (module 12, Wave 3b).
 *
 * `ContactTag` is the SOURCE OF TRUTH; `Contact.tags String[]` is a denormalized
 * display/filter mirror kept in sync on every write (the directory filters on
 * `tags[]` because it is cheap and exists pre-migration). One write path updates
 * both so they never drift.
 *
 * Each tag add/remove also appends a `ContactActivity` marker so the change
 * shows on the contact timeline. Everything is fail-soft on the not-yet-migrated
 * `contact_tags` table: when it's absent we still update the `tags[]` mirror so
 * the feature degrades gracefully (tags work via the array; the normalized table
 * fills in once migrated).
 */

import type { Prisma } from "@prisma/client";
import { appendActivityTx } from "./activity";
import { isMissingRelation } from "./fail-soft";

/** Normalize a tag: trim, collapse whitespace, lowercase, cap length. */
export function normalizeTag(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase().slice(0, 64);
}

/** Clean + dedupe a list of raw tag strings, dropping empties. */
export function normalizeTags(raw: Iterable<string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const t = normalizeTag(r);
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

/** Best-effort write to the normalized contact_tags table (fail-soft). */
async function writeTagRows(
  tx: Prisma.TransactionClient,
  orgId: string,
  contactId: string,
  desired: string[],
): Promise<void> {
  try {
    const existing = await tx.contactTag.findMany({
      where: { contactId, organizationId: orgId },
      select: { tag: true },
    });
    const have = new Set(existing.map((r) => r.tag));
    const want = new Set(desired);

    const toAdd = desired.filter((t) => !have.has(t));
    const toRemove = [...have].filter((t) => !want.has(t));

    if (toAdd.length > 0) {
      await tx.contactTag.createMany({
        data: toAdd.map((tag) => ({ organizationId: orgId, contactId, tag })),
        skipDuplicates: true,
      });
    }
    if (toRemove.length > 0) {
      await tx.contactTag.deleteMany({
        where: { contactId, organizationId: orgId, tag: { in: toRemove } },
      });
    }
  } catch (err) {
    if (!isMissingRelation(err)) throw err;
    // contact_tags not migrated → rely on the tags[] mirror only.
  }
}

/**
 * Replace a contact's full tag set (used by the inline tag editor + bulk tag).
 * Writes the normalized rows, mirrors to `Contact.tags[]`, and appends
 * tag_added/tag_removed activity markers for the delta. Runs inside the caller's
 * tenant transaction.
 *
 * Returns the normalized tag set actually stored.
 */
export async function setContactTagsTx(
  tx: Prisma.TransactionClient,
  args: {
    orgId: string;
    contactId: string;
    tags: string[];
    actorUserId?: string | null;
  },
): Promise<string[]> {
  const desired = normalizeTags(args.tags);

  // Read the current mirror to compute the delta for activity markers.
  let prev: string[] = [];
  try {
    const row = await tx.contact.findFirst({
      where: { id: args.contactId, organizationId: args.orgId },
      select: { tags: true },
    });
    prev = row?.tags ?? [];
  } catch {
    prev = [];
  }
  const prevSet = new Set(prev);
  const nextSet = new Set(desired);
  const added = desired.filter((t) => !prevSet.has(t));
  const removed = prev.filter((t) => !nextSet.has(t));

  await writeTagRows(tx, args.orgId, args.contactId, desired);

  // Mirror to Contact.tags[] (always — works pre-migration).
  await tx.contact.update({
    where: { id: args.contactId },
    data: { tags: desired },
  });

  for (const tag of added) {
    await appendActivityTx(tx, {
      orgId: args.orgId,
      contactId: args.contactId,
      kind: "tag_added",
      title: `Tag added: ${tag}`,
      actorUserId: args.actorUserId ?? null,
    });
  }
  for (const tag of removed) {
    await appendActivityTx(tx, {
      orgId: args.orgId,
      contactId: args.contactId,
      kind: "tag_removed",
      title: `Tag removed: ${tag}`,
      actorUserId: args.actorUserId ?? null,
    });
  }

  return desired;
}

/**
 * Add tags to a set of contacts (bulk), unioning with each contact's existing
 * tags. Mirrors + writes rows + activity per contact. Runs inside the caller's
 * tenant transaction. Returns the number of contacts touched.
 */
export async function bulkAddTagsTx(
  tx: Prisma.TransactionClient,
  args: {
    orgId: string;
    contactIds: string[];
    tags: string[];
    actorUserId?: string | null;
  },
): Promise<number> {
  const add = normalizeTags(args.tags);
  if (add.length === 0 || args.contactIds.length === 0) return 0;

  const rows = await tx.contact.findMany({
    where: { id: { in: args.contactIds }, organizationId: args.orgId },
    select: { id: true, tags: true },
  });

  for (const row of rows) {
    const union = normalizeTags([...row.tags, ...add]);
    await setContactTagsTx(tx, {
      orgId: args.orgId,
      contactId: row.id,
      tags: union,
      actorUserId: args.actorUserId ?? null,
    });
  }
  return rows.length;
}

/**
 * Remove specific tags from a set of contacts (bulk). Runs inside the caller's
 * tenant transaction. Returns the number of contacts touched.
 */
export async function bulkRemoveTagsTx(
  tx: Prisma.TransactionClient,
  args: {
    orgId: string;
    contactIds: string[];
    tags: string[];
    actorUserId?: string | null;
  },
): Promise<number> {
  const remove = new Set(normalizeTags(args.tags));
  if (remove.size === 0 || args.contactIds.length === 0) return 0;

  const rows = await tx.contact.findMany({
    where: { id: { in: args.contactIds }, organizationId: args.orgId },
    select: { id: true, tags: true },
  });

  for (const row of rows) {
    const next = row.tags.filter((t) => !remove.has(normalizeTag(t)));
    await setContactTagsTx(tx, {
      orgId: args.orgId,
      contactId: row.id,
      tags: next,
      actorUserId: args.actorUserId ?? null,
    });
  }
  return rows.length;
}
