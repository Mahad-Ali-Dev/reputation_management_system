/**
 * Contact custom-field operations (module 12, Wave 3b).
 *
 * Dynamic key/value fields per contact, stored in `ContactCustomField`
 * (`@@unique([contactId, key])`). Upsert-by-key + delete-by-key helpers that run
 * inside the caller's tenant transaction. Fail-soft on the not-yet-migrated
 * `contact_custom_fields` table (the helper throws missing-relation only when the
 * caller wants to surface it; here we treat it as a no-op so the profile keeps
 * working pre-migration).
 */

import type { Prisma } from "@prisma/client";
import { isMissingRelation } from "./fail-soft";

/** Normalize a custom-field key: trim, collapse ws, cap length. */
export function normalizeFieldKey(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, 64);
}

/**
 * Upsert one custom field by `(contactId, key)`. Empty value is allowed (a key
 * with a blank value). Returns true when written, false when skipped (no key /
 * table absent). Runs inside the caller's tenant transaction.
 */
export async function upsertCustomFieldTx(
  tx: Prisma.TransactionClient,
  args: { orgId: string; contactId: string; key: string; value: string },
): Promise<boolean> {
  const key = normalizeFieldKey(args.key);
  if (!key) return false;
  const value = (args.value ?? "").slice(0, 2000);

  try {
    const existing = await tx.contactCustomField.findFirst({
      where: { contactId: args.contactId, key, organizationId: args.orgId },
      select: { id: true },
    });
    if (existing) {
      await tx.contactCustomField.update({ where: { id: existing.id }, data: { value } });
    } else {
      await tx.contactCustomField.create({
        data: { organizationId: args.orgId, contactId: args.contactId, key, value },
      });
    }
    return true;
  } catch (err) {
    if (isMissingRelation(err)) return false;
    throw err;
  }
}

/**
 * Replace a contact's entire custom-field set with `fields` (used by the Add
 * Contact dynamic rows + the profile editor "save all"). Deletes keys no longer
 * present. Runs inside the caller's tenant transaction. Fail-soft → no-op when
 * the table is absent.
 */
export async function setCustomFieldsTx(
  tx: Prisma.TransactionClient,
  args: {
    orgId: string;
    contactId: string;
    fields: { key: string; value: string }[];
  },
): Promise<void> {
  // Normalize + dedupe by key (last write wins).
  const byKey = new Map<string, string>();
  for (const f of args.fields) {
    const key = normalizeFieldKey(f.key);
    if (key) byKey.set(key, (f.value ?? "").slice(0, 2000));
  }

  try {
    const existing = await tx.contactCustomField.findMany({
      where: { contactId: args.contactId, organizationId: args.orgId },
      select: { id: true, key: true },
    });
    const haveKeys = new Set(existing.map((r) => r.key));
    const wantKeys = new Set(byKey.keys());

    // Delete removed keys.
    const removeKeys = [...haveKeys].filter((k) => !wantKeys.has(k));
    if (removeKeys.length > 0) {
      await tx.contactCustomField.deleteMany({
        where: { contactId: args.contactId, organizationId: args.orgId, key: { in: removeKeys } },
      });
    }
    // Upsert each desired key.
    for (const [key, value] of byKey) {
      await upsertCustomFieldTx(tx, { orgId: args.orgId, contactId: args.contactId, key, value });
    }
  } catch (err) {
    if (!isMissingRelation(err)) throw err;
  }
}

/**
 * Delete one custom field by `(contactId, key)`. Runs inside the caller's tenant
 * transaction. Fail-soft → no-op when the table is absent.
 */
export async function deleteCustomFieldTx(
  tx: Prisma.TransactionClient,
  args: { orgId: string; contactId: string; key: string },
): Promise<void> {
  const key = normalizeFieldKey(args.key);
  if (!key) return;
  try {
    await tx.contactCustomField.deleteMany({
      where: { contactId: args.contactId, organizationId: args.orgId, key },
    });
  } catch (err) {
    if (!isMissingRelation(err)) throw err;
  }
}
