import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/with-tenant";

export async function listProducts() {
  return prisma.hardwareProduct.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
}

export async function listOrgOrders(orgId: string) {
  return withTenant(orgId, async (tx) => {
    return tx.hardwareOrder.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        items: {
          include: { product: { select: { sku: true, name: true } } },
        },
        devices: { select: { id: true, shortSlug: true, status: true } },
      },
    });
  });
}

export async function getOrder(orgId: string, orderId: string) {
  return withTenant(orgId, async (tx) => {
    return tx.hardwareOrder.findFirst({
      where: { id: orderId },
      include: {
        items: { include: { product: true } },
        devices: { select: { id: true, shortSlug: true, status: true, activationCodeHash: true } },
      },
    });
  });
}

export async function listOrgDevices(orgId: string) {
  return withTenant(orgId, async (tx) => {
    return tx.device.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      include: {
        establishment: { select: { name: true } },
      },
    });
  });
}
