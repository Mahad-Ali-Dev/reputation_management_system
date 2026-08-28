import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Badge } from "@/components/admin/admin-ui";
import { Icon } from "@/components/shell/icon";
import { refundHardwareOrder } from "@/lib/admin/refunds";
import { prisma } from "@/lib/db/client";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function RefundOrderPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const order = await prisma.hardwareOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      organizationId: true,
      status: true,
      totalCents: true,
      currency: true,
      stripePaymentIntentId: true,
      createdAt: true,
      organization: { select: { name: true } },
      items: {
        select: {
          id: true,
          quantity: true,
          unitPriceCents: true,
          product: { select: { name: true } },
        },
      },
    },
  });
  if (!order) notFound();

  const priorRefunds = await prisma.auditLog.findMany({
    where: {
      organizationId: order.organizationId,
      action: "hardware_order.refunded",
      resourceId: order.id,
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const alreadyRefundedCents = priorRefunds.reduce((sum, r) => {
    const after = (r.afterData ?? {}) as Record<string, unknown>;
    return sum + (typeof after.refundedCents === "number" ? after.refundedCents : 0);
  }, 0);
  const remaining = order.totalCents - alreadyRefundedCents;

  return (
    <div style={{ maxWidth: 760 }}>
      <Link
        href="/admin/refunds"
        style={{
          fontSize: 12,
          color: "var(--rl-muted)",
          textDecoration: "none",
          marginBottom: 8,
          display: "inline-block",
        }}
      >
        ← Refunds
      </Link>

      <AdminPageHeader
        title="Refund order"
        description={
          <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 14 }}>
            <span>
              <strong style={{ color: "var(--ink)" }}>{order.organization.name}</strong>
            </span>
            <span>
              <strong style={{ color: "var(--ink)" }}>
                ${(order.totalCents / 100).toFixed(2)}
              </strong>{" "}
              {order.currency.toUpperCase()}
            </span>
            <Badge tone="info">{order.status.replace(/_/g, " ")}</Badge>
          </span>
        }
      />

      {/* Order items */}
      <div className="ds-card" style={{ padding: 18, marginBottom: 14 }}>
        <h3 className="ds-card__title">Order items</h3>
        <ul
          style={{
            marginTop: 10,
            padding: 0,
            listStyle: "none",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            fontSize: 13,
          }}
        >
          {order.items.map((it) => (
            <li
              key={it.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "4px 0",
                color: "var(--ink-2)",
              }}
            >
              <span>
                {it.quantity} × {it.product.name}
              </span>
              <span>${((it.unitPriceCents * it.quantity) / 100).toFixed(2)}</span>
            </li>
          ))}
        </ul>
        <hr style={{ border: 0, borderTop: "1px solid var(--line)", margin: "10px 0" }} />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 14,
            fontWeight: 600,
            color: "var(--ink)",
          }}
        >
          <span>Total</span>
          <span>${(order.totalCents / 100).toFixed(2)}</span>
        </div>
        {alreadyRefundedCents > 0 && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 12.5,
              color: "var(--rl-muted)",
              marginTop: 6,
            }}
          >
            <span>Already refunded</span>
            <span>−${(alreadyRefundedCents / 100).toFixed(2)}</span>
          </div>
        )}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 13,
            fontWeight: 600,
            color: "#a16207",
            marginTop: 4,
          }}
        >
          <span>Refundable balance</span>
          <span>${(remaining / 100).toFixed(2)}</span>
        </div>
      </div>

      {/* Refund form */}
      {order.stripePaymentIntentId ? (
        <div
          className="ds-card"
          style={{
            padding: 18,
            marginBottom: 14,
            border: "1px solid #fde68a",
            background: "#fffbeb",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 8,
            }}
          >
            <Icon name="eye" size={14} style={{ color: "#a16207" }} />
            <h3
              className="ds-card__title"
              style={{ color: "#92400e", marginBottom: 0 }}
            >
              Issue refund
            </h3>
          </div>
          <p style={{ fontSize: 12.5, color: "#92400e", marginBottom: 14, lineHeight: 1.55 }}>
            This calls Stripe directly and refunds the customer. Audited, irreversible.
          </p>
          <form
            action={refundHardwareOrder}
            style={{ display: "flex", flexDirection: "column", gap: 12 }}
          >
            <input type="hidden" name="orderId" value={order.id} />

            <FormField label="Amount (cents)">
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  type="number"
                  name="amountCents"
                  step="1"
                  min="1"
                  max={remaining}
                  placeholder={`${remaining} (full remaining)`}
                  style={{ ...inputStyle, width: 180 }}
                />
                <span style={{ fontSize: 11.5, color: "#92400e" }}>
                  In cents. Blank = refund all ${(remaining / 100).toFixed(2)} remaining.
                </span>
              </div>
            </FormField>

            <FormField label="Reason">
              <select name="reason" required style={inputStyle}>
                <option value="requested_by_customer">Requested by customer</option>
                <option value="duplicate">Duplicate charge</option>
                <option value="fraudulent">Fraudulent</option>
              </select>
            </FormField>

            <FormField label="Internal note">
              <textarea
                name="internalNote"
                rows={2}
                maxLength={500}
                placeholder="Why we're issuing this link to support ticket, etc."
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </FormField>

            <button
              type="submit"
              style={{
                marginTop: 4,
                padding: "10px 18px",
                borderRadius: 8,
                border: "none",
                background: "#a16207",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                alignSelf: "flex-start",
              }}
            >
              Issue refund
            </button>
          </form>
        </div>
      ) : (
        <div
          className="ds-card"
          style={{
            padding: 18,
            marginBottom: 14,
            border: "1px solid #fecaca",
            background: "#fef2f2",
            fontSize: 13,
            color: "#7f1d1d",
          }}
        >
          This order has no Stripe PaymentIntent. Refund manually via Stripe Dashboard.
        </div>
      )}

      {/* Refund history */}
      {priorRefunds.length > 0 && (
        <div className="ds-card" style={{ padding: 18 }}>
          <h3 className="ds-card__title">Refund history</h3>
          <ul
            style={{
              marginTop: 10,
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {priorRefunds.map((r) => {
              const after = (r.afterData ?? {}) as Record<string, unknown>;
              const cents = typeof after.refundedCents === "number" ? after.refundedCents : 0;
              return (
                <li
                  key={r.id}
                  style={{
                    paddingBottom: 8,
                    borderBottom: "1px dashed var(--line)",
                    fontSize: 13,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      color: "var(--ink-2)",
                    }}
                  >
                    <strong>${(cents / 100).toFixed(2)} refunded</strong>
                    <span style={{ fontSize: 11.5, color: "var(--rl-muted)" }}>
                      {new Date(r.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {typeof after.internalNote === "string" && after.internalNote && (
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--rl-muted)",
                        marginTop: 2,
                        fontStyle: "italic",
                      }}
                    >
                      "{after.internalNote}"
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid var(--line)",
  background: "var(--surface)",
  fontSize: 13,
  outline: "none",
  width: "100%",
  color: "var(--ink)",
};

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 10.5, color: "#92400e", letterSpacing: "0.04em", fontWeight: 600 }}>
        {label.toUpperCase()}
      </span>
      {children}
    </label>
  );
}
