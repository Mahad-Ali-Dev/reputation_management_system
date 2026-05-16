import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { Avatar } from "@/components/shell/avatar";
import { Icon } from "@/components/shell/icon";
import { Sparkline } from "@/components/shell/sparkline";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { listReviewRequests, reviewRequestStats } from "@/lib/outreach/queries";
import Link from "next/link";

/**
 * Review Requests — landing/queue per the v2 design.
 *
 * Real data: req stats (30d sent/delivered/opened/converted) + recent
 * request queue. Empty state when no requests.
 */

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = {
  queued: "chip--out",
  scheduled: "chip--warn",
  sent: "chip--info",
  delivered: "chip--info",
  opened: "chip--pri",
  clicked: "chip--pri",
  reviewed: "chip--ok",
  bounced: "chip--bad",
  failed: "chip--bad",
};

export default async function OutreachPage() {
  const { orgId } = await getOrgContext();

  const [requests, stats] = await Promise.all([
    listReviewRequests(orgId),
    reviewRequestStats(orgId),
  ]);

  const openRate = stats.sent > 0 ? Math.round((stats.opened / stats.sent) * 100) : 0;
  const convRate = stats.sent > 0 ? Math.round((stats.converted / stats.sent) * 100) : 0;

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Reputation", "Review Requests"]}>
      <PageHeader
        kicker="Last 30 days"
        title="Review requests"
        description="Send personalized review requests via email + SMS — one-off or in bulk from a CSV."
        actions={
          <>
            <Link href="/outreach/bulk" className="btn">
              <Icon name="upload" size={12} />
              Bulk CSV
            </Link>
            <Link href="/outreach/templates" className="btn">
              <Icon name="copy" size={12} />
              Templates
            </Link>
            <Link href="/outreach/send" className="btn btn--pri">
              <Icon name="send" size={12} />
              Send request
            </Link>
          </>
        }
      />

      <div className="grid-4" style={{ gap: 12, marginBottom: 18 }}>
        <Kpi l="Sent" v={String(stats.sent)} d={`${stats.delivered.toLocaleString()} delivered`} />
        <Kpi
          l="Opened"
          v={String(stats.opened)}
          d={`${openRate}% open rate`}
          spark={[2, 4, 3, 5, 4, 7, 6]}
          up
        />
        <Kpi
          l="Converted"
          v={String(stats.converted)}
          d={`${convRate}% conversion`}
          spark={[1, 2, 1, 3, 2, 4, 5]}
          up
        />
        <Kpi
          l="Bounced"
          v={String(Math.max(0, stats.sent - stats.delivered))}
          d="Email + SMS failures"
        />
      </div>

      <div className="ds-card">
        <div className="ds-card__head">
          <div>
            <h3 className="ds-card__title">Recent requests</h3>
            <div className="ds-card__sub">Newest first · all locations</div>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <span className="chip">All · {requests.length}</span>
            <span className="chip chip--out">Scheduled</span>
            <span className="chip chip--out">Sent</span>
            <span className="chip chip--out">Opened</span>
            <span className="chip chip--out">Bounced</span>
          </div>
        </div>
        {requests.length === 0 ? (
          <div
            style={{
              padding: 48,
              textAlign: "center",
              color: "var(--rl-muted)",
              fontSize: 13,
            }}
          >
            <Icon name="send" size={32} style={{ color: "var(--pri)", marginBottom: 12 }} />
            <div style={{ fontSize: 15, fontWeight: 500, color: "var(--ink)" }}>
              No review requests sent yet
            </div>
            <p style={{ marginTop: 6, marginBottom: 18 }}>
              Send your first request and start collecting Google reviews automatically.
            </p>
            <Link href="/outreach/send" className="btn btn--pri">
              <Icon name="send" size={12} />
              Send first request
            </Link>
          </div>
        ) : (
          <table className="tbl tbl--compact">
            <thead>
              <tr>
                <th style={{ paddingLeft: 16 }}>Recipient</th>
                <th>Channel</th>
                <th>Status</th>
                <th>Created</th>
                <th>Last event</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {requests.slice(0, 30).map((r, i) => {
                const tone = ((i % 7) + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
                const displayName = r.recipientName ?? r.recipient ?? "—";
                return (
                  <tr key={r.id}>
                    <td style={{ paddingLeft: 16 }}>
                      <div className="row" style={{ gap: 10 }}>
                        <Avatar name={displayName} size={24} tone={tone} />
                        <div>
                          <div style={{ fontSize: 12.5, fontWeight: 500 }}>{displayName}</div>
                          <div className="dim mono" style={{ fontSize: 10.5 }}>
                            {r.recipient}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="chip chip--out">{r.channel}</span>
                    </td>
                    <td>
                      <span className={`chip ${STATUS_TONE[r.status] ?? "chip--out"}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="mono dim" style={{ fontSize: 11.5 }}>
                      {relativeTime(r.createdAt)}
                    </td>
                    <td className="mono dim" style={{ fontSize: 11.5 }}>
                      {r.sentAt ? relativeTime(r.sentAt) : "—"}
                    </td>
                    <td style={{ textAlign: "right", paddingRight: 16 }}>
                      <Icon name="chevR" size={13} style={{ color: "var(--rl-muted-2)" }} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
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
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}
