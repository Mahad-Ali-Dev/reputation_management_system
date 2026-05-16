import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/shell/icon";
import { Sparkline } from "@/components/shell/sparkline";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import Link from "next/link";

/**
 * Phone receptionist — repulabs v2 design.
 *
 * Real data: PhoneNumber list, recent PhoneCall list, 30-day aggregates,
 * PhoneAssistant config.
 */

export const dynamic = "force-dynamic";

export default async function PhoneDashboardPage() {
  const { orgId } = await getOrgContext();

  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [phoneNumbers, recentCalls, stats, assistant] = await withTenant(orgId, async (tx) =>
    Promise.all([
      tx.phoneNumber.findMany({
        where: { status: "active" },
        orderBy: { createdAt: "desc" },
      }),
      tx.phoneCall.findMany({
        orderBy: { startedAt: "desc" },
        take: 12,
      }),
      tx.phoneCall.aggregate({
        where: { startedAt: { gte: since30d } },
        _count: { _all: true },
        _sum: { aiCostMicros: true, durationSeconds: true },
      }),
      tx.phoneAssistant.findUnique({ where: { organizationId: orgId } }),
    ]),
  );

  const totalCalls = stats._count._all ?? 0;
  const totalCost = ((stats._sum.aiCostMicros ?? 0) / 1_000_000).toFixed(2);
  const totalMinutes = Math.round((stats._sum.durationSeconds ?? 0) / 60);
  const avgMinutes = totalCalls > 0 ? (totalMinutes / totalCalls).toFixed(1) : "0";

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Intelligence", "Phone Receptionist"]}>
      <PageHeader
        kicker={assistant?.enabled ? "Live · answering calls 24/7" : "Paused"}
        title="Phone receptionist"
        description="Your AI answers calls, qualifies leads, books appointments and drops them on your team's calendar. No more missed-call revenue leaks."
        actions={
          <>
            <Link href="/phone/voices" className="btn">
              <Icon name="sound" size={12} />
              Voice cloning
            </Link>
            <Link href="/phone/assistant" className="btn">
              <Icon name="sliders" size={12} />
              Assistant
            </Link>
            <Link href="/phone/setup" className="btn btn--pri">
              <Icon name="plus" size={12} />
              Add number
            </Link>
          </>
        }
      />

      <div className="grid-4" style={{ gap: 12, marginBottom: 18 }}>
        <Kpi
          l="Calls · 30d"
          v={String(totalCalls)}
          d={`${avgMinutes}m avg`}
          up={totalCalls > 0}
          spark={[2, 3, 4, 6, 5, 8, 7]}
        />
        <Kpi
          l="Minutes handled"
          v={String(totalMinutes)}
          d="AI on the phone"
          up={totalMinutes > 0}
        />
        <Kpi l="AI cost · 30d" v={`$${totalCost}`} d="Pay-as-you-talk" />
        <Kpi
          l="Active numbers"
          v={String(phoneNumbers.length)}
          d={`${phoneNumbers.filter((p) => p.forwardToE164).length} with handoff`}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: 14,
        }}
      >
        {/* Phone numbers */}
        <div className="ds-card">
          <div className="ds-card__head">
            <h3 className="ds-card__title">Phone numbers · {phoneNumbers.length}</h3>
            <Link href="/phone/setup" className="btn btn--xs">
              <Icon name="plus" size={10} />
              Add
            </Link>
          </div>
          {phoneNumbers.length === 0 ? (
            <div className="ds-card__body dim" style={{ textAlign: "center", padding: 32 }}>
              <Icon name="phone" size={28} style={{ color: "var(--pri)" }} />
              <p style={{ marginTop: 10, fontSize: 13 }}>No numbers leased yet.</p>
              <Link href="/phone/setup" className="btn btn--pri" style={{ marginTop: 14 }}>
                Add your first number
              </Link>
            </div>
          ) : (
            <div style={{ padding: 4 }}>
              {phoneNumbers.map((p, i) => (
                <div
                  key={p.id}
                  className="row"
                  style={{
                    padding: 12,
                    borderTop: i ? "1px solid var(--line)" : "none",
                  }}
                >
                  <span
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: "var(--pri-50)",
                      color: "var(--pri)",
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Icon name="phone" size={14} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="mono" style={{ fontSize: 13, fontWeight: 500 }}>
                      {p.phoneE164}
                    </div>
                    {p.friendlyName && (
                      <div className="dim" style={{ fontSize: 11 }}>
                        {p.friendlyName}
                      </div>
                    )}
                    {p.forwardToE164 && (
                      <div className="dim mono" style={{ fontSize: 10.5 }}>
                        Handoff → {p.forwardToE164}
                      </div>
                    )}
                  </div>
                  <span className="chip chip--ok">Active</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent calls */}
        <div className="ds-card">
          <div className="ds-card__head">
            <h3 className="ds-card__title">Recent calls</h3>
            <Link href="/phone/calls" className="btn btn--xs">
              View all
            </Link>
          </div>
          {recentCalls.length === 0 ? (
            <div className="ds-card__body dim" style={{ textAlign: "center", padding: 32 }}>
              <Icon name="phone" size={28} style={{ color: "var(--pri)" }} />
              <p style={{ marginTop: 10, fontSize: 13 }}>Calls will appear here as they come in.</p>
            </div>
          ) : (
            <div style={{ padding: 4 }}>
              {recentCalls.map((c, i) => (
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
                  <Icon name="chevR" size={13} style={{ color: "var(--rl-muted-2)" }} />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {!assistant?.enabled && (
        <div className="ds-card" style={{ marginTop: 16, padding: 18 }}>
          <div className="row" style={{ gap: 12 }}>
            <Icon name="alert" size={18} style={{ color: "var(--warn)" }} />
            <div style={{ flex: 1 }}>
              <strong style={{ fontSize: 13 }}>The AI assistant is paused</strong>
              <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>
                Configure the voice + prompt, then flip it live to start answering calls.
              </div>
            </div>
            <Link href="/phone/assistant" className="btn btn--pri">
              Configure
            </Link>
          </div>
        </div>
      )}
    </AppShellServer>
  );
}

function Kpi({
  l,
  v,
  d,
  spark,
  up,
}: {
  l: string;
  v: string;
  d: string;
  spark?: number[];
  up?: boolean;
}) {
  return (
    <div className="ds-card">
      <div className="stat">
        <div className="stat__label">{l}</div>
        <div
          className="row"
          style={{ alignItems: "flex-end", gap: 8, justifyContent: "space-between" }}
        >
          <span className="stat__value">{v}</span>
          {spark && <Sparkline points={spark} width={68} height={26} />}
        </div>
        <div className={`stat__delta${up ? " up" : ""}`}>
          {up && <Icon name="arrowU" size={10} stroke={2.4} />}
          {d}
        </div>
      </div>
    </div>
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
