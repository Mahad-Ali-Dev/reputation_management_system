import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Icon } from "@/components/shell/icon";
import { prisma } from "@/lib/db/client";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function TenantsListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; plan?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const plan = sp.plan ?? "";

  // Top counters + tenant list in one batch.
  const [tenants, totalCount, planCounts] = await Promise.all([
    prisma.organization.findMany({
      where: {
        deletedAt: null,
        ...(q && {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { slug: { contains: q.toLowerCase() } },
          ],
        }),
        ...(plan && { plan }),
      },
      include: {
        _count: { select: { memberships: true, establishments: true } },
        subscription: { select: { status: true, currentPeriodEnd: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.organization.count({ where: { deletedAt: null } }),
    prisma.organization.groupBy({
      by: ["plan"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
  ]);

  const counts: Record<string, number> = Object.fromEntries(
    planCounts.map((p) => [p.plan, p._count._all]),
  );

  return (
    <>
      <AdminPageHeader
        title="Organizations"
        description="Every tenant on the platform. Click through to impersonate, change plan, or inspect activity."
        actions={
          <Link
            href="/admin/audit"
            className="btn"
            style={{
              fontSize: 12,
              padding: "6px 12px",
              borderRadius: 8,
              border: "1px solid var(--line)",
              background: "var(--surface)",
              color: "var(--ink-2)",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Icon name="lock" size={11} />
            View audit log
          </Link>
        }
      />

      {/* KPI strip */}
      <div className="grid-4" style={{ gap: 12, marginBottom: 18 }}>
        <KpiCard l="Total orgs" v={String(totalCount)} d="all-time, excl. deleted" />
        <KpiCard l="Pro" v={String(counts.pro ?? 0)} d="paying customers" up />
        <KpiCard l="Trial" v={String(counts.trial ?? 0)} d="≤14d in" />
        <KpiCard l="Free" v={String(counts.free ?? 0)} d="self-served, no card" />
      </div>

      {/* Filters */}
      <form
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 14,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div style={{ position: "relative", flex: 1, maxWidth: 360 }}>
          <Icon
            name="search"
            size={13}
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--rl-muted)",
            }}
          />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search by name or slug…"
            style={{
              width: "100%",
              padding: "8px 12px 8px 30px",
              borderRadius: 8,
              border: "1px solid var(--line)",
              background: "var(--surface)",
              fontSize: 13,
              outline: "none",
            }}
          />
        </div>
        <PlanSeg current={plan} q={q} />
        <button
          type="submit"
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "none",
            background: "var(--ink)",
            color: "#fff",
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Apply
        </button>
        <span
          className="mono dim"
          style={{ fontSize: 10.5, marginLeft: "auto", color: "var(--rl-muted)" }}
        >
          SHOWING {tenants.length} OF {totalCount}
        </span>
      </form>

      {/* Table */}
      <div className="ds-card" style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--surface-2, #fafbf8)" }}>
              <Th>Name</Th>
              <Th>Plan</Th>
              <Th>Subscription</Th>
              <Th align="right">Members</Th>
              <Th align="right">Estabs</Th>
              <Th>Created</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {tenants.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  style={{
                    padding: 60,
                    textAlign: "center",
                    color: "var(--rl-muted)",
                    fontSize: 13,
                  }}
                >
                  No organizations match those filters.
                </td>
              </tr>
            ) : (
              tenants.map((t) => (
                <tr
                  key={t.id}
                  style={{
                    borderTop: "1px solid var(--line)",
                  }}
                >
                  <Td>
                    <Link
                      href={`/admin/tenants/${t.id}`}
                      style={{
                        color: "var(--ink)",
                        fontWeight: 600,
                        textDecoration: "none",
                      }}
                    >
                      {t.name}
                    </Link>
                    <div className="mono" style={{ fontSize: 10.5, color: "var(--rl-muted)" }}>
                      {t.slug}
                    </div>
                  </Td>
                  <Td>
                    <PlanBadge plan={t.plan} />
                  </Td>
                  <Td>
                    {t.subscription?.status ? (
                      <SubBadge status={t.subscription.status} />
                    ) : (
                      <span style={{ color: "var(--rl-muted)" }}>—</span>
                    )}
                  </Td>
                  <Td align="right">{t._count.memberships}</Td>
                  <Td align="right">{t._count.establishments}</Td>
                  <Td>
                    <span className="mono" style={{ fontSize: 11.5 }}>
                      {t.createdAt.toISOString().slice(0, 10)}
                    </span>
                  </Td>
                  <Td align="right">
                    <Link
                      href={`/admin/tenants/${t.id}`}
                      style={{
                        color: "#4f46e5",
                        fontSize: 12,
                        textDecoration: "none",
                        fontWeight: 500,
                      }}
                    >
                      Open →
                    </Link>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function PlanSeg({ current, q }: { current: string; q: string }) {
  const opts = [
    { v: "", l: "All" },
    { v: "pro", l: "Pro" },
    { v: "trial", l: "Trial" },
    { v: "free", l: "Free" },
    { v: "suspended", l: "Suspended" },
  ];
  return (
    <div
      style={{
        display: "inline-flex",
        background: "var(--surface-2, #fafbf8)",
        border: "1px solid var(--line)",
        borderRadius: 8,
        padding: 2,
      }}
    >
      {opts.map((o) => {
        const active = current === o.v;
        const href = `/admin/tenants?${new URLSearchParams({ ...(q && { q }), ...(o.v && { plan: o.v }) })}`;
        return (
          <Link
            key={o.v || "all"}
            href={href}
            style={{
              padding: "5px 10px",
              fontSize: 11.5,
              borderRadius: 6,
              fontWeight: active ? 600 : 500,
              color: active ? "var(--ink)" : "var(--ink-2)",
              background: active ? "var(--surface)" : "transparent",
              textDecoration: "none",
              boxShadow: active ? "0 1px 2px rgba(0,0,0,.05)" : "none",
            }}
          >
            {o.l}
          </Link>
        );
      })}
    </div>
  );
}

function PlanBadge({ plan }: { plan: string }) {
  const palette: Record<string, { bg: string; fg: string }> = {
    pro: { bg: "#dcfce7", fg: "#15803d" },
    trial: { bg: "#fef3c7", fg: "#a16207" },
    free: { bg: "#f1f5f9", fg: "#475569" },
    suspended: { bg: "#fee2e2", fg: "#b91c1c" },
  };
  const c = palette[plan] ?? palette.free!;
  return (
    <span
      style={{
        background: c.bg,
        color: c.fg,
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 10.5,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
      }}
    >
      {plan}
    </span>
  );
}

function SubBadge({ status }: { status: string }) {
  const palette: Record<string, { bg: string; fg: string }> = {
    active: { bg: "#dcfce7", fg: "#15803d" },
    trialing: { bg: "#dbeafe", fg: "#1d4ed8" },
    past_due: { bg: "#fef3c7", fg: "#a16207" },
    canceled: { bg: "#fee2e2", fg: "#b91c1c" },
    unpaid: { bg: "#fee2e2", fg: "#b91c1c" },
  };
  const c = palette[status] ?? { bg: "#f1f5f9", fg: "#475569" };
  return (
    <span
      style={{
        background: c.bg,
        color: c.fg,
        padding: "2px 7px",
        borderRadius: 4,
        fontSize: 10.5,
        fontWeight: 600,
      }}
    >
      {status.replace("_", " ")}
    </span>
  );
}

function Th({ children, align }: { children?: React.ReactNode; align?: "right" }) {
  return (
    <th
      style={{
        padding: "10px 14px",
        textAlign: align ?? "left",
        fontSize: 10.5,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: "var(--rl-muted)",
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, align }: { children?: React.ReactNode; align?: "right" }) {
  return (
    <td
      style={{
        padding: "12px 14px",
        textAlign: align ?? "left",
        color: "var(--ink-2)",
        verticalAlign: "middle",
      }}
    >
      {children}
    </td>
  );
}

function KpiCard({ l, v, d, up }: { l: string; v: string; d: string; up?: boolean }) {
  return (
    <div className="ds-card">
      <div className="stat">
        <div className="stat__label">{l}</div>
        <div className="stat__value">{v}</div>
        <div className={`stat__delta${up ? " up" : ""}`}>{d}</div>
      </div>
    </div>
  );
}
