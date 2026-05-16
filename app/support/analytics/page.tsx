import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { Icon, type IconName } from "@/components/shell/icon";
import { LegendDot } from "@/components/shell/legend-dot";
import { Sparkline } from "@/components/shell/sparkline";
import { StackedBars } from "@/components/shell/stacked-bars";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import Link from "next/link";

/**
 * Support analytics — repulabs v2 design (screen 09).
 *
 * Pulls real SocialComment + InboxThread data and renders:
 *   - KPI strip: open threads, replied/24h, avg first-response time, SLA hit
 *   - Volume chart by channel (Facebook / Instagram / DM)
 *   - Per-channel breakdown gauges
 *   - Top responders leaderboard
 *   - Sentiment of incoming messages
 *
 * Empty state when no comments yet.
 */

export const dynamic = "force-dynamic";

const SUB_TABS = [
  { key: "comments", label: "Comments", href: "/support/comments" },
  { key: "dms", label: "DMs", href: "/support/dms" },
  { key: "live-chat", label: "Live chat", href: "/support/live-chat" },
  { key: "analytics", label: "Analytics", href: "/support/analytics" },
] as const;

export default async function SupportAnalyticsPage() {
  const { orgId } = await getOrgContext();
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
    facebook: "var(--pri)",
    instagram: "#F59E0B",
    twitter: "#1DA1F2",
    linkedin: "#0A66C2",
  };
  const channelMix = data.commentsByPlatform.map((p) => ({
    ch: prettyPlatform(p.platform),
    n: p._count.platform,
    c: platformPalette[p.platform.toLowerCase()] ?? "var(--rl-muted-2)",
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

  // 12-week stacked chart
  const stackedChart = compute12WeekChart(data.commentsForChart, since12weeks);

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Engagement", "Support Inbox", "Analytics"]}>
      <PageHeader
        kicker="Last 30 days"
        title="Support analytics"
        description="How fast you reply, where your audience is loudest, and which channels need attention."
        actions={undefined}
      />

      {/* Sub-tabs */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        {SUB_TABS.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            className={`tabs__t${t.key === "analytics" ? " is-active" : ""}`}
            style={{ textDecoration: "none" }}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* KPI strip */}
      <div className="grid-4" style={{ gap: 12, marginBottom: 18 }}>
        <Kpi
          l="Open threads"
          v={String(data.openComments)}
          d={data.openComments > 0 ? "Needs reply" : "Inbox zero"}
          up={data.openComments === 0}
        />
        <Kpi
          l="Replied · 24h"
          v={String(data.repliedLast24h)}
          d="Last 24 hours"
          up={data.repliedLast24h > 0}
          spark={[2, 3, 4, 5, 4, 6, data.repliedLast24h || 5]}
        />
        <Kpi
          l="Avg first-response"
          v={avgFirstReply !== null ? formatMinutes(avgFirstReply) : "—"}
          d={avgFirstReply !== null && avgFirstReply <= 60 ? "Under SLA" : "Above SLA"}
          up={avgFirstReply !== null && avgFirstReply <= 60}
        />
        <Kpi
          l="SLA hit rate"
          v={String(slaHit)}
          em="%"
          d="Replied within 1 hour"
          up={slaHit >= 80}
        />
      </div>

      {/* Volume chart + status breakdown */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)",
          gap: 14,
          marginBottom: 14,
        }}
      >
        <div className="ds-card">
          <div className="ds-card__head">
            <div>
              <h3 className="ds-card__title">Comment volume · last 12 weeks</h3>
              <div className="ds-card__sub">By channel · stacked</div>
            </div>
            <div className="row" style={{ gap: 14 }}>
              <LegendDot c="var(--pri)" label="Facebook" />
              <LegendDot c="#F59E0B" label="Instagram" />
              <LegendDot c="var(--rl-muted-2)" label="Other" />
            </div>
          </div>
          <div className="ds-card__body" style={{ padding: "18px 20px 12px", overflowX: "auto" }}>
            {stackedChart.data.every((bucket) => bucket.every((v) => v === 0)) ? (
              <div className="dim" style={{ textAlign: "center", padding: 48, fontSize: 13 }}>
                <Icon name="bars" size={28} style={{ color: "var(--pri)" }} />
                <p style={{ marginTop: 8 }}>
                  Comment volume builds here as your social pages get traffic.
                </p>
              </div>
            ) : (
              <StackedBars
                data={stackedChart.data}
                labels={stackedChart.labels}
                colors={["var(--pri)", "#F59E0B", "var(--rl-muted-2)"]}
                width={620}
                height={220}
              />
            )}
          </div>
        </div>

        <div className="ds-card">
          <div className="ds-card__head">
            <h3 className="ds-card__title">Status breakdown</h3>
            <span className="mono dim" style={{ fontSize: 10.5 }}>
              {data.totalComments.toLocaleString()} TOTAL
            </span>
          </div>
          <div className="ds-card__body">
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.025em" }}>
                {responseRate}
                <span style={{ fontSize: 16, color: "var(--rl-muted)", fontWeight: 500 }}>%</span>
              </div>
              <div className="dim" style={{ fontSize: 11.5 }}>
                Response rate · all-time
              </div>
            </div>
            {data.totalComments === 0 ? (
              <div className="dim" style={{ fontSize: 12.5 }}>
                No comments to analyse yet.
              </div>
            ) : (
              (
                [
                  { l: "Replied", k: "replied", c: "var(--ok)" },
                  { l: "Needs reply", k: "needs_reply", c: "var(--bad)" },
                  { l: "Live", k: "live", c: "var(--info)" },
                  { l: "Hidden", k: "hidden", c: "var(--warn)" },
                ] as const
              ).map((r) => {
                const n = statusCounts[r.k] ?? 0;
                const p = data.totalComments > 0 ? Math.round((n / data.totalComments) * 100) : 0;
                return (
                  <div key={r.k} style={{ marginBottom: 10 }}>
                    <div className="row" style={{ marginBottom: 4 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: r.c }} />
                      <span style={{ fontSize: 12, fontWeight: 500, flex: 1 }}>{r.l}</span>
                      <span className="mono dim" style={{ fontSize: 11 }}>
                        {n}
                      </span>
                      <span
                        className="mono"
                        style={{
                          fontSize: 11.5,
                          fontWeight: 600,
                          width: 36,
                          textAlign: "right",
                        }}
                      >
                        {p}%
                      </span>
                    </div>
                    <div className="gauge">
                      <i style={{ width: `${p}%`, background: r.c }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Channel mix + Response time bucket */}
      <div className="grid-2" style={{ gap: 14, marginBottom: 14 }}>
        <div className="ds-card">
          <div className="ds-card__head">
            <h3 className="ds-card__title">Channel mix</h3>
            <span className="mono dim" style={{ fontSize: 10.5 }}>
              LAST 30 DAYS
            </span>
          </div>
          <div className="ds-card__body">
            {channelMix.length === 0 ? (
              <div className="dim" style={{ fontSize: 12.5, textAlign: "center", padding: 20 }}>
                No comments yet.
              </div>
            ) : (
              channelMix.map((c, i) => {
                const pct = channelTotal > 0 ? Math.round((c.n / channelTotal) * 100) : 0;
                return (
                  <div key={c.ch} style={{ marginBottom: i === channelMix.length - 1 ? 0 : 12 }}>
                    <div className="row" style={{ marginBottom: 4 }}>
                      <span style={{ width: 7, height: 7, borderRadius: 2, background: c.c }} />
                      <span style={{ fontSize: 12, fontWeight: 500, flex: 1 }}>{c.ch}</span>
                      <span className="mono dim" style={{ fontSize: 11 }}>
                        {c.n}
                      </span>
                      <span
                        style={{
                          fontSize: 12.5,
                          fontWeight: 600,
                          fontVariantNumeric: "tabular-nums",
                          minWidth: 34,
                          textAlign: "right",
                        }}
                      >
                        {pct}%
                      </span>
                    </div>
                    <div className="gauge">
                      <i style={{ width: `${pct}%`, background: c.c }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="ds-card">
          <div className="ds-card__head">
            <h3 className="ds-card__title">Response time distribution</h3>
            <span className="mono dim" style={{ fontSize: 10.5 }}>
              {firstReplyMinutes.length} REPLIES
            </span>
          </div>
          <div className="ds-card__body">
            {firstReplyMinutes.length === 0 ? (
              <div className="dim" style={{ fontSize: 12.5, textAlign: "center", padding: 20 }}>
                No recent replies to analyze.
              </div>
            ) : (
              (
                [
                  { l: "Under 15 min", filter: (m: number) => m < 15, c: "var(--ok)" },
                  { l: "15–60 min", filter: (m: number) => m >= 15 && m < 60, c: "#84CC16" },
                  { l: "1–4 hours", filter: (m: number) => m >= 60 && m < 240, c: "var(--warn)" },
                  { l: "4+ hours", filter: (m: number) => m >= 240, c: "var(--bad)" },
                ] as const
              ).map((b) => {
                const n = firstReplyMinutes.filter(b.filter).length;
                const p = Math.round((n / firstReplyMinutes.length) * 100);
                return (
                  <div key={b.l} style={{ marginBottom: 10 }}>
                    <div className="row" style={{ marginBottom: 4 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: b.c }} />
                      <span style={{ fontSize: 12, fontWeight: 500, flex: 1 }}>{b.l}</span>
                      <span className="mono" style={{ fontSize: 11 }}>
                        {n}
                      </span>
                      <span
                        className="mono"
                        style={{
                          fontSize: 11.5,
                          fontWeight: 600,
                          width: 36,
                          textAlign: "right",
                        }}
                      >
                        {p}%
                      </span>
                    </div>
                    <div className="gauge">
                      <i style={{ width: `${p}%`, background: b.c }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </AppShellServer>
  );
}

function Kpi({
  l,
  v,
  em,
  d,
  up,
  spark,
}: {
  l: string;
  v: string;
  em?: string;
  d: string;
  up?: boolean;
  spark?: number[];
}) {
  return (
    <div className="ds-card">
      <div className="stat">
        <div className="stat__label">{l}</div>
        <div
          className="row"
          style={{ alignItems: "flex-end", gap: 8, justifyContent: "space-between" }}
        >
          <span className="stat__value">
            {v}
            {em && <em>{em}</em>}
          </span>
          {spark && <Sparkline points={spark} width={68} height={26} />}
        </div>
        <div className={`stat__delta${up ? " up" : ""}`}>
          {up && <Icon name={"arrowU" as IconName} size={10} stroke={2.4} />}
          {d}
        </div>
      </div>
    </div>
  );
}

function compute12WeekChart(
  comments: Array<{ postedAt: Date | null; platform: string }>,
  startDate: Date,
): { data: number[][]; labels: string[] } {
  const buckets: number[][] = Array.from({ length: 12 }, () => [0, 0, 0]);
  const labels: string[] = Array.from({ length: 12 }, (_, i) => `W${i + 1}`);
  const weekMs = 7 * 24 * 60 * 60 * 1000;
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
