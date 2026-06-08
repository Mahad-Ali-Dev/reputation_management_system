import { Icon, type IconName } from "@/components/shell/icon";
import { ScoreRing } from "@/components/shell/score-ring";
import { Stars } from "@/components/shell/stars";
import Link from "next/link";
import type {
  ChannelSlice,
  DashboardListing,
  FunnelStage,
  RecentActivityItem,
} from "@/lib/dashboard/queries";

/**
 * Dashboard insight sections — match the premium artboards
 * (`tasks/premium-ui-redesign/dashboard-sections/03..06`):
 *   - ReviewChartQueue      → 03_chart-queue
 *   - BusinessInsightsBand  → 04_business-insights (listings · sentiment · latest)
 *   - AiChannelFunnel       → 05_ai-channel-funnel
 *   - RecentActivity        → 06_recent-activity
 *
 * All server components, pure presentation. Existing v3 classes (`.ds-card`,
 * `.chip`, `.gauge`, `.btn`) + tokens only — no new CSS.
 */

// ============================================================
// 03 — Review chart + Today's queue
// ============================================================

export function ReviewChartQueue({
  weeklyReviews,
  queue,
}: {
  weeklyReviews: number[];
  queue: QueueItem[];
}) {
  const max = Math.max(...weeklyReviews, 1);
  const urgent = queue.reduce((n, q) => n + (q.urgent ? 1 : 0), 0);
  // Reuse `.dash-grid` (main + 332px rail; collapses to one column ≤1180px) so
  // the chart/queue split matches the rest of the page and is responsive.
  return (
    <div className="dash-grid">
      <div className="ds-card">
        <div className="ds-card__head">
          <div>
            <h3 className="ds-card__title">Reviews collected · last 12 weeks</h3>
            <div className="dim" style={{ fontSize: 11.5, marginTop: 2 }}>
              All channels
            </div>
          </div>
        </div>
        <div className="ds-card__body">
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 8,
              height: 180,
              paddingTop: 8,
            }}
          >
            {weeklyReviews.map((n, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed 12-week series
                key={`wk-${i}`}
                title={`${n} review${n === 1 ? "" : "s"}`}
                style={{
                  flex: 1,
                  height: `${Math.max(6, Math.round((n / max) * 100))}%`,
                  borderRadius: "6px 6px 4px 4px",
                  background: "linear-gradient(180deg, var(--pri) 0%, #14b8a6 100%)",
                  minHeight: 6,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="ds-card">
        <div className="ds-card__head">
          <h3 className="ds-card__title">Today's queue</h3>
          {urgent > 0 && <span className="chip chip--bad" style={{ fontSize: 11 }}>{urgent} urgent</span>}
        </div>
        <div style={{ padding: "4px 4px 8px" }}>
          {queue.length === 0 ? (
            <p className="dim" style={{ fontSize: 12.5, padding: "20px 14px", textAlign: "center", margin: 0 }}>
              You're all caught up. Nothing needs attention right now.
            </p>
          ) : (
            queue.map((q) => (
              <div
                key={q.label}
                className="row"
                style={{
                  gap: 10,
                  padding: "11px 14px",
                  borderBottom: "1px solid var(--line)",
                }}
              >
                <span
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 9,
                    background: q.tone === "ai" ? "var(--pri-50)" : "var(--surface-2)",
                    color: q.tone === "ai" ? "var(--pri)" : "var(--rl-muted)",
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  {q.tone === "ai" ? "AI" : <Icon name={q.icon} size={14} />}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{q.label}</div>
                  <div className="dim" style={{ fontSize: 11 }}>{q.sub}</div>
                </div>
                <Link href={q.href} className="btn btn--xs">
                  {q.action}
                </Link>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export type QueueItem = {
  label: string;
  sub: string;
  action: string;
  href: string;
  icon: IconName;
  tone: "ai" | "plain";
  urgent?: boolean;
};

// ============================================================
// 04 — Listings · Sentiment · Latest reviews
// ============================================================

export function BusinessInsightsBand({
  listings,
  sentiment,
  latestReviews,
  hasData,
}: {
  listings: DashboardListing[];
  sentiment: { positivePct: number; neutralPct: number; negativePct: number };
  latestReviews: Array<{ id: string; rating: number; reviewerName: string | null; body: string | null }>;
  hasData: boolean;
}) {
  return (
    <div className="grid-3" style={{ gap: 14 }}>
      {/* Listings */}
      <div className="ds-card">
        <div className="ds-card__head">
          <h3 className="ds-card__title">Listings</h3>
          <Link href="/establishments" style={{ fontSize: 12, color: "var(--pri)", textDecoration: "none" }}>
            View all
          </Link>
        </div>
        <div className="ds-card__body">
          {listings.length === 0 ? (
            <EmptyHint icon="plug" text="Add a listing to track its reviews." href="/establishments" cta="Add listing" />
          ) : (
            listings.slice(0, 3).map((l, i) => (
              <div
                key={l.id}
                style={{
                  paddingBottom: i < Math.min(3, listings.length) - 1 ? 12 : 0,
                  marginBottom: i < Math.min(3, listings.length) - 1 ? 12 : 0,
                  borderBottom: i < Math.min(3, listings.length) - 1 ? "1px solid var(--line)" : "none",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600 }}>{l.name}</div>
                <div className="dim" style={{ fontSize: 11.5, margin: "2px 0 6px" }}>
                  {l.locality ? `${l.locality} · ` : ""}
                  {l.reviewCount} review{l.reviewCount === 1 ? "" : "s"}
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--gold)" }}>
                    {l.avgRating > 0 ? l.avgRating.toFixed(1) : "—"}
                  </span>
                  <Stars value={Math.round(l.avgRating)} size={13} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Sentiment */}
      <div className="ds-card">
        <div className="ds-card__head">
          <h3 className="ds-card__title">Sentiment</h3>
        </div>
        <div className="ds-card__body">
          {!hasData ? (
            <EmptyHint icon="bars" text="Sentiment appears once reviews arrive." />
          ) : (
            <>
              <div className="row" style={{ gap: 16, alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1 }}>
                    {sentiment.positivePct}%
                  </div>
                  <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>Net positive</div>
                </div>
                <div style={{ marginLeft: "auto" }}>
                  <ScoreRing
                    value={sentiment.positivePct}
                    suffix="%"
                    size={84}
                    stroke={9}
                    hideMax
                    color="#10b981"
                  />
                </div>
              </div>
              <div style={{ marginTop: 16 }}>
                <SentimentBar label="Positive" pct={sentiment.positivePct} color="#10b981" />
                <SentimentBar label="Neutral" pct={sentiment.neutralPct} color="var(--rl-muted-3)" />
                {sentiment.negativePct > 0 && (
                  <SentimentBar label="Negative" pct={sentiment.negativePct} color="var(--bad)" />
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Latest reviews */}
      <div className="ds-card">
        <div className="ds-card__head">
          <h3 className="ds-card__title">Latest reviews</h3>
          {hasData && <span className="chip chip--ok" style={{ fontSize: 11 }}>Live</span>}
        </div>
        <div className="ds-card__body">
          {latestReviews.length === 0 ? (
            <EmptyHint icon="google" text="Your latest reviews will show here." href="/connections" cta="Connect Google" />
          ) : (
            latestReviews.slice(0, 2).map((r, i) => (
              <div
                key={r.id}
                style={{
                  paddingBottom: i < Math.min(2, latestReviews.length) - 1 ? 12 : 0,
                  marginBottom: i < Math.min(2, latestReviews.length) - 1 ? 12 : 0,
                  borderBottom: i < Math.min(2, latestReviews.length) - 1 ? "1px solid var(--line)" : "none",
                }}
              >
                <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{r.reviewerName ?? "Anonymous"}</span>
                  <Stars value={r.rating} size={13} />
                </div>
                <p
                  style={{
                    margin: "5px 0 0",
                    fontSize: 12.5,
                    color: "var(--ink-2)",
                    lineHeight: 1.5,
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                  }}
                >
                  {r.body}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function SentimentBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="row" style={{ gap: 10, marginBottom: 8 }}>
      <span className="dim" style={{ fontSize: 11.5, width: 64 }}>{label}</span>
      <div className="gauge" style={{ flex: 1 }}>
        <i style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="mono" style={{ fontSize: 11.5, width: 34, textAlign: "right", fontWeight: 600 }}>{pct}%</span>
    </div>
  );
}

// ============================================================
// 05 — AI insight · Channel mix · Review funnel
// ============================================================

export function AiChannelFunnel({
  pendingReplies,
  channelMix,
  funnel,
}: {
  pendingReplies: number;
  channelMix: ChannelSlice[];
  funnel: FunnelStage[];
}) {
  return (
    <div className="grid-3" style={{ gap: 14 }}>
      {/* AI insight gradient card */}
      <div
        className="ds-card"
        style={{
          background: "linear-gradient(140deg, var(--pri) 0%, #14b8a6 100%)",
          color: "#fff",
          border: "none",
          padding: 22,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", opacity: 0.9 }}>AI INSIGHT</div>
        <h3 style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.25, margin: "14px 0 18px" }}>
          {pendingReplies > 0
            ? `You have ${pendingReplies} AI-drafted repl${pendingReplies === 1 ? "y" : "ies"} waiting for approval.`
            : "Your reply queue is clear. Keep the momentum with more review requests."}
        </h3>
        <div className="col" style={{ gap: 8, marginTop: "auto" }}>
          <Link
            href={pendingReplies > 0 ? "/reviews" : "/outreach/send"}
            className="btn"
            style={{ background: "rgba(255,255,255,.18)", color: "#fff", border: "none", justifyContent: "flex-start" }}
          >
            {pendingReplies > 0 ? "Review and approve pending drafts" : "Send review requests"}
          </Link>
          <Link
            href="/connections"
            className="btn"
            style={{ background: "rgba(255,255,255,.12)", color: "#fff", border: "none", justifyContent: "flex-start" }}
          >
            Connect more channels
          </Link>
        </div>
      </div>

      {/* Channel mix */}
      <div className="ds-card">
        <div className="ds-card__head">
          <h3 className="ds-card__title">Channel mix</h3>
        </div>
        <div className="ds-card__body">
          {channelMix.length === 0 ? (
            <EmptyHint icon="share" text="Channel mix appears as requests go out." />
          ) : (
            channelMix.map((c, i) => (
              <BarRow
                key={c.channel}
                label={titleCase(c.channel)}
                pct={c.pct}
                color={["var(--pri)", "var(--rl-muted-2)", "#10b981", "#f59e0b"][i % 4] ?? "var(--pri)"}
              />
            ))
          )}
        </div>
      </div>

      {/* Review funnel */}
      <div className="ds-card">
        <div className="ds-card__head">
          <h3 className="ds-card__title">Review funnel</h3>
        </div>
        <div className="ds-card__body">
          {funnel.length === 0 ? (
            <EmptyHint icon="send" text="Send a request to see your funnel." href="/outreach/send" cta="Send request" />
          ) : (
            funnel.map((f, i) => (
              <BarRow
                key={f.label}
                label={f.label}
                pct={f.pct}
                color={["var(--pri)", "#6366f1", "#10b981", "#0d9488"][i % 4] ?? "var(--pri)"}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function BarRow({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="row" style={{ gap: 10, marginBottom: 12 }}>
      <span style={{ fontSize: 12.5, fontWeight: 500, width: 78 }}>{label}</span>
      <div className="gauge" style={{ flex: 1 }}>
        <i style={{ width: `${Math.max(2, pct)}%`, background: color }} />
      </div>
      <span className="mono dim" style={{ fontSize: 11.5, width: 38, textAlign: "right" }}>{pct}%</span>
    </div>
  );
}

// ============================================================
// 06 — Recent activity feed
// ============================================================

export function RecentActivity({ items }: { items: RecentActivityItem[] }) {
  return (
    <div className="ds-card">
      <div className="ds-card__head">
        <div>
          <h3 className="ds-card__title">Recent activity</h3>
          <div className="dim" style={{ fontSize: 11.5, marginTop: 2 }}>Last 24 hours · all locations</div>
        </div>
        <Link href="/analytics" style={{ fontSize: 12, color: "var(--pri)", textDecoration: "none" }}>
          View all
        </Link>
      </div>
      <div style={{ padding: "2px 0 6px" }}>
        {items.length === 0 ? (
          <p className="dim" style={{ fontSize: 12.5, padding: "28px 18px", textAlign: "center", margin: 0 }}>
            No activity in the last 24 hours yet. Send a review request to get started.
          </p>
        ) : (
          items.map((it) => (
            <div
              key={it.id}
              className="row"
              style={{ gap: 14, padding: "12px 18px", borderBottom: "1px solid var(--line)" }}
            >
              <span className="mono dim" style={{ fontSize: 11.5, width: 64, flexShrink: 0 }}>
                {formatTime(it.at)}
              </span>
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 8,
                  background: it.kind === "reply" ? "var(--pri-50)" : "var(--surface-2)",
                  color: it.kind === "reply" ? "var(--pri)" : "var(--rl-muted)",
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                  fontSize: 9,
                  fontWeight: 700,
                }}
              >
                {it.kind === "reply" ? "AI" : <Icon name={activityIcon(it.kind)} size={12} />}
              </span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 500 }}>{it.title}</span>
              <span className="dim" style={{ fontSize: 11.5, flexShrink: 0 }}>{it.status}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── small shared bits ────────────────────────────────────────────────────────

function EmptyHint({
  icon,
  text,
  href,
  cta,
}: {
  icon: IconName;
  text: string;
  href?: string;
  cta?: string;
}) {
  return (
    <div style={{ textAlign: "center", padding: "20px 8px" }}>
      <span
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          background: "var(--surface-2)",
          color: "var(--rl-muted-2)",
          display: "grid",
          placeItems: "center",
          margin: "0 auto 10px",
        }}
      >
        <Icon name={icon} size={15} />
      </span>
      <p className="dim" style={{ fontSize: 12, lineHeight: 1.5, margin: 0 }}>{text}</p>
      {href && cta && (
        <Link href={href} className="btn btn--xs btn--ghost" style={{ marginTop: 10, display: "inline-flex" }}>
          {cta}
        </Link>
      )}
    </div>
  );
}

function activityIcon(kind: RecentActivityItem["kind"]): IconName {
  switch (kind) {
    case "request":
      return "send";
    case "call":
      return "phone";
    case "scan":
      return "qr";
    default:
      return "reply";
  }
}

function titleCase(s: string): string {
  if (s === "sms") return "SMS";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
