import { withTenant } from "@/lib/db/with-tenant";

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
