import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Badge, KpiCard } from "@/components/admin/admin-ui";
import { getAdminSession } from "@/lib/admin/session";
import { prisma } from "@/lib/db/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

async function markShipped(formData: FormData) {
  "use server";
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (session.imp) return; // impersonation mode is read-only

  const orderId = formData.get("orderId");
  const carrier = formData.get("carrier");
  const trackingNumber = formData.get("trackingNumber");
  if (typeof orderId !== "string" || !/^[0-9a-f-]{36}$/i.test(orderId)) return;

  const order = await prisma.hardwareOrder.update({
    where: { id: orderId },
    data: {
      status: "shipped",
      carrier: typeof carrier === "string" ? carrier : null,
      trackingNumber: typeof trackingNumber === "string" ? trackingNumber : null,
      shippedAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: order.organizationId,
      actorType: "admin_user",
      actorId: session.adminId,
      action: "hardware.order.shipped",
      resourceType: "hardware_order",
      resourceId: orderId,
      afterData: {
        carrier: typeof carrier === "string" ? carrier : null,
        trackingNumber: typeof trackingNumber === "string" ? trackingNumber : null,
      },
    },
  });

  revalidatePath("/admin/fulfillment");
}

export default async function FulfillmentPage() {
  const [orders, shipped30d] = await Promise.all([
    prisma.hardwareOrder.findMany({
      where: { status: { in: ["paid", "printing"] } },
      orderBy: { createdAt: "asc" },
      include: {
        organization: { select: { name: true, slug: true } },
        items: { include: { product: { select: { sku: true, name: true } } } },
        devices: { select: { id: true, shortSlug: true, activationCodeHash: true } },
      },
    }),
    prisma.hardwareOrder.count({
      where: {
        status: { in: ["shipped", "delivered"] },
        shippedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  const totalValue = orders.reduce((s, o) => s + o.totalCents, 0);
  const unprovisioned = orders.filter((o) => o.devices.length === 0).length;

  return (
    <>
      <AdminPageHeader
        title="Fulfillment queue"
        description="Paid hardware orders ready to ship. Mark shipped to trigger the customer-facing tracking email."
      />

      <div className="grid-4" style={{ gap: 12, marginBottom: 18 }}>
        <KpiCard
          l="To ship"
          v={String(orders.length)}
          d={orders.length === 1 ? "order pending" : "orders pending"}
        />
        <KpiCard
          l="Queue value"
          v={`$${(totalValue / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
          d="combined invoice total"
        />
        <KpiCard
          l="Shipped · 30d"
          v={String(shipped30d)}
          d="orders sent in last 30 days"
          up={shipped30d > 0}
        />
        <KpiCard
          l="Unprovisioned"
          v={String(unprovisioned)}
          d={unprovisioned > 0 ? "⚠ devices not generated yet" : "all ready"}
        />
      </div>

      {orders.length === 0 ? (
        <div
          className="ds-card"
          style={{
            padding: 56,
            textAlign: "center",
            color: "var(--rl-muted)",
            fontSize: 13,
          }}
        >
          All caught up. Paid orders appear here as Stripe webhooks land.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {orders.map((o) => {
            const a = o.shippingAddress as {
              name?: string;
              line1?: string;
              line2?: string;
              city?: string;
              region?: string;
              postal?: string;
              country?: string;
            } | null;
            return (
              <article key={o.id} className="ds-card" style={{ padding: 18 }}>
                <header
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    marginBottom: 14,
                    gap: 14,
                  }}
                >
                  <div>
                    <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>
                      {o.organization.name}
                      <span
                        className="mono"
                        style={{
                          marginLeft: 10,
                          fontSize: 11,
                          color: "var(--rl-muted)",
                          fontWeight: 400,
                        }}
                      >
                        order {o.id.slice(0, 8)}
                      </span>
                    </h3>
                    <p style={{ marginTop: 4, fontSize: 12.5, color: "var(--rl-muted)" }}>
                      {o.items.map((i) => `${i.quantity}× ${i.product.name}`).join(", ")}{" "}
                      <strong style={{ color: "var(--ink-2)" }}>
                        ${(o.totalCents / 100).toFixed(2)}
                      </strong>{" "}
                      {o.currency.toUpperCase()}
                    </p>
                  </div>
                  <Badge tone={o.status === "paid" ? "info" : "warn"}>{o.status}</Badge>
                </header>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 18,
                    fontSize: 13,
                    paddingBottom: 14,
                    borderBottom: "1px solid var(--line)",
                  }}
                >
                  <div>
                    <h4
                      style={{
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        color: "var(--rl-muted)",
                        marginBottom: 6,
                      }}
                    >
                      Ship to
                    </h4>
                    {a ? (
                      <address
                        style={{
                          fontStyle: "normal",
                          color: "var(--ink-2)",
                          fontSize: 12.5,
                          lineHeight: 1.55,
                        }}
                      >
                        {a.name && (
                          <>
                            {a.name}
                            <br />
                          </>
                        )}
                        {a.line1 && (
                          <>
                            {a.line1}
                            <br />
                          </>
                        )}
                        {a.line2 && (
                          <>
                            {a.line2}
                            <br />
                          </>
                        )}
                        {[a.city, a.region, a.postal].filter(Boolean).join(", ")}
                        <br />
                        {a.country}
                      </address>
                    ) : (
                      <p style={{ color: "var(--rl-muted)", fontSize: 12.5 }}>No address.</p>
                    )}
                  </div>
                  <div>
                    <h4
                      style={{
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        color: "var(--rl-muted)",
                        marginBottom: 6,
                      }}
                    >
                      Devices to print
                    </h4>
                    {o.devices.length === 0 ? (
                      <p style={{ color: "#a16207", fontSize: 12 }}>
                        ⚠ Not provisioned yet. Webhook may be in flight.
                      </p>
                    ) : (
                      <ul
                        style={{
                          listStyle: "none",
                          padding: 0,
                          margin: 0,
                          display: "flex",
                          flexDirection: "column",
                          gap: 3,
                        }}
                      >
                        {o.devices.map((d) => (
                          <li key={d.id}>
                            <a
                              href={`/api/devices/${d.id}/qr?format=png`}
                              target="_blank"
                              rel="noopener"
                              className="mono"
                              style={{
                                fontSize: 11.5,
                                color: "#4f46e5",
                                textDecoration: "none",
                              }}
                            >
                              {d.shortSlug} ↗ PNG
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <form
                  action={markShipped}
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "flex-end",
                    gap: 10,
                    paddingTop: 14,
                  }}
                >
                  <input type="hidden" name="orderId" value={o.id} />
                  <FormField label="Carrier">
                    <input
                      name="carrier"
                      placeholder="USPS / UPS / FedEx"
                      style={inputStyle}
                    />
                  </FormField>
                  <FormField label="Tracking #">
                    <input
                      name="trackingNumber"
                      placeholder="1Z..."
                      style={{ ...inputStyle, width: 220 }}
                    />
                  </FormField>
                  <button
                    type="submit"
                    style={{
                      marginLeft: "auto",
                      padding: "8px 14px",
                      borderRadius: 8,
                      border: "none",
                      background: "#15803d",
                      color: "#fff",
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    Mark shipped
                  </button>
                </form>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "7px 10px",
  borderRadius: 7,
  border: "1px solid var(--line)",
  background: "var(--surface)",
  fontSize: 12.5,
  width: 160,
};

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 10.5, color: "var(--rl-muted)", letterSpacing: "0.04em" }}>
        {label.toUpperCase()}
      </span>
      {children}
    </label>
  );
}
