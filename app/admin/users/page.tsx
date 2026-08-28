import { AdminPageHeader } from "@/components/admin/admin-page-header";
import {
  ActionLink,
  Badge,
  CountChip,
  KpiCard,
  SearchInput,
  SubmitButton,
  TableCard,
  THead,
  Th,
  Td,
} from "@/components/admin/admin-ui";
import { prisma } from "@/lib/db/client";
import Link from "next/link";

/**
 * Admin: all users across all tenants.
 *
 * Lists every registered User with their memberships, last login, and
 * deep-link to the tenant detail page. Admins launch impersonation from
 * the per-tenant page (audit-logged with a mandatory reason).
 */

export const dynamic = "force-dynamic";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();

  const [users, totalUsers, verifiedCount, activeSessions] = await Promise.all([
    prisma.user.findMany({
      where: q
        ? {
            OR: [
              { email: { contains: q, mode: "insensitive" } },
              { name: { contains: q, mode: "insensitive" } },
            ],
          }
        : undefined,
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        email: true,
        name: true,
        emailVerified: true,
        lastLoginAt: true,
        createdAt: true,
        memberships: {
          select: {
            role: true,
            organization: { select: { id: true, name: true, plan: true } },
          },
        },
        _count: { select: { sessions: true } },
      },
    }),
    prisma.user.count(),
    prisma.user.count({ where: { emailVerified: { not: null } } }),
    prisma.session.count({
      where: { expires: { gt: new Date() } },
    }),
  ]);

  const verifiedPct = totalUsers > 0 ? Math.round((verifiedCount / totalUsers) * 100) : 0;

  return (
    <>
      <AdminPageHeader
        title="Users"
        description="Every registered user across the platform. Click a tenant chip to open it; impersonation lives on the tenant detail page."
        actions={
          <ActionLink href="/admin/tenants" icon="users">
            Browse tenants
          </ActionLink>
        }
      />

      {/* KPI strip */}
      <div className="grid-4" style={{ gap: 12, marginBottom: 18 }}>
        <KpiCard l="Total users" v={totalUsers.toLocaleString()} d="all-time signups" />
        <KpiCard l="Email-verified" v={`${verifiedPct}%`} d={`${verifiedCount.toLocaleString()} of total`} up />
        <KpiCard
          l="Active sessions"
          v={activeSessions.toLocaleString()}
          d="non-expired session rows"
        />
        <KpiCard
          l="In view"
          v={String(users.length)}
          d={q ? `matching "${q}"` : "200 most recent"}
        />
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
        <SearchInput name="q" defaultValue={q} placeholder="Search by email or name…" />
        <SubmitButton>Search</SubmitButton>
        {q && (
          <Link
            href="/admin/users"
            style={{
              fontSize: 12,
              color: "var(--rl-muted)",
              textDecoration: "underline",
              marginLeft: 4,
            }}
          >
            Reset
          </Link>
        )}
        <CountChip left={users.length} right={totalUsers} />
      </form>

      <TableCard empty={users.length === 0} emptyText="No users match that filter.">
        <THead>
          <Th>Email</Th>
          <Th>Name</Th>
          <Th>Tenants</Th>
          <Th>Last login</Th>
          <Th>Joined</Th>
          <Th align="right">Sessions</Th>
          <Th />
        </THead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} style={{ borderTop: "1px solid var(--line)" }}>
              <Td mono>
                {u.email ?? "—"}
                {u.emailVerified && (
                  <span
                    title={`Verified ${new Date(u.emailVerified).toLocaleDateString()}`}
                    style={{
                      marginLeft: 6,
                      display: "inline-flex",
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      background: "#dcfce7",
                      color: "#15803d",
                      fontSize: 9,
                      fontWeight: 700,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    ✓
                  </span>
                )}
              </Td>
              <Td>{u.name ?? <span style={{ color: "var(--rl-muted)" }}>—</span>}</Td>
              <Td>
                {u.memberships.length === 0 ? (
                  <span style={{ color: "var(--rl-muted)" }}>none</span>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {u.memberships.map((m) => (
                      <Link
                        key={m.organization.id}
                        href={`/admin/tenants/${m.organization.id}`}
                        style={{
                          fontSize: 11,
                          padding: "2px 8px",
                          borderRadius: 999,
                          background: "var(--surface-2, #fafbf8)",
                          border: "1px solid var(--line)",
                          color: "var(--ink-2)",
                          textDecoration: "none",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        {m.organization.name}
                        <span
                          className="mono"
                          style={{ fontSize: 9, color: "var(--rl-muted)" }}
                        >
                          {m.role}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </Td>
              <Td>
                <span style={{ fontSize: 11.5, color: "var(--rl-muted)" }}>
                  {u.lastLoginAt ? relativeTime(u.lastLoginAt) : "never"}
                </span>
              </Td>
              <Td>
                <span style={{ fontSize: 11.5, color: "var(--rl-muted)" }}>
                  {relativeTime(u.createdAt)}
                </span>
              </Td>
              <Td align="right">
                {u._count.sessions > 0 ? (
                  <Badge tone="ok" uppercase={false}>
                    {u._count.sessions} active
                  </Badge>
                ) : (
                  <span style={{ color: "var(--rl-muted)" }}>—</span>
                )}
              </Td>
              <Td align="right">
                {u.memberships[0] && (
                  <Link
                    href={`/admin/tenants/${u.memberships[0].organization.id}`}
                    style={{
                      color: "#4f46e5",
                      fontSize: 12,
                      textDecoration: "none",
                      fontWeight: 500,
                    }}
                  >
                    Open →
                  </Link>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </TableCard>

      <p style={{ marginTop: 14, fontSize: 11.5, color: "var(--rl-muted)" }}>
        Showing the 200 most-recently-created matching users. Impersonation is launched from a
        tenant's detail page (audit-logged with a mandatory reason).
      </p>
    </>
  );
}

function relativeTime(d: Date): string {
  const ms = Date.now() - d.getTime();
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}
