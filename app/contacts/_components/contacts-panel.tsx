import { withTenant } from "@/lib/db/with-tenant";
import { isOrgEntitled } from "@/lib/billing/entitlements";
import { listContacts, type ContactSort } from "@/lib/contacts/queries";
import { getSegment } from "@/lib/contacts/segments";
import { softQuery } from "@/lib/contacts/fail-soft";
import type { ContactStats } from "@/lib/contacts/queries";
import { StatCards } from "./stat-cards";
import { ContactsTable } from "./contacts-table";

/**
 * Contacts tab (server). Reads stat counts (passed in) + the filtered / sorted /
 * paginated list via `lib/contacts/queries`, plus the supporting data the client
 * table needs (distinct tags for the tag filter, establishments for the bulk
 * review-request dialog, the Pro-entitlement flag for gating bulk paid actions).
 * All interactivity lives in `<ContactsTable/>` (client). RSC-safe.
 */

function toSort(v: string | undefined): ContactSort | undefined {
  return v === "name" || v === "lastActivity" ? v : undefined;
}

export async function ContactsPanel({
  orgId,
  stats,
  q,
  source,
  tag,
  seg,
  sort,
  page,
}: {
  orgId: string;
  stats: ContactStats;
  q?: string;
  source?: string;
  tag?: string;
  seg?: string;
  sort?: string;
  page?: string;
}) {
  const sortKey = toSort(sort);
  const pageNum = Math.max(Number.parseInt(page ?? "1", 10) || 1, 1);

  const [list, tagOptions, establishments, entitled] = await Promise.all([
    listContacts({ orgId, q, source, tag, seg, sort: sortKey, page: pageNum }),
    loadDistinctTags(orgId),
    loadEstablishments(orgId),
    isOrgEntitled(orgId),
  ]);

  const activeSegment = getSegment(seg);

  return (
    <div>
      <StatCards stats={stats} />
      <ContactsTable
        rows={list.rows}
        total={list.total}
        page={list.page}
        pageSize={list.pageSize}
        totalPages={list.totalPages}
        filters={{ q: q ?? "", source: source ?? "all", tag: tag ?? "all", seg: seg ?? "", sort: sort ?? "" }}
        tagOptions={tagOptions}
        activeSegmentLabel={activeSegment?.label ?? null}
        establishments={establishments}
        entitled={entitled}
      />
    </div>
  );
}

/** Distinct tags across the org's contacts (denormalized `tags[]`). Fail-soft → []. */
async function loadDistinctTags(orgId: string): Promise<string[]> {
  const rows = await softQuery(
    () =>
      withTenant(orgId, async (tx) =>
        tx.contact.findMany({ select: { tags: true }, take: 2000 }),
      ),
    [] as { tags: string[] }[],
    { event: "contacts.distinct_tags.failed", swallowAll: true, context: { orgId } },
  );
  const set = new Set<string>();
  for (const r of rows) for (const t of r.tags ?? []) if (t) set.add(t);
  return [...set].sort((a, b) => a.localeCompare(b)).slice(0, 100);
}

/** Establishments for the bulk review-request dialog routing. Fail-soft → []. */
async function loadEstablishments(orgId: string): Promise<{ id: string; name: string }[]> {
  return softQuery(
    () =>
      withTenant(orgId, async (tx) =>
        tx.establishment.findMany({
          where: { deletedAt: null },
          select: { id: true, name: true },
          orderBy: { createdAt: "asc" },
          take: 100,
        }),
      ),
    [] as { id: string; name: string }[],
    { event: "contacts.establishments.failed", swallowAll: true, context: { orgId } },
  );
}
