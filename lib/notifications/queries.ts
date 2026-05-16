import { withTenant } from "@/lib/db/with-tenant";

export async function listNotifications(orgId: string, userId: string, limit = 20) {
  return withTenant(orgId, async (tx) =>
    tx.notification.findMany({
      where: {
        OR: [{ userId }, { userId: null }],
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
  );
}

export async function unreadCount(orgId: string, userId: string) {
  return withTenant(orgId, async (tx) =>
    tx.notification.count({
      where: {
        readAt: null,
        OR: [{ userId }, { userId: null }],
      },
    }),
  );
}

/**
 * Fetch the list + unread count in ONE tenant transaction (one Postgres
 * round-trip with SET LOCAL ROLE set once instead of twice).
 *
 * Used by NotificationsBell.
 */
export async function listNotificationsWithCount(
  orgId: string,
  userId: string,
  limit = 20,
): Promise<{
  notifs: Awaited<ReturnType<typeof listNotifications>>;
  count: number;
}> {
  return withTenant(orgId, async (tx) => {
    const [notifs, count] = await Promise.all([
      tx.notification.findMany({
        where: { OR: [{ userId }, { userId: null }] },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      tx.notification.count({
        where: {
          readAt: null,
          OR: [{ userId }, { userId: null }],
        },
      }),
    ]);
    return { notifs, count };
  });
}
