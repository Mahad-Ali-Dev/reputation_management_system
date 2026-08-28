import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Badge, KpiCard } from "@/components/admin/admin-ui";
import { Icon } from "@/components/shell/icon";
import { Stars } from "@/components/shell/stars";
import { getAdminSession } from "@/lib/admin/session";
import { prisma } from "@/lib/db/client";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getAdminSession();
  if (!session) return null;

  const org = await prisma.organization.findUnique({
    where: { id },
    include: {
      subscription: true,
      memberships: { include: { user: { select: { email: true, name: true } } } },
      establishments: { where: { deletedAt: null } },
      _count: { select: { hardwareOrders: true } },
    },
  });
  if (!org) notFound();

  const [reviews, replies, orders, audit] = await Promise.all([
    prisma.review.findMany({
      where: { organizationId: id },
      orderBy: { postedAt: "desc" },
      take: 10,
      include: { establishment: { select: { name: true } } },
    }),
    prisma.reviewReply.count({ where: { organizationId: id } }),
    prisma.hardwareOrder.findMany({
      where: { organizationId: id },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.auditLog.findMany({
      where: { organizationId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <>
      <Link
        href="/admin/tenants"
        style={{
          fontSize: 12,
          color: "var(--rl-muted)",
          textDecoration: "none",
          marginBottom: 8,
          display: "inline-block",
        }}
      >
        ← Tenants
      </Link>

      <AdminPageHeader
        title={org.name}
        description={
          <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 14 }}>
            <span>
              <code className="mono" style={chipCode}>
                {org.slug}
              </code>
            </span>
            <span>
              plan{" "}
              <strong style={{ color: "var(--ink)" }}>{org.plan.toUpperCase()}</strong>
            </span>
            <span>
              trial ends{" "}
              <strong style={{ color: "var(--ink)" }}>
                {org.trialEndsAt?.toISOString().slice(0, 10) ?? "—"}
              </strong>
            </span>
            <span>
              stripe{" "}
              <code className="mono" style={chipCode}>
                {org.stripeCustomerId ?? "—"}
              </code>
            </span>
          </span>
        }
        actions={
          <ImpersonateForm orgId={org.id} disabled={!!session.imp} />
        }
      />

      <div className="grid-4" style={{ gap: 12, marginBottom: 18 }}>
        <KpiCard l="Members" v={String(org.memberships.length)} d="users on the team" />
        <KpiCard
          l="Listings"
          v={String(org.establishments.length)}
          d="locations"
        />
        <KpiCard
          l="Hardware orders"
          v={String(org._count.hardwareOrders)}
          d="all-time"
        />
        <KpiCard l="Replies sent" v={String(replies)} d="across all reviews" />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: 14,
          marginBottom: 14,
        }}
      >
        {/* Members card */}
        <div className="ds-card" style={{ padding: 18 }}>
          <h3 className="ds-card__title">Members</h3>
          <ul
            style={{
              marginTop: 10,
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {org.memberships.length === 0 && (
              <li style={{ fontSize: 13, color: "var(--rl-muted)" }}>No members.</li>
            )}
            {org.memberships.map((m) => (
              <li
                key={m.id}
                style={{
                  fontSize: 13,
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "4px 0",
                }}
              >
                <span style={{ color: "var(--ink-2)" }}>
                  <strong style={{ color: "var(--ink)" }}>
                    {m.user.name ?? m.user.email}
                  </strong>
                  {m.user.name && (
                    <span style={{ color: "var(--rl-muted)", marginLeft: 6 }}>
                      {m.user.email}
                    </span>
                  )}
                </span>
                <Badge tone="info" uppercase={false}>
                  {m.role}
                </Badge>
              </li>
            ))}
          </ul>
        </div>

        {/* Listings card */}
        <div className="ds-card" style={{ padding: 18 }}>
          <h3 className="ds-card__title">Listings</h3>
          <ul
            style={{
              marginTop: 10,
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {org.establishments.length === 0 && (
              <li style={{ fontSize: 13, color: "var(--rl-muted)" }}>None.</li>
            )}
            {org.establishments.map((e) => (
              <li
                key={e.id}
                style={{
                  fontSize: 13,
                  color: "var(--ink-2)",
                  padding: "4px 0",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Icon name="pin" size={11} />
                {e.name}
                {e.category && (
                  <span style={{ color: "var(--rl-muted)", fontSize: 11.5 }}>
                    · {e.category}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Hardware orders */}
      <div className="ds-card" style={{ padding: 18, marginBottom: 14 }}>
        <h3 className="ds-card__title">Recent hardware orders</h3>
        <ul
          style={{
            marginTop: 10,
            padding: 0,
            listStyle: "none",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {orders.length === 0 && (
            <li style={{ fontSize: 13, color: "var(--rl-muted)" }}>No orders.</li>
          )}
          {orders.map((o) => (
            <li
              key={o.id}
              style={{
                fontSize: 13,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "6px 0",
                borderBottom: "1px dashed var(--line)",
              }}
            >
              <span className="mono" style={{ fontSize: 11.5, color: "var(--rl-muted)" }}>
                {o.id.slice(0, 8)}
              </span>
              <Badge tone={o.status === "delivered" ? "ok" : "info"} uppercase={false}>
                {o.status.replace(/_/g, " ")}
              </Badge>
              <span style={{ color: "var(--ink-2)" }}>
                ${(o.totalCents / 100).toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Recent reviews */}
      <div className="ds-card" style={{ padding: 18, marginBottom: 14 }}>
        <h3 className="ds-card__title">
          Recent reviews ({reviews.length}, {replies} replies total)
        </h3>
        <ul
          style={{
            marginTop: 10,
            padding: 0,
            listStyle: "none",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {reviews.length === 0 && (
            <li style={{ fontSize: 13, color: "var(--rl-muted)" }}>No reviews.</li>
          )}
          {reviews.map((r) => (
            <li
              key={r.id}
              style={{
                borderLeft: "3px solid var(--pri, #2563eb)",
                paddingLeft: 12,
                fontSize: 13,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  color: "var(--rl-muted)",
                  fontSize: 11.5,
                }}
              >
                <Stars value={r.rating} size={10} />
                <span>{r.establishment.name}</span>
                <span>·</span>
                <span>{r.reviewerName ?? "anonymous"}</span>
                <span>·</span>
                <span className="mono">{r.postedAt.toISOString().slice(0, 10)}</span>
              </div>
              <p
                style={{
                  marginTop: 4,
                  color: "var(--ink-2)",
                  lineHeight: 1.55,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {r.body ?? "(no body)"}
              </p>
            </li>
          ))}
        </ul>
      </div>

      {/* Audit log */}
      <div className="ds-card" style={{ padding: 18 }}>
        <h3 className="ds-card__title">Recent audit log</h3>
        <ul
          style={{
            marginTop: 10,
            padding: 0,
            listStyle: "none",
            display: "flex",
            flexDirection: "column",
            gap: 2,
            fontFamily: "var(--f-mono)",
            fontSize: 11.5,
          }}
        >
          {audit.length === 0 && (
            <li style={{ color: "var(--rl-muted)" }}>No activity.</li>
          )}
          {audit.map((a) => (
            <li
              key={a.id}
              style={{
                padding: "3px 0",
                color: "var(--rl-muted)",
                display: "flex",
                gap: 10,
              }}
            >
              <span style={{ color: "var(--rl-muted)" }}>
                {a.createdAt.toISOString().slice(11, 19)}
              </span>
              <span style={{ color: "var(--ink-2)", fontWeight: 500 }}>{a.action}</span>
              <span>
                by {a.actorType}:{a.actorId.slice(0, 8)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function ImpersonateForm({ orgId, disabled }: { orgId: string; disabled: boolean }) {
  return (
    <form
      action="/api/admin/impersonate"
      method="POST"
      style={{ display: "flex", gap: 8, alignItems: "flex-end" }}
    >
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="action" value="start" />
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 10.5, color: "var(--rl-muted)", letterSpacing: "0.04em" }}>
          REASON (REQUIRED)
        </span>
        <input
          name="reason"
          required
          minLength={6}
          placeholder="ticket #1234 debugging"
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid var(--line)",
            background: "var(--surface)",
            fontSize: 12.5,
            width: 280,
            outline: "none",
          }}
        />
      </label>
      <button
        type="submit"
        disabled={disabled}
        style={{
          padding: "8px 14px",
          borderRadius: 8,
          border: "none",
          background: disabled ? "var(--rl-muted)" : "#a16207",
          color: "#fff",
          fontSize: 12.5,
          fontWeight: 600,
          cursor: disabled ? "default" : "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <Icon name="eye" size={11} />
        Impersonate (read-only)
      </button>
    </form>
  );
}

const chipCode: React.CSSProperties = {
  background: "var(--surface-2, #fafbf8)",
  padding: "1px 6px",
  borderRadius: 4,
  fontSize: 11.5,
};
