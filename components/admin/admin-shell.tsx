import { Icon, type IconName } from "@/components/shell/icon";
import Image from "next/image";
import Link from "next/link";

/**
 * Admin shell — v3 "internal command center" chrome (matches
 * tasks/premium-ui-redesign/07_admin-console.png).
 *
 * The internal console gets a distinct, premium identity:
 *   - Deep-slate (navy) sidebar with a white brand lockup + "Admin" pill
 *   - Active nav row = subtle white-tint fill + white text
 *   - Cool light page surface; topbar/banners stay v3
 *
 * Layout mirrors the tenant <AppShell> grid so muscle memory transfers; only
 * the palette differs (dark rail vs. white rail) to flag "you are in admin".
 */

// Deep slate navy rail (matches artboard #101820; sits a touch darker than --ink).
const RAIL = "#0f172a";
const RAIL_LINE = "rgba(255,255,255,.08)";
const RAIL_MUTED = "#94a3b8";
const RAIL_TEXT = "#cbd5e1";
const RAIL_ACTIVE_BG = "rgba(255,255,255,.10)";

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
      {/* ---- Sidebar (deep-slate rail) ---- */}
      <aside
        style={{
          borderRight: `1px solid ${RAIL_LINE}`,
          background: RAIL,
          color: RAIL_TEXT,
          padding: "20px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
          position: "sticky",
          top: 0,
          height: "100vh",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <Image
            src="/favicon.png?v=2"
            alt=""
            width={34}
            height={34}
            priority
            style={{ borderRadius: 9, objectFit: "contain", background: "#fff", padding: 3 }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.02em", color: "#fff" }}>
              repu<span style={{ color: "#5eead4" }}>labs</span>
            </span>
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.12em",
                color: "#93c5fd",
                background: "rgba(37,99,235,.22)",
                padding: "1px 7px",
                borderRadius: 999,
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
                  letterSpacing: "0.12em",
                  color: RAIL_MUTED,
                  textTransform: "uppercase",
                  padding: "0 8px 7px",
                }}
              >
                {group.group}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {group.items.map((item) => {
                  const active =
                    pathname === item.href ||
                    (item.href !== "/admin" && pathname.startsWith(`${item.href}/`));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 9,
                        padding: "8px 10px",
                        borderRadius: 8,
                        fontSize: 13,
                        color: active ? "#fff" : RAIL_TEXT,
                        background: active ? RAIL_ACTIVE_BG : "transparent",
                        fontWeight: active ? 600 : 500,
                        textDecoration: "none",
                        transition: "background 120ms ease, color 120ms ease",
                      }}
                    >
                      <Icon
                        name={item.icon}
                        size={14}
                        style={{ color: active ? "#5eead4" : RAIL_MUTED }}
                      />
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
            padding: "14px 8px 4px",
            borderTop: `1px solid ${RAIL_LINE}`,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 500 }}>{session.email}</span>
            <span
              style={{
                fontSize: 10,
                color: RAIL_MUTED,
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
                padding: "7px 10px",
                fontSize: 11.5,
                fontWeight: 500,
                border: `1px solid ${RAIL_LINE}`,
                background: "rgba(255,255,255,.05)",
                borderRadius: 8,
                color: RAIL_TEXT,
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

        <main className="admin-main">{children}</main>
      </div>
    </div>
  );
}
