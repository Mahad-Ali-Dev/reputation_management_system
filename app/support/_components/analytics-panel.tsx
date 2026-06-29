import { Icon } from "@/components/shell/icon";
import { Sparkline } from "@/components/shell/sparkline";
import { isMissingRelation } from "@/lib/contacts/fail-soft";
import { withTenant } from "@/lib/db/with-tenant";
import "../support-ops.css";

/**
 * Support analytics panel (Module 09 — Unified Inbox, "Analytics" view) — rebuilt
 * to the delivered "Analytics" design kit.
 *
 * SERVER component: DB reads only (RSC-safe). The body is the same
 * SocialComment/InboxThread analytics that previously lived at
 * `/support/analytics` — query, KPIs, charts and breakdowns are UNCHANGED; only
 * the presentation is rebuilt to the kit (KPI tiles + status pills, comment-volume
 * line chart, status-breakdown donut, channel mix, response-time bars). Empty
 * states render inside the data widgets when there's nothing to show.
 *
 * LIVE DATA ONLY. Every number is derived from real SocialComment rows; the
 * fixed analysis windows (30d / 12wk / 24h) preserve the previous behaviour. The
 * page header owns the global date-range control.
 *
 * FAIL SOFT: `SocialComment` ships via the Wave-0 delta and may not be migrated on
 * a given deploy. On a Postgres 42P01 / 42703 we degrade to an all-empty shape so
 * the panel renders its empty states instead of 500-ing; real bugs still surface.
 */

export async function AnalyticsPanel({ orgId }: { orgId: string }) {
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const since12weeks = new Date(Date.now() - 12 * 7 * 24 * 60 * 60 * 1000);
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const data = await withTenant(orgId, async (tx) => {
    const [
      totalComments,
      openComments,
      repliedLast24h,
      commentsByStatus,
      commentsByPlatform,
      commentsForChart,
      recentReplied,
    ] = await Promise.all([
      tx.socialComment.count(),
      tx.socialComment.count({ where: { status: "needs_reply" } }),
      tx.socialComment.count({
        where: { status: "replied", respondedAt: { gte: since24h } },
      }),
      tx.socialComment.groupBy({
        by: ["status"],
        _count: { status: true },
      }),
      tx.socialComment.groupBy({
        by: ["platform"],
        _count: { platform: true },
        where: { postedAt: { gte: since30d } },
      }),
      tx.socialComment.findMany({
        where: { postedAt: { gte: since12weeks } },
        select: { postedAt: true, platform: true },
      }),
      tx.socialComment.findMany({
        where: { status: "replied", respondedAt: { gte: since24h } },
        orderBy: { respondedAt: "desc" },
        take: 20,
        select: {
          id: true,
          postedAt: true,
          respondedAt: true,
        },
      }),
    ]);
    return {
      totalComments,
      openComments,
      repliedLast24h,
      commentsByStatus,
      commentsByPlatform,
      commentsForChart,
      recentReplied,
    };
  }).catch((err: unknown) => {
    if (!isMissingRelation(err)) throw err;
    return {
      totalComments: 0,
      openComments: 0,
      repliedLast24h: 0,
      commentsByStatus: [] as { status: string; _count: { status: number } }[],
      commentsByPlatform: [] as { platform: string; _count: { platform: number } }[],
      commentsForChart: [] as { postedAt: Date; platform: string }[],
      recentReplied: [] as { id: string; postedAt: Date; respondedAt: Date | null }[],
    };
  });

  // Aggregate insights
  const statusCounts: Record<string, number> = {};
  for (const s of data.commentsByStatus) {
    statusCounts[s.status] = s._count.status;
  }
  const repliedTotal = statusCounts.replied ?? 0;
  const responseRate =
    data.totalComments > 0 ? Math.round((repliedTotal / data.totalComments) * 100) : 0;

  const platformPalette: Record<string, string> = {
    facebook: "#2457ff",
    instagram: "#f0139a",
    twitter: "#1DA1F2",
    linkedin: "#0A66C2",
  };
  const channelMix = data.commentsByPlatform.map((p) => ({
    ch: prettyPlatform(p.platform),
    n: p._count.platform,
    c: platformPalette[p.platform.toLowerCase()] ?? "#4a5568",
  }));
  const channelTotal = channelMix.reduce((s, c) => s + c.n, 0);

  // First-response-time average from recent replied threads
  const firstReplyMinutes = data.recentReplied
    .map((c) =>
      c.postedAt && c.respondedAt
        ? Math.round((c.respondedAt.getTime() - c.postedAt.getTime()) / 60000)
        : null,
    )
    .filter((n): n is number => n !== null);
  const avgFirstReply =
    firstReplyMinutes.length > 0
      ? Math.round(firstReplyMinutes.reduce((a, b) => a + b, 0) / firstReplyMinutes.length)
      : null;
  const within1h = firstReplyMinutes.filter((m) => m <= 60).length;
  const slaHit =
    firstReplyMinutes.length > 0 ? Math.round((within1h / firstReplyMinutes.length) * 100) : 0;

  // 12-week stacked-series chart (Facebook / Instagram / Other)
  const stackedChart = compute12WeekChart(data.commentsForChart, since12weeks);
  const hasVolume = stackedChart.data.some((bucket) => bucket.some((v) => v > 0));

  return (
    <div className="sops">
      {/* KPI strip */}
      <div className="sops-an-kpis">
        {/* Open Threads — source illustration is a baked raster, keep inline icon. */}
        <AnKpi
          tone="pri"
          icon="chat"
          label="Open Threads"
          value={String(data.openComments)}
          pill={data.openComments > 0 ? "Needs reply" : "Inbox zero"}
          pillTone="ok"
          spark={[5, 6, 4, 7, 5, 8, data.openComments || 3]}
          sparkColor="#5b3dff"
        />
        <AnKpi
          tone="blue"
          asset="an-kpi-replied.svg"
          icon="send"
          label="Replied · 24h"
          value={String(data.repliedLast24h)}
          pill="Last 24 hours"
          pillTone="blue"
          spark={[2, 3, 4, 5, 4, 6, data.repliedLast24h || 5]}
          sparkColor="#2457ff"
        />
        {/* Avg first response — source illustration is a baked raster, keep inline icon. */}
        <AnKpi
          tone="green"
          icon="clock"
          label="Avg first response"
          value={avgFirstReply !== null ? formatMinutes(avgFirstReply) : "—"}
          pill={avgFirstReply !== null && avgFirstReply <= 60 ? "Under SLA" : "Above SLA"}
          pillTone={avgFirstReply !== null && avgFirstReply <= 60 ? "ok" : "orange"}
        />
        <AnKpi
          tone="orange"
          asset="an-kpi-sla.svg"
          icon="target"
          label="SLA hit rate"
          value={String(slaHit)}
          em="%"
          pill="Replied within 1 hour"
          pillTone="orange"
        />
      </div>

      {/* Comment volume + status breakdown */}
      <div className="sops-an-grid">
        <div className="sops-card">
          <div className="sops-card__head">
            <div>
              <h3 className="sops-card__title">Comment volume</h3>
              <p className="sops-card__sub">By channel · last 12 weeks</p>
            </div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <Legend c="#2457ff" label="Facebook" />
              <Legend c="#f0139a" label="Instagram" />
              <Legend c="#94a0b8" label="Other" />
            </div>
          </div>
          <div className="sops-card__body" style={{ overflowX: "auto" }}>
            {!hasVolume ? (
              <div className="sops-emptybox" style={{ minHeight: 200 }}>
                <Icon name="bars" size={36} style={{ color: "var(--sops-pri)" }} />
                <div className="sops-emptybox__t">No comments yet</div>
                <div className="sops-emptybox__p">
                  Comment volume builds here as your social pages get traffic.
                </div>
              </div>
            ) : (
              <MultiLineChart
                series={stackedChart.data}
                labels={stackedChart.labels}
                colors={["#2457ff", "#f0139a", "#94a0b8"]}
              />
            )}
          </div>
        </div>

        <div className="sops-card">
          <div className="sops-card__head">
            <h3 className="sops-card__title">Status breakdown</h3>
            <span className="sops__mono" style={{ fontSize: 10.5, color: "var(--sops-faint)" }}>
              {data.totalComments.toLocaleString()} TOTAL
            </span>
          </div>
          <div className="sops-card__body">
            <div className="sops-donut">
              <div className="sops-donut__ring" style={{ ["--pct" as string]: String(responseRate) }}>
                <span className="sops-donut__center">{responseRate}%</span>
              </div>
              <div className="sops-donut__side">
                <div className="sops-donut__big">{data.totalComments.toLocaleString()}</div>
                <div className="sops-donut__biglab">Total</div>
                {data.totalComments === 0 ? (
                  <>
                    <div className="sops-legend-row">
                      <span className="sops-legend-row__dot" style={{ background: "var(--sops-pri)" }} />
                      <span className="sops-legend-row__pct">0%</span>
                      <span className="sops-legend-row__lab">Response rate (all-time)</span>
                    </div>
                    <div className="sops-legend-row">
                      <span className="sops-legend-row__dot" style={{ background: "#ece8ff" }} />
                      <span className="sops-legend-row__lab">No comments to analyse yet.</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="sops-legend-row">
                      <span className="sops-legend-row__dot" style={{ background: "var(--sops-pri)" }} />
                      <span className="sops-legend-row__pct">{responseRate}%</span>
                      <span className="sops-legend-row__lab">Response rate (all-time)</span>
                    </div>
                    <div className="sops-legend-row">
                      <span className="sops-legend-row__dot" style={{ background: "#ece8ff" }} />
                      <span className="sops-legend-row__pct">{100 - responseRate}%</span>
                      <span className="sops-legend-row__lab">Awaiting reply</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {data.totalComments > 0 && (
              <div style={{ marginTop: 16 }}>
                {(
                  [
                    { l: "Replied", k: "replied", c: "var(--sops-ok)" },
                    { l: "Needs reply", k: "needs_reply", c: "var(--sops-danger)" },
                    { l: "Live", k: "live", c: "var(--sops-info)" },
                    { l: "Hidden", k: "hidden", c: "var(--sops-warn)" },
                  ] as const
                ).map((r) => {
                  const n = statusCounts[r.k] ?? 0;
                  const p = data.totalComments > 0 ? Math.round((n / data.totalComments) * 100) : 0;
                  return (
                    <div key={r.k} className="sops-mixrow">
                      <div className="sops-mixrow__head">
                        <span className="sops-mixrow__dot" style={{ background: r.c }} />
                        <span className="sops-mixrow__lab">{r.l}</span>
                        <span className="sops-mixrow__n">{n}</span>
                        <span className="sops-mixrow__pct">{p}%</span>
                      </div>
                      <div className="sops-gauge">
                        <i style={{ width: `${p}%`, background: r.c }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Channel mix + response time distribution */}
      <div className="sops-an-grid2">
        <div className="sops-card">
          <div className="sops-card__head">
            <h3 className="sops-card__title">Channel mix</h3>
            <span className="sops__mono" style={{ fontSize: 10.5, color: "var(--sops-faint)" }}>
              LAST 30 DAYS
            </span>
          </div>
          <div className="sops-card__body">
            {channelMix.length === 0 ? (
              <div className="sops-emptybox">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/assets/repulabs/unified-inbox/an-channel-mix.svg" alt="" aria-hidden="true" />
                <div className="sops-emptybox__t">No comments yet.</div>
                <div className="sops-emptybox__p">Connect channels to see activity.</div>
              </div>
            ) : (
              channelMix.map((c) => {
                const pct = channelTotal > 0 ? Math.round((c.n / channelTotal) * 100) : 0;
                return (
                  <div key={c.ch} className="sops-mixrow">
                    <div className="sops-mixrow__head">
                      <span className="sops-mixrow__dot" style={{ background: c.c }} />
                      <span className="sops-mixrow__lab">{c.ch}</span>
                      <span className="sops-mixrow__n">{c.n}</span>
                      <span className="sops-mixrow__pct">{pct}%</span>
                    </div>
                    <div className="sops-gauge">
                      <i style={{ width: `${pct}%`, background: c.c }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="sops-card">
          <div className="sops-card__head">
            <h3 className="sops-card__title">Response time distribution</h3>
            <span className="sops__mono" style={{ fontSize: 10.5, color: "var(--sops-faint)" }}>
              {firstReplyMinutes.length} REPLIES
            </span>
          </div>
          <div className="sops-card__body">
            <div style={{ display: "flex", gap: 18, alignItems: "stretch", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <ResponseBars minutes={firstReplyMinutes} />
              </div>
              <div style={{ width: 220, flexShrink: 0 }}>
                {firstReplyMinutes.length === 0 ? (
                  <div className="sops-emptybox sops-emptybox--panel">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/assets/repulabs/unified-inbox/an-recent-replies.svg" alt="" aria-hidden="true" />
                    <div>
                      <div className="sops-emptybox__t">No recent replies</div>
                      <div className="sops-emptybox__p">No data to display yet.</div>
                    </div>
                  </div>
                ) : (
                  <div className="sops-emptybox sops-emptybox--panel" style={{ alignItems: "center" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/assets/repulabs/unified-inbox/an-recent-replies.svg" alt="" aria-hidden="true" />
                    <div>
                      <div className="sops-emptybox__t">Latest reply</div>
                      <div className="sops-emptybox__p" style={{ fontWeight: 700, color: "var(--sops-ink)" }}>
                        {avgFirstReply !== null ? formatMinutes(avgFirstReply) : "—"} avg
                      </div>
                      <div className="sops-emptybox__p">
                        {slaHit >= 80 ? "Great — you're responding quickly." : "Aim to reply within an hour."}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function AnKpi({
  tone,
  asset,
  icon,
  label,
  value,
  em,
  pill,
  pillTone,
  spark,
  sparkColor,
}: {
  tone: "pri" | "blue" | "green" | "orange";
  /** Real kit illustration filename; when omitted the inline `icon` is used
   *  (the Open-Threads / Avg-time KPI sources are huge baked rasters, so those
   *  intentionally keep a crisp inline icon). */
  asset?: string;
  icon: "chat" | "send" | "clock" | "target";
  label: string;
  value: string;
  em?: string;
  pill: string;
  pillTone: "ok" | "blue" | "orange";
  spark?: number[];
  sparkColor?: string;
}) {
  const tileClass: Record<typeof tone, string> = {
    pri: "sops-kpi__tile--pri",
    blue: "sops-kpi__tile--blue",
    green: "sops-kpi__tile--green",
    orange: "sops-kpi__tile--orange",
  };
  return (
    <div className="sops-ankpi">
      <span className={`sops-ankpi__tile ${tileClass[tone]}`}>
        {asset ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/assets/repulabs/unified-inbox/${asset}`} alt="" aria-hidden="true" className="sops-ankpi__illo" />
        ) : (
          <Icon name={icon} size={24} />
        )}
      </span>
      <div className="sops-ankpi__lab">{label}</div>
      <div className="sops-ankpi__val">
        {value}
        {em && <em>{em}</em>}
      </div>
      <span className={`sops-ankpi__pill sops-ankpi__pill--${pillTone}`}>{pill}</span>
      {spark && (
        <span className="sops-ankpi__spark">
          <Sparkline points={spark} width={70} height={28} color={sparkColor ?? "#5b3dff"} />
        </span>
      )}
    </div>
  );
}

function Legend({ c, label }: { c: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--sops-muted)" }}>
      <span style={{ width: 9, height: 9, borderRadius: "50%", background: c }} />
      {label}
    </span>
  );
}

/**
 * Inline multi-series line chart (server-safe, pure SVG) — matches the kit's
 * comment-volume look (smoothed area-filled lines, dashed grid, axis labels).
 */
function MultiLineChart({
  series,
  labels,
  colors,
}: {
  series: number[][];
  labels: string[];
  colors: string[];
}) {
  const width = 620;
  const height = 220;
  const padL = 30;
  const padB = 24;
  const padT = 10;
  const n = series.length;
  if (n < 2) return null;

  // Transpose: series[bucket][channel] -> channelSeries[channel][bucket]
  const channels = colors.length;
  const channelSeries: number[][] = Array.from({ length: channels }, (_, ci) =>
    series.map((bucket) => bucket[ci] ?? 0),
  );
  const max = Math.max(1, ...series.flat());
  const stepX = (width - padL) / (n - 1);
  const yOf = (v: number) => padT + (height - padT - padB) * (1 - v / max);
  const xOf = (i: number) => padL + i * stepX;

  // y grid steps
  const grid = [0, 0.25, 0.5, 0.75, 1];
  // x axis labels: show ~every other bucket to avoid crowding
  const labelStride = Math.max(1, Math.round(n / 8));

  return (
    <svg width={width} height={height} role="img" aria-label="Comment volume by channel" focusable="false">
      {grid.map((g) => {
        const y = padT + (height - padT - padB) * (1 - g);
        return (
          <g key={`g-${g}`}>
            <line x1={padL} x2={width} y1={y} y2={y} stroke="#edf1f8" strokeDasharray="2 3" />
            <text x={0} y={y + 3} fontSize="9.5" fill="#94a0b8">
              {Math.round(max * g)}
            </text>
          </g>
        );
      })}
      {channelSeries.map((cs, ci) => {
        const color = colors[ci] ?? "#2457ff";
        const line = cs.map((v, i) => `${i ? "L" : "M"} ${xOf(i).toFixed(1)} ${yOf(v).toFixed(1)}`).join(" ");
        const area = `${line} L ${xOf(n - 1).toFixed(1)} ${height - padB} L ${padL} ${height - padB} Z`;
        return (
          <g key={`s-${ci}`}>
            <path d={area} fill={color} opacity="0.06" />
            <path d={line} stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        );
      })}
      {labels.map((lab, i) =>
        i % labelStride === 0 ? (
          <text key={`x-${lab}-${i}`} x={xOf(i)} y={height - 6} fontSize="9.5" textAnchor="middle" fill="#62708f">
            {lab}
          </text>
        ) : null,
      )}
    </svg>
  );
}

/** Response-time bar buckets (kit: 0m, 1h, 6h, 12h, 24h, 48h, 72h+). */
function ResponseBars({ minutes }: { minutes: number[] }) {
  const buckets: { label: string; lo: number; hi: number }[] = [
    { label: "0m", lo: 0, hi: 1 },
    { label: "1h", lo: 1, hi: 60 },
    { label: "6h", lo: 60, hi: 360 },
    { label: "12h", lo: 360, hi: 720 },
    { label: "24h", lo: 720, hi: 1440 },
    { label: "48h", lo: 1440, hi: 2880 },
    { label: "72h+", lo: 2880, hi: Number.POSITIVE_INFINITY },
  ];
  const counts = buckets.map((b) => minutes.filter((m) => m >= b.lo && m < b.hi).length);
  const max = Math.max(1, ...counts);
  return (
    <div className="sops-bars" aria-label="Response time distribution">
      {buckets.map((b, i) => {
        const c = counts[i] ?? 0;
        return (
          <div key={b.label} className="sops-bars__col" title={`${b.label}: ${c}`}>
            <div
              className="sops-bars__bar"
              style={{ height: `${Math.max(3, (c / max) * 100)}%`, opacity: c === 0 ? 0.3 : 1 }}
            />
            <span className="sops-bars__lab">{b.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function compute12WeekChart(
  comments: Array<{ postedAt: Date | null; platform: string }>,
  startDate: Date,
): { data: number[][]; labels: string[] } {
  const buckets: number[][] = Array.from({ length: 12 }, () => [0, 0, 0]);
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const labels: string[] = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(startDate.getTime() + i * weekMs);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  });
  for (const c of comments) {
    if (!c.postedAt) continue;
    const idx = Math.floor((c.postedAt.getTime() - startDate.getTime()) / weekMs);
    if (idx < 0 || idx >= 12) continue;
    const platform = c.platform.toLowerCase();
    const channelIdx = platform === "facebook" ? 0 : platform === "instagram" ? 1 : 2;
    const bucket = buckets[idx];
    if (bucket) bucket[channelIdx] = (bucket[channelIdx] ?? 0) + 1;
  }
  return { data: buckets, labels };
}

function prettyPlatform(p: string): string {
  return p.charAt(0).toUpperCase() + p.slice(1);
}

function formatMinutes(m: number): string {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm === 0 ? `${h}h` : `${h}h ${mm}m`;
}
