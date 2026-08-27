import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/shell/icon";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import Link from "next/link";

/**
 * Phone calls index — the "View all" target from the phone dashboard's
 * "Recent calls" card. Lists the org's recent calls, each linking to its
 * detail page at /phone/calls/[id].
 */

export const dynamic = "force-dynamic";

export default async function PhoneCallsPage() {
  const { orgId } = await getOrgContext();

  // Fail-soft: a transient DB error / pre-migration window must not 500 the page.
  let calls: Awaited<ReturnType<typeof loadCalls>> = [];
  const loadCalls = () =>
    withTenant(orgId, async (tx) =>
      tx.phoneCall.findMany({
        orderBy: { startedAt: "desc" },
        take: 100,
      }),
    );
  try {
    calls = await loadCalls();
  } catch {
    /* render empty */
  }

  return (
    <AppShellServer topBar={<TopBar title="Calls" />} crumbs={["Intelligence", "AI Receptionist", "Calls"]}>
      <PageHeader
        title="Recent calls"
        description="Every call your AI receptionist has handled."
        actions={
          <Link href="/phone" className="btn">
            <Icon name="chevL" size={12} />
            Back to phone
          </Link>
        }
      />

      <div className="ds-card">
        {calls.length === 0 ? (
          <div className="ds-card__body dim" style={{ textAlign: "center", padding: 32 }}>
            <Icon name="phone" size={28} style={{ color: "var(--pri)" }} />
            <p style={{ marginTop: 10, fontSize: 13 }}>Calls will appear here as they come in.</p>
          </div>
        ) : (
          <div style={{ padding: 4 }}>
            {calls.map((c, i) => (
              <Link
                key={c.id}
                href={`/phone/calls/${c.id}`}
                className="row"
                style={{
                  padding: 12,
                  borderTop: i ? "1px solid var(--line)" : "none",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <span
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    background:
                      c.status === "completed"
                        ? "var(--ok-soft)"
                        : c.status === "failed"
                          ? "var(--bad-soft)"
                          : "var(--info-soft)",
                    color:
                      c.status === "completed"
                        ? "var(--ok)"
                        : c.status === "failed"
                          ? "var(--bad)"
                          : "var(--info)",
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon name="phone" size={13} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="mono" style={{ fontSize: 12.5, fontWeight: 500 }}>
                    {c.fromE164}
                  </div>
                  <div className="dim" style={{ fontSize: 11 }}>
                    {c.durationSeconds
                      ? `${Math.round(c.durationSeconds / 60)}m ${c.durationSeconds % 60}s`
                      : "—"}{" "}
                    · {c.startedAt ? relativeTime(c.startedAt) : "—"}
                  </div>
                </div>
                <span className="dim" style={{ fontSize: 11, textTransform: "capitalize", marginRight: 8 }}>
                  {c.status?.replace(/-/g, " ") ?? "—"}
                </span>
                <Icon name="chevR" size={13} style={{ color: "var(--rl-muted-2)" }} />
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShellServer>
  );
}

function relativeTime(d: Date): string {
  const ms = Date.now() - d.getTime();
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}
