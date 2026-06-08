import { withTenant } from "@/lib/db/with-tenant";

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
  connections: Array<{
    id: string;
    provider: string;
    status: string;
    accountLabel: string | null;
    lastSyncedAt: Date | null;
  }>;
  reviews: Array<{ rating: number }>;
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
        // Ratings only — averaged + counted in JS (matches the page's old approach).
        reviews: { select: { rating: true } },
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
