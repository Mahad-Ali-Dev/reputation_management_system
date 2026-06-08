/**
 * Shared contact reads (module 12, Wave 3b).
 *
 * One place that builds the `Contact` WHERE clause from the directory's
 * search/source/tag/segment filters, so the Contacts panel, the export action,
 * and the segment deep-links all resolve to the *identical* row set. Every read
 * is tenant-scoped (`withTenant`) and fail-soft on the un-migrated new columns
 * (`vip`, `lastActivityAt`, …) via `softQuery`.
 */

import { withTenant } from "@/lib/db/with-tenant";
import type { Prisma } from "@prisma/client";
import { softQuery } from "./fail-soft";
import { segmentWhere } from "./segments";

export type ContactSort = "name" | "lastActivity" | "created";

export type ContactListItem = {
  id: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  source: string;
  tags: string[];
  vip: boolean;
  lastActivityAt: Date | null;
  lastContactedAt: Date | null;
  createdAt: Date;
};

export type ContactStats = {
  total: number;
  newThisMonth: number;
  active30d: number;
  vip: number;
};

export type ListContactsArgs = {
  orgId: string;
  q?: string;
  source?: string;
  tag?: string;
  seg?: string;
  sort?: ContactSort;
  page?: number;
  take?: number;
};

export const DEFAULT_PAGE_SIZE = 25;

/** Columns selected for the list/export — kept narrow + identical everywhere. */
const LIST_SELECT = {
  id: true,
  name: true,
  firstName: true,
  lastName: true,
  companyName: true,
  email: true,
  phone: true,
  source: true,
  tags: true,
  vip: true,
  lastActivityAt: true,
  lastContactedAt: true,
  createdAt: true,
} satisfies Prisma.ContactSelect;

/**
 * Build the Prisma WHERE for a directory query from its filters. Exported so the
 * export action can reuse the exact same predicate as the on-screen list.
 */
export function buildContactWhere(args: {
  orgId: string;
  q?: string;
  source?: string;
  tag?: string;
  seg?: string;
}): Prisma.ContactWhereInput {
  const and: Prisma.ContactWhereInput[] = [];

  const seg = segmentWhere(args.seg);
  if (seg) and.push(seg);

  if (args.source && args.source !== "all") {
    and.push({ source: args.source });
  }

  if (args.tag && args.tag !== "all") {
    // `tags` is the denormalized display copy (mirrored on every tag write); it
    // is the cheapest filter and exists pre-migration.
    and.push({ tags: { has: args.tag } });
  }

  const q = args.q?.trim();
  if (q) {
    and.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
        { companyName: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  return and.length > 0 ? { AND: and } : {};
}

function orderBy(sort: ContactSort | undefined): Prisma.ContactOrderByWithRelationInput[] {
  switch (sort) {
    case "name":
      return [{ name: "asc" }, { createdAt: "desc" }];
    case "lastActivity":
      return [{ lastActivityAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }];
    default:
      return [{ createdAt: "desc" }];
  }
}

/**
 * Filtered + sorted + paginated contacts plus the total count for that filter
 * (so the table can render "showing X of Y" + pagination). Fail-soft → empty.
 */
export async function listContacts(args: ListContactsArgs): Promise<{
  rows: ContactListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const pageSize = Math.min(Math.max(args.take ?? DEFAULT_PAGE_SIZE, 1), 200);
  const page = Math.max(args.page ?? 1, 1);
  const where = buildContactWhere(args);

  const result = await softQuery(
    () =>
      withTenant(args.orgId, async (tx) => {
        const [rows, total] = await Promise.all([
          tx.contact.findMany({
            where,
            select: LIST_SELECT,
            orderBy: orderBy(args.sort),
            skip: (page - 1) * pageSize,
            take: pageSize,
          }),
          tx.contact.count({ where }),
        ]);
        return { rows: rows as ContactListItem[], total };
      }),
    { rows: [] as ContactListItem[], total: 0 },
    { event: "contacts.list.failed", swallowAll: true, context: { orgId: args.orgId } },
  );

  return {
    rows: result.rows,
    total: result.total,
    page,
    pageSize,
    totalPages: Math.max(Math.ceil(result.total / pageSize), 1),
  };
}

/**
 * All contacts matching a filter, for export (no pagination, hard-capped). Uses
 * the same WHERE as `listContacts`. Fail-soft → empty.
 */
export async function listContactsForExport(args: {
  orgId: string;
  q?: string;
  source?: string;
  tag?: string;
  seg?: string;
  cap?: number;
}): Promise<ContactListItem[]> {
  const cap = Math.min(Math.max(args.cap ?? 50_000, 1), 100_000);
  const where = buildContactWhere(args);
  return softQuery(
    () =>
      withTenant(args.orgId, async (tx) =>
        tx.contact.findMany({
          where,
          select: LIST_SELECT,
          orderBy: [{ createdAt: "desc" }],
          take: cap,
        }),
      ) as Promise<ContactListItem[]>,
    [] as ContactListItem[],
    { event: "contacts.export_list.failed", swallowAll: true, context: { orgId: args.orgId } },
  );
}

/** Stat-card counts. Each count is independent + fail-soft → 0. */
export async function getContactStats(orgId: string): Promise<ContactStats> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  return softQuery(
    () =>
      withTenant(orgId, async (tx) => {
        const [total, newThisMonth, active30d, vip] = await Promise.all([
          tx.contact.count(),
          tx.contact.count({ where: { createdAt: { gte: startOfMonth } } }),
          tx.contact.count({
            where: {
              OR: [
                { lastActivityAt: { gte: since30 } },
                { lastContactedAt: { gte: since30 } },
              ],
            },
          }),
          tx.contact.count({ where: { vip: true } }),
        ]);
        return { total, newThisMonth, active30d, vip };
      }),
    { total: 0, newThisMonth: 0, active30d: 0, vip: 0 },
    { event: "contacts.stats.failed", swallowAll: true, context: { orgId } },
  );
}

/** A single contact (header + identifiers). Fail-soft / null when absent. */
export async function getContactById(args: {
  orgId: string;
  id: string;
}): Promise<ContactListItem | null> {
  return softQuery(
    () =>
      withTenant(args.orgId, async (tx) =>
        tx.contact.findFirst({ where: { id: args.id }, select: LIST_SELECT }),
      ) as Promise<ContactListItem | null>,
    null,
    { event: "contacts.get_by_id.failed", swallowAll: true, context: { orgId: args.orgId } },
  );
}

export type ContactCustomFieldRow = { id: string; key: string; value: string };

export type ContactWithFields = ContactListItem & {
  notes: string | null;
  consentStatus: string | null;
  externalId: string | null;
  customFields: ContactCustomFieldRow[];
};

/**
 * Full contact for the profile page: header columns + notes/consent + custom
 * fields. Custom fields are read separately + fail-soft (the table may not be
 * migrated yet → empty list, contact still renders).
 */
export async function getContactWithFields(args: {
  orgId: string;
  id: string;
}): Promise<ContactWithFields | null> {
  const base = await softQuery(
    () =>
      withTenant(args.orgId, async (tx) =>
        tx.contact.findFirst({
          where: { id: args.id },
          select: {
            ...LIST_SELECT,
            notes: true,
            consentStatus: true,
            externalId: true,
          },
        }),
      ),
    null as
      | (ContactListItem & {
          notes: string | null;
          consentStatus: string | null;
          externalId: string | null;
        })
      | null,
    { event: "contacts.get_with_fields.failed", swallowAll: true, context: { orgId: args.orgId } },
  );
  if (!base) return null;

  const customFields = await softQuery(
    () =>
      withTenant(args.orgId, async (tx) =>
        tx.contactCustomField.findMany({
          where: { contactId: args.id },
          select: { id: true, key: true, value: true },
          orderBy: { createdAt: "asc" },
        }),
      ),
    [] as ContactCustomFieldRow[],
    { event: "contacts.custom_fields.failed", swallowAll: true, context: { orgId: args.orgId } },
  );

  return { ...base, customFields };
}
