import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";

/**
 * One raw establishment row powering the redesigned "My Establishments" list.
 * The shape is intentionally serializable so the page can derive plain card
 * props (`lib`-free) and pass them into server components.
 */
export type EstablishmentCardData = {
  id: string;
  name: string;
  category: string | null;
  address: unknown;
  phone: string | null;
  imageUrl: string | null;
  googlePlaceId: string | null;
  createdAt: Date;
  /** Optional so older test fixtures stay valid; the query always selects it. */
  timezone?: string | null;
  connections: Array<{
    id: string;
    provider: string;
    status: string;
    accountLabel: string | null;
    lastSyncedAt: Date | null;
  }>;
  /** `postedAt` is optional for the same fixture-compat reason as `timezone`. */
  reviews: Array<{ rating: number; postedAt?: Date }>;
  devices: Array<{
    id: string;
    productKind: string;
    productSku: string;
    status: string;
    scanCount: number;
    lastScanAt: Date | null;
  }>;
};

/**
 * Single query for the redesigned establishments list. Returns identity +
 * the active Google connection summary + review ratings (averaged in JS) +
 * linked devices, all inside `withTenant` (tenant + RLS scoped).
 *
 * Replaces the old inline master-detail block on the page. Existing exports
 * (`listEstablishments`, `getEstablishment`, `hasGoogleConnection`) are left
 * untouched — other callers depend on them.
 *
 * NOTE: `Connection`/`Device` tables are already migrated, so no fail-soft is
 * needed here; the whole block runs inside the tenant transaction.
 */
export async function listEstablishmentsForCards(orgId: string): Promise<EstablishmentCardData[]> {
  return withTenant(orgId, async (tx) => {
    return tx.establishment.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        category: true,
        address: true,
        phone: true,
        imageUrl: true,
        googlePlaceId: true,
        createdAt: true,
        timezone: true,
        // Only the active Google Business connection drives "Connected".
        connections: {
          where: { provider: "google_business", status: "active" },
          select: {
            id: true,
            provider: true,
            status: true,
            accountLabel: true,
            lastSyncedAt: true,
          },
        },
        // Ratings + timestamps — averaged/bucketed in JS (rating average for the
        // card, postedAt for the summary-strip 30-day sparkline).
        reviews: { select: { rating: true, postedAt: true } },
        devices: {
          select: {
            id: true,
            productKind: true,
            productSku: true,
            status: true,
            scanCount: true,
            lastScanAt: true,
          },
        },
      },
    });
  });
}

export async function listEstablishments(orgId: string) {
  return withTenant(orgId, async (tx) => {
    return tx.establishment.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        category: true,
        timezone: true,
        address: true,
        googlePlaceId: true,
        createdAt: true,
        _count: { select: { connections: { where: { status: "active" } } } },
      },
    });
  });
}

export async function getEstablishment(orgId: string, id: string) {
  return withTenant(orgId, async (tx) => {
    return tx.establishment.findFirst({
      where: { id, deletedAt: null },
      include: {
        connections: {
          where: { status: "active" },
          select: {
            id: true,
            provider: true,
            accountLabel: true,
            externalId: true,
            scopes: true,
            createdAt: true,
            lastSyncedAt: true,
          },
        },
      },
    });
  });
}

/**
 * Latest local-rank reading per establishment for the summary strip's rank
 * badge. `position` is the most recent non-null KeywordRank position;
 * `prevPosition` is the next-older check of the SAME keyword (drives the
 * up/down trend arrow — lower position = better).
 */
export type EstablishmentRank = {
  keyword: string;
  position: number;
  prevPosition: number | null;
};

/** Postgres 42P01 (undefined_table) / 42703 (undefined_column) → not migrated. */
function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  if (code === "P2021" || code === "P2022" || code === "42P01" || code === "42703") return true;
  const pgCode = ((err as { meta?: { code?: string } } | null)?.meta ?? {}).code;
  return pgCode === "42P01" || pgCode === "42703";
}

/**
 * Fail-soft read of `keyword_ranks` (Owner: 13_reports). The summary strip
 * renders a rank badge ONLY when real rank data exists, so a missing table or
 * an empty one both resolve to an empty map and the badge is simply omitted.
 */
export async function latestRanksByEstablishment(
  orgId: string,
): Promise<Map<string, EstablishmentRank>> {
  try {
    return await withTenant(orgId, async (tx) => {
      // Newest-first window — enough to find latest + previous per location
      // without scanning the whole history.
      const rows = await tx.keywordRank.findMany({
        where: { establishmentId: { not: null }, position: { not: null } },
        orderBy: { checkedAt: "desc" },
        take: 200,
        select: { establishmentId: true, keyword: true, position: true },
      });
      const map = new Map<string, EstablishmentRank>();
      for (const r of rows) {
        if (!r.establishmentId || r.position === null) continue;
        const cur = map.get(r.establishmentId);
        if (!cur) {
          map.set(r.establishmentId, {
            keyword: r.keyword,
            position: r.position,
            prevPosition: null,
          });
        } else if (cur.prevPosition === null && r.keyword === cur.keyword) {
          cur.prevPosition = r.position;
        }
      }
      return map;
    });
  } catch (err) {
    if (!isMissingRelation(err)) {
      logger.warn({ orgId, error: String(err), event: "establishments.rank_read_failed" });
    }
    return new Map();
  }
}

export async function hasGoogleConnection(orgId: string, establishmentId: string): Promise<boolean> {
  return withTenant(orgId, async (tx) => {
    const c = await tx.connection.findFirst({
      where: {
        establishmentId,
        provider: "google_business",
        status: "active",
      },
      select: { id: true },
    });
    return !!c;
  });
}
