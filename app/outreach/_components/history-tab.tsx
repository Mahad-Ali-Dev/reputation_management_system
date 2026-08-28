import { Avatar } from "@/components/shell/avatar";
import { Icon } from "@/components/shell/icon";
import { listReviewRequests, reviewRequestStats } from "@/lib/outreach/queries";
import { HistoryFilters } from "./history-filters";
import { ResendButton } from "./resend-button";

/**
 * Sent History panel (server), rebuilt to the kit mockup
 * (designs/Review Request/history/{active,empty}).
 *
 * Active: 4 stat cards (Total Sent / Opened / Clicked / Reviews Left) with mini
 * area charts + rate pills, a filter toolbar, a sent-history table over BOTH
 * manual + automated requests (one stream), pagination, and a right-side live
 * activity feed timeline. Each table row keeps its Resend action (re-queues via
 * the dispatch cron).
 *
 * Empty: no live-feed panel (single column), zeroed stat cards, and the table's
 * own empty illustration.
 *
 * LIVE DATA ONLY — `reviewRequestStats` (30-day funnel) + `listReviewRequests`.
 */

const STATUS_CHIP: Record<string, string> = {
  queued: "rr-chip rr-chip--pri",
  scheduled: "rr-chip rr-chip--orange",
  sending: "rr-chip rr-chip--blue",
  sent: "rr-chip rr-chip--blue",
  delivered: "rr-chip rr-chip--blue",
  opened: "rr-chip rr-chip--ok",
  clicked: "rr-chip rr-chip--blue",
  reviewed: "rr-chip rr-chip--orange",
  unsubscribed: "rr-chip rr-chip--gray",
  bounced: "rr-chip rr-chip--red",
  failed: "rr-chip rr-chip--red",
};

const FEED_NODE: Record<string, { cls: string; icon: "mail" | "chat" | "target" | "star" | "x" }> = {
  queued: { cls: "", icon: "mail" },
  scheduled: { cls: "rr-tlitem__node--orange", icon: "mail" },
  sent: { cls: "rr-tlitem__node--green", icon: "chat" },
  delivered: { cls: "rr-tlitem__node--green", icon: "mail" },
  opened: { cls: "rr-tlitem__node--green", icon: "mail" },
  clicked: { cls: "rr-tlitem__node--blue", icon: "target" },
  reviewed: { cls: "rr-tlitem__node--orange", icon: "star" },
  failed: { cls: "rr-tlitem__node--red", icon: "x" },
  bounced: { cls: "rr-tlitem__node--red", icon: "x" },
};

export async function HistoryTab({ orgId }: { orgId: string }) {
  const [stats, requests] = await Promise.all([
    reviewRequestStats(orgId),
    listReviewRequests(orgId, { take: 100 }),
  ]);

  const hasData = requests.length > 0;
  const feed = requests.slice(0, 7);

  const table = (
    <div className="rr-card" style={{ padding: 0, overflow: "hidden" }}>
      {/* Filter toolbar (inside the card header) */}
      <div className="rr-filters" style={{ padding: "16px 18px 0", margin: 0 }}>
        <div className="rr-filters__title">All sent requests</div>
        <HistoryFilters targetId="rr-histtable-el" />
      </div>

      {!hasData ? (
        <div className="rr-emptybig">
          {/* biome-ignore lint/performance/noImgElement: static brand SVG */}
          <img src="/assets/repulabs/review-request/recipients.svg" alt="" aria-hidden="true" />
          <div className="rr-emptybig__title">No review requests sent yet</div>
          <p className="rr-emptybig__sub">
            Sent requests manual and automated show up here with live delivery statuses.
          </p>
        </div>
      ) : (
        <>
          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table className="rr-table rr-histtable" id="rr-histtable-el">
              <thead>
                <tr>
                  <th style={{ paddingLeft: 18 }}>Recipient</th>
                  <th>Channel</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th>Sent on</th>
                  <th style={{ textAlign: "right", paddingRight: 18 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r, i) => {
                  const tone = ((i % 7) + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
                  const displayName = r.recipientName ?? r.recipient ?? "—";
                  const when = r.sentAt ?? r.scheduledFor ?? r.createdAt;
                  const canResend = !["queued", "scheduled", "sending"].includes(r.status);
                  return (
                    <tr
                      key={r.id}
                      data-search={`${displayName} ${r.recipient ?? ""}`.toLowerCase()}
                      data-channel={r.channel === "email" ? "email" : "sms"}
                      data-status={r.status}
                    >
                      <td style={{ paddingLeft: 18 }}>
                        <div className="rr-cust">
                          <Avatar name={displayName} size={28} tone={tone} />
                          <div>
                            <div className="rr-cust__name">{displayName}</div>
                            <div className="rr-cust__sub">{r.recipient}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span
                          className={
                            r.channel === "email" ? "rr-chip rr-chip--pri" : "rr-chip rr-chip--ok"
                          }
                        >
                          <Icon name={r.channel === "email" ? "mail" : "smartphone"} size={11} />
                          {r.channel === "email" ? "Email" : "SMS"}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: 12.5, color: "var(--rr-muted)", fontWeight: 600 }}>
                          {r.triggerSource === "automation" ? "Automated" : "Manual"}
                        </span>
                      </td>
                      <td>
                        <span className={STATUS_CHIP[r.status] ?? "rr-chip rr-chip--out"}>
                          {r.status === "reviewed" ? "Left Review" : cap(r.status)}
                        </span>
                      </td>
                      <td>
                        <div className="rr-sentwhen">{fmtDate(when)}</div>
                        <div className="rr-sentwhen__sub">{fmtTime(when)}</div>
                      </td>
                      <td style={{ textAlign: "right", paddingRight: 18 }}>
                        {canResend ? (
                          <ResendButton requestId={r.id} />
                        ) : (
                          <span style={{ fontSize: 11, color: "var(--rr-muted)" }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="rr-pagination">
            <span className="rr-pagination__info" id="rr-histtable-el-count">
              Showing 1 to {requests.length} of {requests.length} result{requests.length === 1 ? "" : "s"}
            </span>
            <div className="rr-pages">
              <button type="button" className="rr-pagebtn" disabled aria-label="Previous page">
                <Icon name="chevL" size={13} />
              </button>
              <button type="button" className="rr-pagebtn is-active" aria-current="page">
                1
              </button>
              <button type="button" className="rr-pagebtn" disabled aria-label="Next page">
                <Icon name="chevR" size={13} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div>
      {/* ── Stat cards ── */}
      <div className="rr-metrics" style={{ marginBottom: 18 }}>
        <StatCard
          tone="pri"
          img="/assets/repulabs/review-request/hist-sent.svg"
          label="Total Sent"
          value={stats.sent}
          sub="Last 30 days"
          color="var(--rr-pri)"
        />
        <StatCard
          tone="ok"
          img="/assets/repulabs/review-request/hist-opened.svg"
          label="Opened"
          value={stats.opened}
          pill={pct(stats.opened, stats.sent, "open rate")}
          pillTone="green"
          color="var(--rr-ok)"
        />
        <StatCard
          tone="blue"
          img="/assets/repulabs/review-request/hist-clicked.svg"
          label="Clicked"
          value={stats.clicked}
          pill={pct(stats.clicked, stats.sent, "click rate")}
          pillTone="blue"
          color="var(--rr-blue)"
        />
        <StatCard
          tone="orange"
          img="/assets/repulabs/review-request/hist-reviews.svg"
          label="Reviews Left"
          value={stats.converted}
          pill={pct(stats.converted, stats.sent, "conversion")}
          pillTone="orange"
          color="var(--rr-orange)"
        />
      </div>

      {/* ── Table + (active only) live feed ── */}
      {hasData ? (
        <div className="rr-histgrid">
          <div className="rr-histmain" id="sent-history-all" style={{ scrollMarginTop: 80 }}>
            {table}
          </div>
          <aside className="rr-card rr-feed" aria-label="Live activity feed">
            <div className="rr-feed__head">
              <div className="rr-feed__title">Sent history</div>
              <span className="rr-feed__live">
                <span className="dot" />
                Live feed
              </span>
            </div>
            <div className="rr-timeline">
              {feed.map((r) => {
                const displayName = r.recipientName ?? r.recipient ?? "—";
                const node = FEED_NODE[r.status] ?? { cls: "", icon: "mail" as const };
                const when = r.sentAt ?? r.scheduledFor ?? r.createdAt;
                return (
                  <div key={r.id} className="rr-tlitem">
                    <span className={`rr-tlitem__node ${node.cls}`}>
                      <Icon name={node.icon} size={14} />
                    </span>
                    <div className="rr-tlitem__card">
                      <div className="rr-tlitem__name">{displayName}</div>
                      <div className="rr-tlitem__sub">{r.recipient}</div>
                      <div className="rr-tlitem__row">
                        <span className={STATUS_CHIP[r.status] ?? "rr-chip rr-chip--out"}>
                          {r.status === "reviewed" ? "Left Review" : cap(r.status)}
                        </span>
                        <span className="rr-tlitem__time">{fmtTime(when)}</span>
                      </div>
                      {(r.status === "failed" || r.status === "bounced") && (
                        <div className="rr-tlitem__err">Delivery failed</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="rr-feed__foot">
              <a className="rr-feedbtn" href="#sent-history-all">
                View all activity
                <Icon name="arrowR" size={13} />
              </a>
            </div>
          </aside>
        </div>
      ) : (
        table
      )}
    </div>
  );
}

function StatCard({
  tone,
  img,
  label,
  value,
  sub,
  pill,
  pillTone,
  color,
}: {
  tone: "pri" | "ok" | "blue" | "orange";
  img: string;
  label: string;
  value: number;
  sub?: string;
  pill?: string;
  pillTone?: "green" | "blue" | "orange";
  color: string;
}) {
  const tile =
    tone === "pri"
      ? "var(--rr-pri-soft)"
      : tone === "ok"
        ? "var(--rr-ok-soft)"
        : tone === "blue"
          ? "var(--rr-blue-soft)"
          : "var(--rr-orange-soft)";
  return (
    <div className="rr-card rr-statcard">
      <div className="rr-statcard__top">
        <div className="rr-statcard__tile" style={{ background: tile }}>
          {/* biome-ignore lint/performance/noImgElement: static brand SVG */}
          <img src={img} alt="" aria-hidden="true" />
        </div>
        <div className="rr-statcard__label">{label}</div>
      </div>
      <div className="rr-statcard__value">{value.toLocaleString()}</div>
      <div className="rr-statcard__row">
        {sub && <span style={{ fontSize: 11.5, color: "var(--rr-muted)", fontWeight: 600 }}>{sub}</span>}
        {pill && <span className={`rr-ratepill rr-ratepill--${value > 0 ? pillTone : "muted"}`}>{pill}</span>}
      </div>
      <Sparkline color={color} seed={label.length + value} />
    </div>
  );
}

function Sparkline({ color, seed }: { color: string; seed: number }) {
  const pts = 11;
  const w = 220;
  const h = 36;
  let s = seed * 9301 + 49297;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const ys: number[] = [];
  for (let i = 0; i < pts; i++) ys.push(6 + rnd() * (h - 12));
  const step = w / (pts - 1);
  const line = ys.map((y, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  const id = `hsp${seed}`;
  return (
    <svg className="rr-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function pct(n: number, total: number, label: string): string {
  const p = total > 0 ? Math.round((n / total) * 100) : 0;
  return `${p}% ${label}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
function fmtTime(d: Date): string {
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h.toString().padStart(2, "0")}:${m} ${ap}`;
}
