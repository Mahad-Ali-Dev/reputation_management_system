import { Avatar } from "@/components/shell/avatar";
import { Icon } from "@/components/shell/icon";
import { resendReviewRequest } from "@/lib/outreach/actions";
import { listReviewRequests, reviewRequestStats } from "@/lib/outreach/queries";

/**
 * Sent History panel (server) — 4 stat cards (Total Sent / Opened / Clicked /
 * Reviews Left) + a table over BOTH manual and automated requests (one stream).
 * Each row has a Resend button (re-queues via the dispatch cron).
 */

const STATUS_TONE: Record<string, string> = {
  queued: "chip--out",
  scheduled: "chip--warn",
  sending: "chip--info",
  sent: "chip--info",
  delivered: "chip--info",
  opened: "chip--pri",
  clicked: "chip--pri",
  reviewed: "chip--ok",
  unsubscribed: "chip--out",
  bounced: "chip--bad",
  failed: "chip--bad",
};

export async function HistoryTab({ orgId }: { orgId: string }) {
  const [stats, requests] = await Promise.all([
    reviewRequestStats(orgId),
    listReviewRequests(orgId, { take: 100 }),
  ]);

  return (
    <div>
      <div className="grid-4" style={{ gap: 12, marginBottom: 18 }}>
        <Stat label="Total Sent" value={stats.sent} sub="Last 30 days" />
        <Stat label="Opened" value={stats.opened} sub={pct(stats.opened, stats.sent, "open rate")} />
        <Stat label="Clicked" value={stats.clicked} sub={pct(stats.clicked, stats.sent, "click rate")} />
        <Stat
          label="Reviews Left"
          value={stats.converted}
          sub={pct(stats.converted, stats.sent, "conversion")}
        />
      </div>

      <div className="ds-card" style={{ padding: 0, overflow: "hidden" }}>
        {requests.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center" }}>
            <Icon name="send" size={28} style={{ color: "var(--pri)", marginBottom: 10 }} />
            <div style={{ fontSize: 15, fontWeight: 500, color: "var(--ink)" }}>
              No review requests sent yet
            </div>
            <p className="dim" style={{ marginTop: 6, fontSize: 13 }}>
              Sent requests — manual and automated — show up here with live statuses.
            </p>
          </div>
        ) : (
          <table className="tbl tbl--compact">
            <thead>
              <tr>
                <th style={{ paddingLeft: 16 }}>Recipient</th>
                <th>Channel</th>
                <th>Source</th>
                <th>Status</th>
                <th>Date</th>
                <th style={{ textAlign: "right", paddingRight: 16 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r, i) => {
                const tone = ((i % 7) + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
                const displayName = r.recipientName ?? r.recipient ?? "—";
                const when = r.sentAt ?? r.scheduledFor ?? r.createdAt;
                const canResend = !["queued", "scheduled", "sending"].includes(r.status);
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
                      <span className="dim" style={{ fontSize: 11.5 }}>
                        {r.triggerSource === "automation" ? "Automated" : "Manual"}
                      </span>
                    </td>
                    <td>
                      <span className={`chip ${STATUS_TONE[r.status] ?? "chip--out"}`}>{r.status}</span>
                    </td>
                    <td className="mono dim" style={{ fontSize: 11.5 }}>
                      {relativeTime(when)}
                    </td>
                    <td style={{ textAlign: "right", paddingRight: 16 }}>
                      {canResend ? (
                        <form action={resendReviewRequest} style={{ display: "inline" }}>
                          <input type="hidden" name="id" value={r.id} />
                          <button type="submit" className="btn" style={{ height: 26, padding: "0 10px" }}>
                            <Icon name="refresh" size={11} />
                            Resend
                          </button>
                        </form>
                      ) : (
                        <span className="dim" style={{ fontSize: 11 }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="ds-card">
      <div className="stat">
        <div className="stat__label">{label}</div>
        <div className="stat__value">{value.toLocaleString()}</div>
        <div className="stat__delta">{sub}</div>
      </div>
    </div>
  );
}

function pct(n: number, total: number, label: string): string {
  const p = total > 0 ? Math.round((n / total) * 100) : 0;
  return `${p}% ${label}`;
}

function relativeTime(d: Date): string {
  const ms = Date.now() - d.getTime();
  const abs = Math.abs(ms);
  const min = Math.floor(abs / 60000);
  const future = ms < 0;
  if (min < 1) return "just now";
  const fmt = (s: string) => (future ? `in ${s}` : `${s} ago`);
  if (min < 60) return fmt(`${min}m`);
  const h = Math.floor(min / 60);
  if (h < 24) return fmt(`${h}h`);
  const days = Math.floor(h / 24);
  return fmt(`${days}d`);
}
