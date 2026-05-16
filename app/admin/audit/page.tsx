import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { KpiCard, SubmitButton, TableCard, THead, Th, Td } from "@/components/admin/admin-ui";
import { prisma } from "@/lib/db/client";
import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * Audit log search. Three filterable inputs:
 *   - org   — exact organizationId (UUID)
 *   - action — substring match (e.g. "review.reply", "stripe", "user.invite")
 *   - actor  — exact actorId (UUID)
 *
 * Always returns most-recent 200 matches. CSV export + pagination is a follow-up.
 */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; action?: string; actor?: string }>;
}) {
  const sp = await searchParams;

  const [rows, total24h] = await Promise.all([
    prisma.auditLog.findMany({
      where: {
        ...(sp.org && /^[0-9a-f-]{36}$/i.test(sp.org) && { organizationId: sp.org }),
        ...(sp.action && { action: { contains: sp.action } }),
        ...(sp.actor && /^[0-9a-f-]{36}$/i.test(sp.actor) && { actorId: sp.actor }),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.auditLog.count({
      where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    }),
  ]);

  const adminActions = rows.filter((r) => r.actorType === "admin_user").length;
  const filtered = !!(sp.org || sp.action || sp.actor);

  return (
    <>
      <AdminPageHeader
        title="Audit log"
        description="Every privileged action — admin impersonation, plan changes, refunds, OAuth credential changes, feature-flag toggles. Hash-chained per the security review."
      />

      <div className="grid-4" style={{ gap: 12, marginBottom: 18 }}>
        <KpiCard l="In view" v={String(rows.length)} d={filtered ? "matching filter" : "most recent"} />
        <KpiCard l="Last 24h" v={String(total24h)} d="all actions across platform" />
        <KpiCard l="By admins" v={String(adminActions)} d="in current view" />
        <KpiCard l="Tamper-evident" v="✓" d="hash-chained, see /scripts/verify-audit-chain" />
      </div>

      <form
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 14,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <input
          name="org"
          defaultValue={sp.org ?? ""}
          placeholder="organization_id (UUID)"
          className="mono"
          style={{ ...inputStyle, width: 320 }}
        />
        <input
          name="action"
          defaultValue={sp.action ?? ""}
          placeholder='action filter (e.g. "review.reply")'
          style={{ ...inputStyle, width: 280 }}
        />
        <input
          name="actor"
          defaultValue={sp.actor ?? ""}
          placeholder="actor_id (UUID)"
          className="mono"
          style={{ ...inputStyle, width: 320 }}
        />
        <SubmitButton>Filter</SubmitButton>
        {filtered && (
          <Link
            href="/admin/audit"
            style={{
              fontSize: 12,
              color: "var(--rl-muted)",
              textDecoration: "underline",
            }}
          >
            Reset
          </Link>
        )}
      </form>

      <TableCard empty={rows.length === 0} emptyText="No matching audit rows.">
        <THead>
          <Th>When</Th>
          <Th>Actor</Th>
          <Th>Action</Th>
          <Th>Org</Th>
          <Th>Resource</Th>
          <Th>IP</Th>
        </THead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderTop: "1px solid var(--line)" }}>
              <Td mono>
                <span style={{ whiteSpace: "nowrap" }}>
                  {r.createdAt.toISOString().replace("T", " ").slice(0, 19)}
                </span>
              </Td>
              <Td>
                <span
                  style={{
                    fontSize: 11.5,
                    color: r.actorType === "admin_user" ? "#4338ca" : "var(--ink-2)",
                    fontWeight: r.actorType === "admin_user" ? 600 : 400,
                  }}
                >
                  {r.actorType}
                </span>
                <span className="mono" style={{ fontSize: 11, color: "var(--rl-muted)", marginLeft: 4 }}>
                  :{r.actorId.slice(0, 8)}
                </span>
              </Td>
              <Td>
                <code
                  className="mono"
                  style={{
                    fontSize: 11.5,
                    color: "var(--ink-2)",
                    background: "var(--surface-2, #fafbf8)",
                    padding: "1px 6px",
                    borderRadius: 4,
                  }}
                >
                  {r.action}
                </code>
              </Td>
              <Td mono>{r.organizationId?.slice(0, 8) ?? "—"}</Td>
              <Td mono>
                {r.resourceType ? `${r.resourceType}:${r.resourceId?.slice(0, 8) ?? ""}` : "—"}
              </Td>
              <Td mono>{(r.ip as string | null) ?? "—"}</Td>
            </tr>
          ))}
        </tbody>
      </TableCard>

      <p style={{ marginTop: 14, fontSize: 11.5, color: "var(--rl-muted)" }}>
        Showing up to 200 most-recent rows. Run{" "}
        <code className="mono" style={chipCode}>
          pnpm audit:verify
        </code>{" "}
        to re-validate the hash chain.
      </p>
    </>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid var(--line)",
  background: "var(--surface)",
  fontSize: 12.5,
  outline: "none",
};

const chipCode: React.CSSProperties = {
  background: "var(--surface-2, #fafbf8)",
  padding: "1px 6px",
  borderRadius: 4,
  fontSize: 11.5,
};
