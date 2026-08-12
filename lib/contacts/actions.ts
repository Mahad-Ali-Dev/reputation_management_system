"use server";

import { resolveSessionOrg } from "@/lib/auth/active-org";
import { requireRole, roleAtLeast } from "@/lib/auth/rbac";
import { assertEntitled } from "@/lib/billing/entitlements";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { parseRecipientsCsv } from "@/lib/outreach/bulk";
import { createReviewRequest } from "@/lib/outreach/actions";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { appendActivityTx } from "./activity";
import { setCustomFieldsTx, upsertCustomFieldTx, deleteCustomFieldTx } from "./custom-fields";
import { buildContactsExport, toDataUrl, type ContactExportFormat } from "./export";
import { isMissingRelation } from "./fail-soft";
import {
  applyMapping,
  assertImportableHeader,
  dedupeAgainstExisting,
  parseImportCsv,
  type ColumnMapping,
} from "./import";
import { listContactsForExport } from "./queries";
import { syncShopifyCustomers } from "./shopify";
import { normalizeSourceInput } from "./source-meta";
import { bulkAddTagsTx, bulkRemoveTagsTx, normalizeTags, setContactTagsTx } from "./tags";

const PHONE_RE = /^\+[1-9][0-9]{1,14}$/;

const ContactSchema = z.object({
  name: z.string().max(120).optional(),
  email: z.string().email().max(200).optional().or(z.literal("")),
  phone: z.string().max(40).optional(),
  tags: z.string().max(500).optional(), // comma-separated
  source: z.string().max(40).default("manual"),
});

async function requireOrg() {
  const sessionOrg = await resolveSessionOrg();
  if (!sessionOrg) redirect("/login");
  return { orgId: sessionOrg.orgId, userId: sessionOrg.userId };
}

/** Authenticated session + role (no redirect on insufficient role — returns flag). */
async function requireOrgWithRole() {
  const sessionOrg = await resolveSessionOrg();
  if (!sessionOrg) redirect("/login");
  return { orgId: sessionOrg.orgId, userId: sessionOrg.userId, role: sessionOrg.role };
}

/** Validate an E.164 phone, allowing blank. Throws on a present-but-bad value. */
function validatePhoneOrThrow(phone: string | undefined | null): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[\s\-().]/g, "");
  if (!PHONE_RE.test(cleaned)) {
    throw new Error("Phone must be international E.164 format, e.g. +15551234567");
  }
  return cleaned;
}

export async function addContact(form: FormData): Promise<void> {
  const { orgId, userId } = await requireOrg();
  const parsed = ContactSchema.safeParse({
    name: (form.get("name") as string) || undefined,
    email: (form.get("email") as string) || undefined,
    phone: (form.get("phone") as string) || undefined,
    tags: (form.get("tags") as string) || undefined,
    source: (form.get("source") as string) || "manual",
  });
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  const { name, email, phone, tags } = parsed.data;
  const source = normalizeSourceInput(parsed.data.source);

  // Optional enriched fields (back-compat: absent → null).
  const firstName = (form.get("firstName") as string)?.trim() || null;
  const lastName = (form.get("lastName") as string)?.trim() || null;
  const companyName = (form.get("companyName") as string)?.trim() || null;
  const notes = (form.get("notes") as string)?.trim() || null;
  const consentStatus = (form.get("consentStatus") as string)?.trim() || null;
  const vip = form.get("vip") === "on" || form.get("vip") === "true";
  const normalizedEmail = email ? email.trim().toLowerCase() : null;
  const normalizedPhone = validatePhoneOrThrow(phone);

  if (!normalizedEmail && !normalizedPhone) {
    throw new Error("Provide at least an email or phone number");
  }

  // Dynamic custom fields: any number of customKey[]/customValue[] pairs.
  const customKeys = form.getAll("customKey").map((v) => String(v));
  const customValues = form.getAll("customValue").map((v) => String(v));
  const customFields = customKeys
    .map((key, i) => ({ key, value: customValues[i] ?? "" }))
    .filter((f) => f.key.trim().length > 0);

  const tagList = tags ? normalizeTags(tags.split(",")) : [];

  await withTenant(orgId, async (tx) => {
    const created = await tx.contact.create({
      data: {
        organizationId: orgId,
        source,
        name: name ?? (firstName || lastName ? [firstName, lastName].filter(Boolean).join(" ") : null),
        firstName,
        lastName,
        companyName,
        notes,
        vip,
        consentStatus,
        email: normalizedEmail,
        phone: normalizedPhone,
        tags: tagList,
        lastActivityAt: new Date(),
      },
      select: { id: true },
    });

    // Mirror normalized tag rows + write custom fields + a "manual" activity.
    // Each is fail-soft (pre-migration tables) so the create still succeeds.
    if (tagList.length > 0) {
      try {
        await setContactTagsTx(tx, { orgId, contactId: created.id, tags: tagList, actorUserId: userId });
      } catch (err) {
        if (!isMissingRelation(err)) throw err;
      }
    }
    if (customFields.length > 0) {
      await setCustomFieldsTx(tx, { orgId, contactId: created.id, fields: customFields });
    }
    await appendActivityTx(tx, {
      orgId,
      contactId: created.id,
      kind: "manual",
      title: "Contact created",
      actorUserId: userId,
    });
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "contact.created",
        resourceType: "contact",
        resourceId: created.id,
        afterData: { source, hasEmail: !!normalizedEmail, hasPhone: !!normalizedPhone },
      },
    });
  });

  revalidatePath("/contacts");
}

export async function importContactsCsv(form: FormData): Promise<void> {
  const { orgId } = await requireOrg();
  const csvText = z.string().min(1).max(2_000_000).parse(form.get("csvText"));
  const channel = z.enum(["email", "sms"]).parse(form.get("channel"));

  const { rows } = parseRecipientsCsv({ csvText, channel });
  if (rows.length === 0) throw new Error("No valid recipients in CSV");

  await withTenant(orgId, async (tx) => {
    // Bulk insert instead of one INSERT per row.
    await tx.contact.createMany({
      data: rows.map((r) => ({
        organizationId: orgId,
        source: "csv",
        name: r.recipientName,
        email: channel === "email" ? r.recipient : null,
        phone: channel === "sms" ? r.recipient : null,
        tags: [],
      })),
      skipDuplicates: true,
    });
  });

  revalidatePath("/contacts");
}

export async function deleteContact(form: FormData): Promise<void> {
  const { orgId, userId } = await requireRole("admin");
  const id = z.string().uuid().parse(form.get("id"));
  await withTenant(orgId, async (tx) => {
    const before = await tx.contact.findFirst({
      where: { id },
      select: { name: true, email: true, phone: true },
    });
    if (!before) return;
    await tx.contact.delete({ where: { id } });
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "contact.deleted",
        resourceType: "contact",
        resourceId: id,
        beforeData: before,
      },
    });
  });
  revalidatePath("/contacts");
}

// ===========================================================================
// Wave 3b — CRM mutations (edit / tags / notes / custom fields / bulk / merge /
// import-mapped / export / bulk send). All withTenant + audited + fail-soft on
// not-yet-migrated tables/columns.
// ===========================================================================

const UpdateContactSchema = z.object({
  id: z.string().uuid(),
  name: z.string().max(120).optional(),
  firstName: z.string().max(120).optional(),
  lastName: z.string().max(120).optional(),
  companyName: z.string().max(160).optional(),
  email: z.string().max(200).optional(),
  phone: z.string().max(40).optional(),
  consentStatus: z.enum(["unknown", "opted_in", "opted_out"]).optional(),
  vip: z.boolean().optional(),
});

/** Edit a contact's core details (profile Details form). Manager+ write. */
export async function updateContact(form: FormData): Promise<void> {
  const { orgId, userId, role } = await requireOrgWithRole();
  if (!roleAtLeast(role, "manager")) throw new Error("forbidden: requires manager role");

  const parsed = UpdateContactSchema.safeParse({
    id: form.get("id"),
    name: (form.get("name") as string) ?? undefined,
    firstName: (form.get("firstName") as string) ?? undefined,
    lastName: (form.get("lastName") as string) ?? undefined,
    companyName: (form.get("companyName") as string) ?? undefined,
    email: (form.get("email") as string) ?? undefined,
    phone: (form.get("phone") as string) ?? undefined,
    consentStatus: (form.get("consentStatus") as string) || undefined,
    vip: form.get("vip") == null ? undefined : form.get("vip") === "on" || form.get("vip") === "true",
  });
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  const d = parsed.data;

  const email = d.email != null ? (d.email.trim().toLowerCase() || null) : undefined;
  if (email) {
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!ok) throw new Error("Invalid email address");
  }
  const phone = d.phone != null ? validatePhoneOrThrow(d.phone) : undefined;

  await withTenant(orgId, async (tx) => {
    const before = await tx.contact.findFirst({
      where: { id: d.id, organizationId: orgId },
      select: { id: true },
    });
    if (!before) throw new Error("contact_not_found");

    await tx.contact.update({
      where: { id: d.id },
      data: {
        name: d.name?.trim() || undefined,
        firstName: d.firstName != null ? d.firstName.trim() || null : undefined,
        lastName: d.lastName != null ? d.lastName.trim() || null : undefined,
        companyName: d.companyName != null ? d.companyName.trim() || null : undefined,
        email,
        phone,
        consentStatus: d.consentStatus ?? undefined,
        vip: d.vip ?? undefined,
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "contact.updated",
        resourceType: "contact",
        resourceId: d.id,
      },
    });
  });

  revalidatePath("/contacts");
  revalidatePath(`/contacts/${d.id}`);
}

/** Replace a contact's tag set (inline tag editor). Manager+ write. */
export async function updateContactTags(form: FormData): Promise<void> {
  const { orgId, userId, role } = await requireOrgWithRole();
  if (!roleAtLeast(role, "manager")) throw new Error("forbidden: requires manager role");
  const id = z.string().uuid().parse(form.get("id"));
  // Accept either a comma-separated `tags` string or repeated `tag` entries.
  const raw = (form.get("tags") as string | null);
  const list = raw != null ? raw.split(",") : form.getAll("tag").map((v) => String(v));

  await withTenant(orgId, async (tx) => {
    await setContactTagsTx(tx, { orgId, contactId: id, tags: list, actorUserId: userId });
  });
  revalidatePath("/contacts");
  revalidatePath(`/contacts/${id}`);
}

/** Save a contact's notes (profile Notes editor). Manager+ write. */
export async function updateContactNotes(form: FormData): Promise<void> {
  const { orgId, userId, role } = await requireOrgWithRole();
  if (!roleAtLeast(role, "manager")) throw new Error("forbidden: requires manager role");
  const id = z.string().uuid().parse(form.get("id"));
  const notes = ((form.get("notes") as string) ?? "").slice(0, 8000);

  await withTenant(orgId, async (tx) => {
    const exists = await tx.contact.findFirst({ where: { id, organizationId: orgId }, select: { id: true } });
    if (!exists) throw new Error("contact_not_found");
    await tx.contact.update({ where: { id }, data: { notes: notes || null } });
    await appendActivityTx(tx, {
      orgId,
      contactId: id,
      kind: "note_added",
      title: "Notes updated",
      actorUserId: userId,
    });
  });
  revalidatePath(`/contacts/${id}`);
}

/** Upsert one dynamic custom field on a contact. Manager+ write. */
export async function upsertContactCustomField(form: FormData): Promise<void> {
  const { orgId, role } = await requireOrgWithRole();
  if (!roleAtLeast(role, "manager")) throw new Error("forbidden: requires manager role");
  const id = z.string().uuid().parse(form.get("contactId"));
  const key = z.string().min(1).max(64).parse(form.get("key"));
  const value = z.string().max(2000).parse(form.get("value") ?? "");

  await withTenant(orgId, async (tx) => {
    await upsertCustomFieldTx(tx, { orgId, contactId: id, key, value });
  });
  revalidatePath(`/contacts/${id}`);
}

/** Delete one dynamic custom field from a contact. Manager+ write. */
export async function removeContactCustomField(form: FormData): Promise<void> {
  const { orgId, role } = await requireOrgWithRole();
  if (!roleAtLeast(role, "manager")) throw new Error("forbidden: requires manager role");
  const id = z.string().uuid().parse(form.get("contactId"));
  const key = z.string().min(1).max(64).parse(form.get("key"));

  await withTenant(orgId, async (tx) => {
    await deleteCustomFieldTx(tx, { orgId, contactId: id, key });
  });
  revalidatePath(`/contacts/${id}`);
}

const BulkTagSchema = z.object({
  contactIds: z.array(z.string().uuid()).min(1).max(5000),
  tags: z.array(z.string().max(64)).min(1).max(50),
  op: z.enum(["add", "remove"]).default("add"),
});

/** Add/remove tags across many contacts (bulk bar). Manager+ write. */
export async function bulkTagContacts(form: FormData): Promise<{ updated: number }> {
  const { orgId, userId, role } = await requireOrgWithRole();
  if (!roleAtLeast(role, "manager")) throw new Error("forbidden: requires manager role");

  const ids = parseIdList(form.get("contactIds"));
  const tags = parseStringList(form.get("tags"));
  const op = (form.get("op") as string) === "remove" ? "remove" : "add";
  const parsed = BulkTagSchema.safeParse({ contactIds: ids, tags, op });
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join("; "));

  const updated = await withTenant(orgId, async (tx) => {
    return parsed.data.op === "add"
      ? bulkAddTagsTx(tx, { orgId, contactIds: parsed.data.contactIds, tags: parsed.data.tags, actorUserId: userId })
      : bulkRemoveTagsTx(tx, { orgId, contactIds: parsed.data.contactIds, tags: parsed.data.tags, actorUserId: userId });
  });

  revalidatePath("/contacts");
  return { updated };
}

/** Delete many contacts (bulk bar). Admin only (destructive). */
export async function bulkDeleteContacts(form: FormData): Promise<{ deleted: number }> {
  const { orgId, userId } = await requireRole("admin");
  const ids = parseIdList(form.get("contactIds"));
  if (ids.length === 0) return { deleted: 0 };

  const deleted = await withTenant(orgId, async (tx) => {
    const res = await tx.contact.deleteMany({ where: { id: { in: ids }, organizationId: orgId } });
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "contact.bulk_deleted",
        resourceType: "contact",
        resourceId: ids[0] ?? null,
        afterData: { count: res.count },
      },
    });
    return res.count;
  });

  revalidatePath("/contacts");
  return { deleted };
}

/**
 * Merge a duplicate contact into a primary one: re-point tags/custom-fields/
 * activities to the primary, fill blank primary fields from the duplicate, then
 * delete the duplicate. Admin only. Fail-soft on un-migrated relations.
 */
export async function mergeContacts(form: FormData): Promise<void> {
  const { orgId, userId } = await requireRole("admin");
  const primaryId = z.string().uuid().parse(form.get("primaryId"));
  const duplicateId = z.string().uuid().parse(form.get("duplicateId"));
  if (primaryId === duplicateId) throw new Error("cannot_merge_into_self");

  await withTenant(orgId, async (tx) => {
    const [primary, dup] = await Promise.all([
      tx.contact.findFirst({ where: { id: primaryId, organizationId: orgId } }),
      tx.contact.findFirst({ where: { id: duplicateId, organizationId: orgId } }),
    ]);
    if (!primary || !dup) throw new Error("contact_not_found");

    // Fill blanks on primary from the duplicate (never overwrite existing data).
    await tx.contact.update({
      where: { id: primaryId },
      data: {
        name: primary.name ?? dup.name ?? undefined,
        firstName: primary.firstName ?? dup.firstName ?? undefined,
        lastName: primary.lastName ?? dup.lastName ?? undefined,
        companyName: primary.companyName ?? dup.companyName ?? undefined,
        email: primary.email ?? dup.email ?? undefined,
        phone: primary.phone ?? dup.phone ?? undefined,
        notes: primary.notes ?? dup.notes ?? undefined,
        tags: normalizeTags([...(primary.tags ?? []), ...(dup.tags ?? [])]),
        lastActivityAt:
          mostRecent(primary.lastActivityAt, dup.lastActivityAt) ?? undefined,
      },
    });

    // Re-point child rows. Each is fail-soft on a missing table.
    await softRepoint(() =>
      tx.contactTag.updateMany({ where: { contactId: duplicateId }, data: { contactId: primaryId } }),
    );
    await softRepoint(() =>
      tx.contactCustomField.updateMany({ where: { contactId: duplicateId }, data: { contactId: primaryId } }),
    );
    await softRepoint(() =>
      tx.contactActivity.updateMany({ where: { contactId: duplicateId }, data: { contactId: primaryId } }),
    );

    await appendActivityTx(tx, {
      orgId,
      contactId: primaryId,
      kind: "merged",
      title: "Merged a duplicate contact",
      body: dup.email ?? dup.phone ?? dup.name ?? null,
      actorUserId: userId,
    });

    await tx.contact.delete({ where: { id: duplicateId } });
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "contact.merged",
        resourceType: "contact",
        resourceId: primaryId,
        afterData: { mergedFrom: duplicateId },
      },
    });
  });

  revalidatePath("/contacts");
  revalidatePath(`/contacts/${primaryId}`);
}

/**
 * Import mapped CSV rows (column-mapping + dedupe step). Reads parsed text +
 * mapping JSON, normalizes, dedupes against existing emails/phones, and
 * `createMany skipDuplicates`. Mirrors tags + writes per-contact "imported"
 * activity. Returns a summary. Manager+ write.
 */
export async function importContactsMapped(form: FormData): Promise<{
  created: number;
  duplicates: number;
  invalid: number;
  truncated: boolean;
}> {
  const { orgId, userId, role } = await requireOrgWithRole();
  if (!roleAtLeast(role, "manager")) throw new Error("forbidden: requires manager role");

  const csvText = z.string().min(1).max(5_000_000).parse(form.get("csvText"));
  const mappingRaw = z.string().min(2).max(20_000).parse(form.get("mapping"));
  let mapping: ColumnMapping[];
  try {
    mapping = JSON.parse(mappingRaw) as ColumnMapping[];
  } catch {
    throw new Error("invalid_mapping_json");
  }

  const parsed = parseImportCsv(csvText);
  // Server-side guard (defense-in-depth; the import panel also validates client-side):
  // reject a CSV whose header lacks Name + (Email OR Phone) before any mapping/insert.
  assertImportableHeader(parsed.headers);
  const mapped = applyMapping(parsed, mapping);
  if (mapped.records.length === 0) {
    return { created: 0, duplicates: mapped.duplicatesInFile, invalid: mapped.invalid.length, truncated: parsed.truncated };
  }

  // Dedupe against existing contacts (email/phone) inside the tenant tx.
  const emails = mapped.records.map((r) => r.email).filter((v): v is string => !!v);
  const phones = mapped.records.map((r) => r.phone).filter((v): v is string => !!v);

  const result = await withTenant(orgId, async (tx) => {
    const existing = await tx.contact.findMany({
      where: {
        organizationId: orgId,
        OR: [
          ...(emails.length ? [{ email: { in: emails } }] : []),
          ...(phones.length ? [{ phone: { in: phones } }] : []),
        ],
      },
      select: { email: true, phone: true },
    });
    const { toCreate, duplicates } = dedupeAgainstExisting(mapped.records, {
      emails: existing.map((e) => e.email).filter((v): v is string => !!v),
      phones: existing.map((e) => e.phone).filter((v): v is string => !!v),
    });

    if (toCreate.length === 0) return { created: 0, duplicates: duplicates.length };

    await tx.contact.createMany({
      data: toCreate.map((r) => ({
        organizationId: orgId,
        source: "import",
        name: r.name,
        firstName: r.firstName,
        lastName: r.lastName,
        companyName: r.companyName,
        email: r.email,
        phone: r.phone,
        tags: normalizeTags(r.tags),
        lastActivityAt: new Date(),
      })),
      skipDuplicates: true,
    });

    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "contact.imported",
        resourceType: "contact",
        afterData: { created: toCreate.length, duplicates: duplicates.length },
      },
    });

    return { created: toCreate.length, duplicates: duplicates.length };
  });

  revalidatePath("/contacts");
  return {
    created: result.created,
    duplicates: result.duplicates + mapped.duplicatesInFile,
    invalid: mapped.invalid.length,
    truncated: parsed.truncated,
  };
}

const ExportScope = z.enum(["all", "filter", "segment"]);

/**
 * Export contacts to CSV (XLSX falls back to CSV). Scope = all | current filter |
 * a chosen segment. Returns a downloadable data-URL + filename. Any member can
 * export their own org's contacts.
 */
export async function exportContacts(form: FormData): Promise<{
  filename: string;
  dataUrl: string;
  count: number;
  xlsxFallback: boolean;
}> {
  const { orgId } = await requireOrg();
  const scope = ExportScope.catch("all").parse(form.get("scope") ?? "all");
  const format = ((form.get("format") as string) === "xlsx" ? "xlsx" : "csv") as ContactExportFormat;

  const filterArgs =
    scope === "filter"
      ? {
          q: (form.get("q") as string) || undefined,
          source: (form.get("source") as string) || undefined,
          tag: (form.get("tag") as string) || undefined,
        }
      : scope === "segment"
        ? { seg: (form.get("seg") as string) || undefined }
        : {};

  const contacts = await listContactsForExport({ orgId, ...filterArgs });
  const exp = buildContactsExport(contacts, format);
  return {
    filename: exp.filename,
    dataUrl: toDataUrl(exp),
    count: contacts.length,
    xlsxFallback: exp.xlsxFallback,
  };
}

const BulkSendSchema = z.object({
  contactIds: z.array(z.string().uuid()).min(1).max(2000),
  establishmentId: z.string().uuid(),
  channel: z.enum(["sms", "email"]),
  scheduleHours: z.coerce.number().int().min(0).max(720).default(0),
  consentAttested: z.boolean().default(false),
  customBody: z.string().max(4000).optional(),
});

/**
 * Bulk "Send Review Request" — fans out to `createReviewRequest` once per
 * selected contact, reusing the full outreach pipeline (suppression, TCPA
 * consent, dispatch). Pro-gated via `assertEntitled`. Per-recipient fail-soft so
 * one bad/unsubscribed recipient never aborts the batch. Returns a tally.
 */
export async function bulkSendReviewRequest(form: FormData): Promise<{
  sent: number;
  skipped: number;
  failed: number;
}> {
  const { orgId, role } = await requireOrgWithRole();
  if (!roleAtLeast(role, "manager")) throw new Error("forbidden: requires manager role");
  // Outreach sends incur SMS/email cost — gate on an active plan (throws PlanInactiveError).
  await assertEntitled(orgId);

  const ids = parseIdList(form.get("contactIds"));
  const parsed = BulkSendSchema.safeParse({
    contactIds: ids,
    establishmentId: form.get("establishmentId"),
    channel: form.get("channel"),
    scheduleHours: form.get("scheduleHours") ?? 0,
    consentAttested: form.get("consentAttested") === "on" || form.get("consentAttested") === "true",
    customBody: (form.get("customBody") as string) || undefined,
  });
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  const d = parsed.data;

  // Resolve recipients from the selected contacts for the chosen channel.
  const contacts = await withTenant(orgId, (tx) =>
    tx.contact.findMany({
      where: { id: { in: d.contactIds }, organizationId: orgId },
      select: { id: true, name: true, email: true, phone: true },
    }),
  );

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const c of contacts) {
    const recipient = d.channel === "email" ? c.email : c.phone;
    if (!recipient) {
      skipped++;
      continue;
    }
    const fd = new FormData();
    fd.set("establishmentId", d.establishmentId);
    fd.set("channel", d.channel);
    fd.set("recipient", recipient);
    if (c.name) fd.set("recipientName", c.name);
    fd.set("scheduleHours", String(d.scheduleHours));
    if (d.consentAttested) fd.set("consentAttested", "on");
    if (d.customBody) fd.set("customBody", d.customBody);
    try {
      await createReviewRequest(fd);
      sent++;
    } catch (err) {
      // Unsubscribed / invalid / consent-missing → skip this recipient, keep going.
      failed++;
      logger.warn({
        event: "contacts.bulk_send.recipient_failed",
        orgId,
        contactId: c.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  revalidatePath("/contacts");
  return { sent, skipped, failed };
}

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

/** Parse a JSON array or comma-separated string of UUIDs from a form field. */
function parseIdList(value: FormDataEntryValue | null): string[] {
  const list = parseStringList(value);
  return list.filter((v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v));
}

/** Parse a JSON array or comma-separated string into a string[]. */
function parseStringList(value: FormDataEntryValue | null): string[] {
  if (value == null) return [];
  const s = String(value).trim();
  if (!s) return [];
  if (s.startsWith("[")) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) return arr.map((v) => String(v).trim()).filter(Boolean);
    } catch {
      /* fall through to CSV parse */
    }
  }
  return s.split(",").map((v) => v.trim()).filter(Boolean);
}

/** Most-recent of two nullable dates. */
function mostRecent(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

/** Run a re-point updateMany; swallow only missing-relation errors. */
async function softRepoint(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    if (!isMissingRelation(err)) throw err;
  }
}

/**
 * Sync customers from a connected Shopify store into Contacts (env-gated paid
 * integration). Manager+ write. No-ops + returns
 * `{ synced: 0, skipped: "shopify_not_configured" }` when the Shopify connection
 * or credentials are absent — so default/test paths make no outbound paid call.
 * Pro-gated via `assertEntitled` (the sync writes contacts on a paid plan).
 */
export async function syncShopifyContacts(_form: FormData): Promise<{
  synced: number;
  skipped?: string;
}> {
  const { orgId, role } = await requireOrgWithRole();
  if (!roleAtLeast(role, "manager")) throw new Error("forbidden: requires manager role");
  await assertEntitled(orgId);

  const result = await syncShopifyCustomers({ orgId });
  if (result.synced > 0) revalidatePath("/contacts");
  return { synced: result.synced, ...(result.skipped ? { skipped: result.skipped } : {}) };
}
