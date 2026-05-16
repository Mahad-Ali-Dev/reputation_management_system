import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Badge, KpiCard, TableCard, THead, Th, Td } from "@/components/admin/admin-ui";
import { prisma } from "@/lib/db/client";
import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * Admin refunds — list refundable hardware orders + recent refunds.
 * Refund creation happens on /admin/refunds/[orderId].
 * Subscription refunds go via Stripe Dashboard.
 */
export default async function RefundsListPage() {
  const [orders, last30dRefunds] = await Promise.all([
    prisma.hardwareOrder.findMany({
      where: {
        status: { in: ["paid", "shipped", "delivered", "partially_refunded"] },
        stripePaymentIntentId: { not: null },
      },
      select: {
        id: true,
        organizationId: true,
        totalCents: true,
        currency: true,
        status: true,
        createdAt: true,
        organization: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.hardwareOrder.count({
      where: {
        status: { in: ["refunded", "partially_refunded"] },
        updatedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  const totalAtRisk = orders.reduce((s, o) => s + o.totalCents, 0);

  return (
    <>
      <AdminPageHeader
        title="Refunds"
        description="Pick an order to issue a partial or full refund through Stripe. Subscription refunds go via Stripe Dashboard."
      />

      <div className="grid-4" style={{ gap: 12, marginBottom: 18 }}>
        <KpiCard l="Refundable orders" v={String(orders.length)} d="paid + shipped + delivered" />
        <KpiCard
          l="Refunded · 30d"
          v={String(last30dRefunds)}
          d="full or partial in last 30 days"
        />
        <KpiCard
          l="Total at risk"
          v={`$${(totalAtRisk / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
          d="combined order total"
        />
        <KpiCard l="Subscription refunds" v="—" d="issued via Stripe Dashboard" />
      </div>

      <div className="ds-card">
        <div className="ds-card__head">
          <h3 className="ds-card__title">Recent refundable orders</h3>
        </div>
        <TableCard
          empty={orders.length === 0}
          emptyText="No refundable hardware orders."
        >
          <THead>
            <Th>Order</Th>
            <Th>Tenant</Th>
            <Th align="right">Total</Th>
            <Th>Status</Th>
            <Th>Created</Th>
            <Th align="right" />
          </THead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} style={{ borderTop: "1px solid var(--line)" }}>
                <Td mono>{o.id.slice(0, 8)}…</Td>
                <Td>{o.organization.name}</Td>
                <Td align="right">
                  <strong>${(o.totalCents / 100).toFixed(2)}</strong>
                </Td>
                <Td>
                  <Badge
                    tone={
                      o.status === "delivered"
                        ? "ok"
                        : o.status === "partially_refunded"
                          ? "warn"
                          : "info"
                    }
                  >
                    {o.status.replace(/_/g, " ")}
                  </Badge>
                </Td>
                <Td>
                  <span style={{ fontSize: 11.5, color: "var(--rl-muted)" }}>
                    {new Date(o.createdAt).toLocaleDateString()}
                  </span>
                </Td>
                <Td align="right">
                  <Link
                    href={`/admin/refunds/${o.id}`}
                    style={{
                      color: "#4f46e5",
                      fontSize: 12,
                      textDecoration: "none",
                      fontWeight: 500,
                    }}
                  >
                    Refund →
                  </Link>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      </div>
    </>
  );
}
