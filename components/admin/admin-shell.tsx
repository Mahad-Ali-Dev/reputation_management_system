import { Icon, type IconName } from "@/components/shell/icon";
import { Logo } from "@/components/shell/logo";
import Link from "next/link";

/**
 * Admin shell — sidebar + topbar in the v2 light design system, matching the
 * tenant-facing app. The "Admin" identity is signalled with:
 *   - Indigo accent strip on the active nav row
 *   - "ADMIN" pill in the brand area
 *   - A subtle indigo top border on the page surface
 *
 * Layout is identical to the tenant <AppShell> so muscle memory transfers.
 */

type NavItem = { href: string; label: string; icon: IconName };

const NAV: Array<{ group: string; items: NavItem[] }> = [
  {
    group: "Tenants",
    items: [
      { href: "/admin/tenants", label: "Organizations", icon: "users" },
      { href: "/admin/users", label: "Users", icon: "user" },
    ],
  },
  {
    group: "Revenue",
    items: [
      { href: "/admin/mrr", label: "MRR snapshot", icon: "bars" },
      { href: "/admin/refunds", label: "Refunds", icon: "card" },
    ],
  },
  {
    group: "Operations",
    items: [
      { href: "/admin/hardware", label: "Hardware batches", icon: "qr" },
      { href: "/admin/fulfillment", label: "Fulfillment", icon: "box" },
      { href: "/admin/flags", label: "Feature flags", icon: "flag" },
      { href: "/admin/providers", label: "OAuth providers", icon: "plug" },
      { href: "/admin/audit", label: "Audit log", icon: "lock" },
    ],
  },
];

export function AdminShell({
  children,
  pathname,
  session,
  topBar,
}: {
  children: React.ReactNode;
  pathname: string;
  session: { email: string; role: string; imp?: { orgId: string; reason: string } };
  topBar?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "240px minmax(0, 1fr)",
        minHeight: "100vh",
        background: "var(--bg, #f6f7f4)",
        color: "var(--ink, #0b0d0e)",
        fontFamily: "var(--f-ui)",
      }}
    >
      {/* ---- Sidebar ---- */}
      <aside
        style={{
          borderRight: "1px solid var(--line, #eceeea)",
          background: "var(--surface, #fff)",
          padding: "18px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 18,
          position: "sticky",
          top: 0,
          height: "100vh",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Logo mode="mark" size={32} />
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.02em" }}>
              repulabs
            </span>
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.12em",
                color: "#6366f1",
                background: "#eef2ff",
                padding: "1px 6px",
                borderRadius: 4,
                width: "fit-content",
              }}
            >
              ADMIN
            </span>
          </div>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {NAV.map((group) => (
            <div key={group.group}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.1em",
                  color: "var(--rl-muted, #94a3b8)",
                  textTransform: "uppercase",
                  padding: "0 8px 6px",
                }}
              >
                {group.group}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {group.items.map((item) => {
                  const active =
                    pathname === item.href ||
                    (item.href !== "/admin" && pathname.startsWith(`${item.href}/`));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 9,
                        padding: "7px 8px",
                        borderRadius: 7,
                        fontSize: 13,
                        color: active ? "#4f46e5" : "var(--ink-2, #334155)",
                        background: active ? "#eef2ff" : "transparent",
                        fontWeight: active ? 600 : 500,
                        textDecoration: "none",
                        transition: "background 120ms ease",
                      }}
                    >
                      <Icon name={item.icon} size={14} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div
          style={{
            marginTop: "auto",
            padding: "12px 8px",
            borderTop: "1px solid var(--line)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 12, color: "var(--ink-2)", fontWeight: 500 }}>
              {session.email}
            </span>
            <span
              style={{
                fontSize: 10,
                color: "var(--rl-muted)",
                textTransform: "capitalize",
              }}
            >
              {session.role.replace("_", " ")}
            </span>
          </div>
          <form action="/api/admin/logout" method="POST">
            <button
              type="submit"
              style={{
                width: "100%",
                padding: "6px 10px",
                fontSize: 11.5,
                border: "1px solid var(--line)",
                background: "var(--surface-2, #fafbf8)",
                borderRadius: 6,
                color: "var(--ink-2)",
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Icon name="arrowR" size={11} />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* ---- Main column ---- */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          borderTop: "3px solid #6366f1",
        }}
      >
        {topBar && (
          <div
            style={{
              borderBottom: "1px solid var(--line)",
              background: "var(--surface)",
              padding: "0 24px",
              height: 52,
              display: "flex",
              alignItems: "center",
              gap: 12,
              position: "sticky",
              top: 0,
              zIndex: 5,
            }}
          >
            {topBar}
          </div>
        )}

        {/* Impersonation warning banner */}
        {session.imp && (
          <div
            style={{
              background: "#fffbeb",
              borderBottom: "1px solid #fde68a",
              padding: "10px 24px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontSize: 12.5,
              color: "#92400e",
            }}
          >
            <Icon name="eye" size={13} />
            <span>
              Viewing tenant{" "}
              <code
                className="mono"
                style={{
                  background: "#fef3c7",
                  padding: "1px 5px",
                  borderRadius: 4,
                }}
              >
                {session.imp.orgId.slice(0, 8)}
              </code>{" "}
              read-only — reason: <strong>{session.imp.reason}</strong>
            </span>
            <form action="/api/admin/impersonate" method="POST" style={{ marginLeft: "auto" }}>
              <input type="hidden" name="action" value="end" />
              <button
                type="submit"
                style={{
                  border: "none",
                  background: "transparent",
                  color: "#92400e",
                  textDecoration: "underline",
                  cursor: "pointer",
                  fontSize: 12.5,
                  fontWeight: 500,
                }}
              >
                End impersonation
              </button>
            </form>
          </div>
        )}

        <main style={{ flex: 1, padding: "24px 32px", minWidth: 0 }}>{children}</main>
      </div>
    </div>
  );
}
