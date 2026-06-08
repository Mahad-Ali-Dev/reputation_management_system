import { Icon, type IconName } from "@/components/shell/icon";
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
 * (`tasks/premium-ui-redesign/dashboard-sections/03..06` + 09):
 *   - ReviewChartQueue      → 03_chart-queue
 *   - BusinessInsightsBand  → 04_business-insights (listings · sentiment · latest)
 *   - AiChannelFunnel       → 05_ai-channel-funnel
 *   - RecentActivity        → 06_recent-activity
 *
 * All server components, pure presentation. Existing v3 classes (`.ds-card`,
 * `.chip`, `.gauge`, `.btn`) + tokens only — depth/finish elevated to the
 * artboards (rounded gradient chart bars on faint gridlines, queue icon-tiles
 * with outlined actions, a teal sentiment donut, the blue→teal AI card, and a
 * denser audit-style activity timeline).
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
              By channel · all locations
            </div>
          </div>
        </div>
        <div className="ds-card__body">
          <ReviewBars weeklyReviews={weeklyReviews} max={max} />
        </div>
      </div>

      <div className="ds-card">
        <div className="ds-card__head">
          <h3 className="ds-card__title">Today's queue</h3>
          {urgent > 0 && <span className="chip chip--bad" style={{ fontSize: 11 }}>{urgent} urgent</span>}
        </div>
        <div style={{ padding: "6px 10px 10px" }}>
          {queue.length === 0 ? (
            <p className="dim" style={{ fontSize: 12.5, padding: "22px 14px", textAlign: "center", margin: 0, lineHeight: 1.5 }}>
              You're all caught up. Nothing needs attention right now.
            </p>
          ) : (
            queue.map((q, i) => (
              <div
                key={q.label}
                className="row"
                style={{
                  gap: 12,
                  padding: "12px 8px",
                  borderBottom: i < queue.length - 1 ? "1px solid var(--line)" : "none",
                }}
              >
                <span
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    background: q.tone === "ai" ? "var(--pri-50)" : "var(--surface-3)",
                    color: q.tone === "ai" ? "var(--pri)" : "var(--rl-muted)",
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: "0.02em",
                  }}
                >
                  {q.tone === "ai" ? "AI" : <Icon name={q.icon} size={15} />}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 650, color: "var(--ink)", letterSpacing: "-0.01em" }}>
                    {q.label}
                  </div>
                  <div className="dim" style={{ fontSize: 11, marginTop: 1 }}>{q.sub}</div>
                </div>
                <Link href={q.href} className="btn btn--sm" style={{ flexShrink: 0 }}>
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

/**
 * Weekly review bar chart — rounded blue→teal gradient bars over three faint
 * horizontal gridlines (artboard 03). Bars carry a soft drop so they read as
 * lifted off the plot, with a value label that fades in on hover via title.
 */
function ReviewBars({ weeklyReviews, max }: { weeklyReviews: number[]; max: number }) {
  return (
    <div style={{ position: "relative", height: 188, paddingTop: 6 }}>
      {/* faint gridlines */}
      <div style={{ position: "absolute", top: 6, right: 0, bottom: 0, left: 0, display: "flex", flexDirection: "column", justifyContent: "space-between", pointerEvents: "none" }}>
        {[0, 1, 2, 3].map((g) => (
          <div key={`grid-${g}`} style={{ height: 1, background: "var(--line)" }} />
        ))}
      </div>
      <div style={{ position: "relative", display: "flex", alignItems: "flex-end", gap: 9, height: "100%" }}>
        {weeklyReviews.map((n, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed 12-week series
            key={`wk-${i}`}
            title={`${n} review${n === 1 ? "" : "s"}`}
            style={{
              flex: 1,
              height: `${Math.max(5, Math.round((n / max) * 100))}%`,
              borderRadius: "7px 7px 3px 3px",
              background: "linear-gradient(180deg, var(--pri) 0%, #2dd4bf 100%)",
              minHeight: 5,
              boxShadow: "0 4px 10px -4px rgba(37,99,235,0.35)",
            }}
          />
        ))}
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
          <Link href="/establishments" className="btn btn--xs btn--ghost" style={{ color: "var(--pri)" }}>
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
                  paddingBottom: i < Math.min(3, listings.length) - 1 ? 13 : 0,
                  marginBottom: i < Math.min(3, listings.length) - 1 ? 13 : 0,
                  borderBottom: i < Math.min(3, listings.length) - 1 ? "1px solid var(--line)" : "none",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 650, letterSpacing: "-0.01em" }}>{l.name}</div>
                <div className="dim" style={{ fontSize: 11.5, margin: "3px 0 7px" }}>
                  {l.locality ? `${l.locality} · ` : ""}
                  {l.reviewCount} review{l.reviewCount === 1 ? "" : "s"}
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--gold)", fontVariantNumeric: "tabular-nums" }}>
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
                  <div style={{ fontSize: 34, fontWeight: 750, letterSpacing: "-0.035em", lineHeight: 1, color: "var(--ink)" }}>
                    {sentiment.positivePct}%
                  </div>
                  <div className="dim" style={{ fontSize: 12, marginTop: 5 }}>Net positive</div>
                </div>
                <div style={{ marginLeft: "auto" }}>
                  <DonutRing value={sentiment.positivePct} size={92} stroke={11} />
                </div>
              </div>
              <div style={{ marginTop: 18 }}>
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
          {hasData && (
            <span className="chip chip--ok" style={{ fontSize: 11 }}>
              <span className="dot" aria-hidden /> Live
            </span>
          )}
        </div>
        <div className="ds-card__body">
          {latestReviews.length === 0 ? (
            <EmptyHint icon="google" text="Your latest reviews will show here." href="/connections" cta="Connect Google" />
          ) : (
            latestReviews.slice(0, 2).map((r, i) => (
              <div
                key={r.id}
                style={{
                  paddingBottom: i < Math.min(2, latestReviews.length) - 1 ? 13 : 0,
                  marginBottom: i < Math.min(2, latestReviews.length) - 1 ? 13 : 0,
                  borderBottom: i < Math.min(2, latestReviews.length) - 1 ? "1px solid var(--line)" : "none",
                }}
              >
                <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 650, letterSpacing: "-0.01em" }}>{r.reviewerName ?? "Anonymous"}</span>
                  <Stars value={r.rating} size={13} />
                </div>
                <p
                  style={{
                    margin: "6px 0 0",
                    fontSize: 12.5,
                    color: "var(--ink-2)",
                    lineHeight: 1.55,
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

/**
 * Teal sentiment donut — net-positive share drawn as a rounded-cap arc on a
 * faint track (artboard 04). Inline SVG (server-renderable); the % already
 * reads large beside it, so the ring itself stays clean (no center number).
 */
function DonutRing({ value, size = 92, stroke = 11 }: { value: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / 100));
  const dash = c * pct;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#10b981"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c}`}
      />
    </svg>
  );
}

function SentimentBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="row" style={{ gap: 10, marginBottom: 9 }}>
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
        className="viz-banner"
        style={{
          color: "#fff",
          border: "none",
          padding: 24,
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(150deg, var(--pri) 0%, #1d4ed8 48%, #0d9488 100%)",
        }}
      >
        <div className="viz-banner__kicker">AI INSIGHT</div>
        <h3 style={{ fontSize: 20, fontWeight: 750, letterSpacing: "-0.025em", lineHeight: 1.22, margin: "14px 0 18px" }}>
          {pendingReplies > 0
            ? `You have ${pendingReplies} AI-drafted repl${pendingReplies === 1 ? "y" : "ies"} waiting for approval.`
            : "Your reply queue is clear. Keep the momentum with more review requests."}
        </h3>
        <div className="col" style={{ gap: 8, marginTop: "auto" }}>
          <Link
            href={pendingReplies > 0 ? "/reviews" : "/outreach/send"}
            className="viz-banner__btn"
          >
            {pendingReplies > 0 ? "Review and approve pending drafts" : "Send review requests"}
          </Link>
          <Link href="/connections" className="viz-banner__btn viz-banner__btn--ghost">
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
    <div className="row" style={{ gap: 12, marginBottom: 14 }}>
      <span style={{ fontSize: 12.5, fontWeight: 550, width: 78, color: "var(--ink-2)" }}>{label}</span>
      <div className="gauge gauge--lg" style={{ flex: 1 }}>
        <i style={{ width: `${Math.max(2, pct)}%`, background: color }} />
      </div>
      <span className="mono dim" style={{ fontSize: 11.5, width: 40, textAlign: "right", fontWeight: 600 }}>{pct}%</span>
    </div>
  );
}

// ============================================================
// 06 — Recent activity feed (audit-style timeline)
// ============================================================

export function RecentActivity({ items }: { items: RecentActivityItem[] }) {
  return (
    <div className="ds-card">
      <div className="ds-card__head">
        <div>
          <h3 className="ds-card__title">Recent activity</h3>
          <div className="dim" style={{ fontSize: 11.5, marginTop: 2 }}>Last 24 hours · all locations</div>
        </div>
        {/* Static segmented filter pills (artboard 06) — visual band header */}
        <div className="row" style={{ gap: 6 }}>
          <span className="chip" style={{ fontSize: 11 }}>All</span>
          <span className="chip chip--pri" style={{ fontSize: 11 }}>Reviews</span>
          <span className="chip chip--out" style={{ fontSize: 11 }}>Requests</span>
        </div>
      </div>
      <div style={{ padding: "2px 0 4px" }}>
        {items.length === 0 ? (
          <p className="dim" style={{ fontSize: 12.5, padding: "30px 18px", textAlign: "center", margin: 0, lineHeight: 1.5 }}>
            No activity in the last 24 hours yet. Send a review request to get started.
          </p>
        ) : (
          items.map((it, i) => (
            <div
              key={it.id}
              className="row"
              style={{ gap: 16, padding: "13px 22px", borderBottom: i < items.length - 1 ? "1px solid var(--line)" : "none" }}
            >
              <span className="mono dim" style={{ fontSize: 11.5, width: 60, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                {formatTime(it.at)}
              </span>
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: it.kind === "reply" ? "var(--pri-50)" : "var(--surface-3)",
                  color: it.kind === "reply" ? "var(--pri)" : "var(--rl-muted)",
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                  fontSize: 9,
                  fontWeight: 700,
                }}
              >
                {it.kind === "reply" ? "AI" : <Icon name={activityIcon(it.kind)} size={13} />}
              </span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.005em" }}>
                {it.title}
              </span>
              <span
                className="dim"
                style={{ fontSize: 11.5, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}
              >
                {it.status}
              </span>
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
    <div style={{ textAlign: "center", padding: "22px 8px" }}>
      <span
        style={{
          width: 36,
          height: 36,
          borderRadius: 11,
          background: "var(--surface-3)",
          color: "var(--rl-muted-2)",
          display: "grid",
          placeItems: "center",
          margin: "0 auto 11px",
        }}
      >
        <Icon name={icon} size={16} />
      </span>
      <p className="dim" style={{ fontSize: 12, lineHeight: 1.5, margin: 0 }}>{text}</p>
      {href && cta && (
        <Link href={href} className="btn btn--xs btn--ghost" style={{ marginTop: 11, display: "inline-flex", color: "var(--pri)" }}>
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
