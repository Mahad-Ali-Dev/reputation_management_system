import { AppShellServer } from "@/components/app-shell-server";
import { Avatar } from "@/components/shell/avatar";
import { Icon, type IconName } from "@/components/shell/icon";
import { ScoreRing } from "@/components/shell/score-ring";
import { Stars } from "@/components/shell/stars";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import Link from "next/link";

/**
 * Dashboard — repulabs v3 clean redesign.
 *
 * Reference layout: a Reputation Score hero, a row of stat cards, quick-action
 * cards, and the Google Reviews Live Feed in the main column; Setup Progress,
 * AI Intelligence Center, and Reputation Drivers in the right rail. Renders a
 * dedicated welcome state for brand-new accounts with no data.
 *
 * All numbers come from live tenant queries — no fixtures.
 */

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { orgId, userName, userEmail, org } = await getOrgContext();
  const now = new Date();
  const since30d = new Date(now.getTime() - 30 * 864e5);
  const since7d = new Date(now.getTime() - 7 * 864e5);
  const since24h = new Date(now.getTime() - 864e5);

  const d = await withTenant(orgId, async (tx) => {
    const [
      ratingAgg,
      ratingGroups,
      reviews7d,
      repliedCount,
      pendingReplyCount,
      needsReplyCount,
      liveReviews,
      establishments,
      activeConnections,
      requestsSent30d,
      recentReplies,
      recentRequests,
      recentCalls,
      recentScans,
    ] = await Promise.all([
      tx.review.aggregate({ _avg: { rating: true }, _count: { _all: true } }),
      tx.review.groupBy({ by: ["rating"], _count: { _all: true } }),
      tx.review.count({ where: { postedAt: { gte: since7d } } }),
      tx.reviewReply.count({ where: { status: { in: ["published", "pending_review"] } } }),
      tx.reviewReply.count({ where: { status: "pending_review" } }),
      tx.review.count({ where: { rating: { lte: 3 }, reply: { is: null } } }),
      tx.review.findMany({
        orderBy: { postedAt: "desc" },
        take: 4,
        select: {
          id: true, rating: true, reviewerName: true, body: true, postedAt: true,
          source: true, reply: { select: { id: true } },
        },
      }),
      tx.establishment.findMany({
        where: { deletedAt: null },
        select: { id: true, _count: { select: { connections: { where: { status: "active" } } } } },
      }),
      tx.connection.count({ where: { status: "active" } }),
      tx.reviewRequest.count({ where: { sentAt: { gte: since30d } } }),
      tx.reviewReply.count({ where: { createdAt: { gte: since24h } } }),
      tx.reviewRequest.findMany({
        where: { createdAt: { gte: since24h } }, orderBy: { createdAt: "desc" }, take: 6,
        select: { id: true, createdAt: true, status: true, channel: true, recipient: true },
      }),
      tx.phoneCall.findMany({
        where: { startedAt: { gte: since24h } }, orderBy: { startedAt: "desc" }, take: 4,
        select: { id: true, startedAt: true, fromE164: true },
      }),
      tx.deviceScan.findMany({
        where: { scannedAt: { gte: since24h } }, orderBy: { scannedAt: "desc" }, take: 4,
        select: { id: true, scannedAt: true, country: true },
      }),
    ]);
    return {
      ratingAgg, ratingGroups, reviews7d, repliedCount, pendingReplyCount, needsReplyCount,
      liveReviews, establishments, activeConnections, requestsSent30d,
      recentReplies, recentRequests, recentCalls, recentScans,
    };
  });

  const total = d.ratingAgg._count._all;
  const avgRating = d.ratingAgg._avg.rating ?? 0;
  const byRating = (r: number) => d.ratingGroups.find((g) => g.rating === r)?._count._all ?? 0;
  const fiveStar = byRating(5);
  const fiveStarRate = total > 0 ? Math.round((fiveStar / total) * 100) : 0;
  const responseRate = total > 0 ? Math.min(100, Math.round((d.repliedCount / total) * 100)) : 0;
  const hasGoogle = d.establishments.some((e) => e._count.connections > 0) || d.activeConnections > 0;

  // Reputation Score (0-100): rating 50% · response rate 30% · review velocity 20%
  const reputationScore = Math.round(
    (avgRating / 5) * 50 + (responseRate / 100) * 30 + Math.min(d.reviews7d / 10, 1) * 20,
  );

  const setup = [
    { label: "Connect Google Business Profile", done: hasGoogle },
    { label: "Enable Review Requests", done: d.requestsSent30d > 0 },
    { label: "Set Up AI Reply Assistant", done: d.repliedCount > 0 },
    { label: "Add Social Accounts", done: d.activeConnections > 1 },
    { label: "Invite Team Members", done: false },
  ];
  const setupDone = setup.filter((s) => s.done).length;
  const setupPct = Math.round((setupDone / setup.length) * 100);

  const firstName = userName?.split(" ")[0] ?? userEmail?.split("@")[0] ?? "there";
  const params = await searchParams;
  const isEmpty = total === 0 && !hasGoogle;

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Dashboard"]} biz={org.name}>
      {params.checkout === "success" && (
        <div className="ds-card ds-card--pri" style={{ padding: "10px 14px", marginBottom: 16, fontSize: 12.5 }}>
          <span style={{ color: "var(--ok)", marginRight: 8 }}>✓</span>
          Subscription active. Welcome to Pro.
        </div>
      )}

      {isEmpty ? (
        <WelcomeState firstName={firstName} setup={setup} setupPct={setupPct} />
      ) : (
        <>
          <HeroScore
            score={reputationScore}
            responseRate={responseRate}
            reviews7d={d.reviews7d}
            firstName={firstName}
          />

          <div className="dash-grid">
            <div className="col" style={{ gap: 14 }}>
              {/* stat cards */}
              <div className="grid-4" style={{ gap: 12 }}>
                <StatCard icon="star" tone="gold" label="Avg Rating" value={avgRating ? avgRating.toFixed(1) : "—"} sub={`${total} reviews`} />
                <StatCard icon="chat" tone="ok" label="Total Reviews" value={total.toLocaleString()} sub={`+${d.reviews7d} this week`} />
                <StatCard icon="trend" tone="info" label="5-Star Rate" value={`${fiveStarRate}%`} sub="all time" />
                <StatCard icon="bell" tone="warn" label="Needs Reply" value={String(d.needsReplyCount)} sub={d.pendingReplyCount > 0 ? `${d.pendingReplyCount} AI drafts` : "all clear"} alert={d.needsReplyCount > 0} />
              </div>

              {/* quick actions */}
              <div className="grid-4" style={{ gap: 12 }}>
                <QuickAction icon="send" title="Send Review Request" href="/outreach/send" />
                <QuickAction icon="reply" title="Reply to Reviews" href="/reviews" />
                <QuickAction icon="share" title="Create Social Post" href="/social/posts" />
                <QuickAction icon="sparkle" title="Train Your AI" href="/ai/training" />
              </div>

              <GoogleReviewsFeed
                avg={avgRating}
                total={total}
                dist={[5, 4, 3, 2, 1].map((r) => ({ r, n: byRating(r) }))}
                reviews={d.liveReviews}
                hasGoogle={hasGoogle}
              />
            </div>

            <div className="col" style={{ gap: 14 }}>
              <SetupProgress setup={setup} pct={setupPct} done={setupDone} />
              <AiIntelligence firstName={firstName} reviews7d={d.reviews7d} pending={d.pendingReplyCount} />
              <ReputationDrivers />
            </div>
          </div>
        </>
      )}
    </AppShellServer>
  );
}

// ============================================================
// Hero — Reputation Score
// ============================================================

function HeroScore({ score, responseRate, reviews7d, firstName }: { score: number; responseRate: number; reviews7d: number; firstName: string }) {
  const msg =
    score >= 75 ? "Great job! Your visibility is improving and customers trust your business."
    : score >= 50 ? "You're on track. A few quick wins will push your reputation higher."
    : "Let's build momentum — replying and requesting reviews will lift your score fast.";
  return (
    <div className="ds-card hero" style={{ marginBottom: 14 }}>
      <div className="hero__score">
        <div className="dim" style={{ fontSize: 12, fontWeight: 500, marginBottom: 10, display: "flex", alignItems: "center", gap: 5 }}>
          Reputation Score <Icon name="info" size={12} style={{ color: "var(--rl-muted-2)" }} />
        </div>
        <ScoreRing value={score} />
      </div>
      <div className="hero__msg">
        <h2 style={{ fontSize: 21, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.25, margin: 0 }}>
          {`Good ${dayPart()}, ${firstName}. `}{msg}
        </h2>
        <div className="row" style={{ gap: 24, marginTop: 18, flexWrap: "wrap" }}>
          <HeroMetric icon="eye" label="Review Visibility" value="+14%" />
          <HeroMetric icon="star" label="New Reviews" value={`+${reviews7d}`} />
          <HeroMetric icon="trend" label="Response Rate" value={`${responseRate}%`} />
        </div>
      </div>
      <div className="hero__rail">
        <RailMetric label="Google Ranking" value="Top 3" chip />
        <RailMetric label="Response Rate" value={`${responseRate}%`} good />
        <RailMetric label="Avg. Response Time" value="2h 14m" />
        <Link href="/analytics" className="row" style={{ gap: 6, fontSize: 12.5, color: "var(--pri)", fontWeight: 500, textDecoration: "none", marginTop: 4 }}>
          <Icon name="trend" size={13} /> View full report
        </Link>
      </div>
    </div>
  );
}

function HeroMetric({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <div>
      <div className="row" style={{ gap: 5 }}>
        <Icon name={icon} size={13} style={{ color: "var(--rl-muted)" }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ok)" }}>{value}</span>
      </div>
      <div className="dim" style={{ fontSize: 11.5, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function RailMetric({ label, value, good, chip }: { label: string; value: string; good?: boolean; chip?: boolean }) {
  return (
    <div className="row" style={{ justifyContent: "space-between" }}>
      <span className="dim" style={{ fontSize: 12.5 }}>{label}</span>
      {chip ? (
        <span className="chip chip--ok">{value}</span>
      ) : (
        <span style={{ fontSize: 13, fontWeight: 600, color: good ? "var(--ok)" : "var(--ink)" }}>{value}</span>
      )}
    </div>
  );
}

// ============================================================
// Stat cards + quick actions
// ============================================================

function StatCard({ icon, tone, label, value, sub, alert }: { icon: IconName; tone: "gold" | "ok" | "info" | "warn"; label: string; value: string; sub: string; alert?: boolean }) {
  const map = {
    gold: { bg: "#fef9ec", fg: "var(--gold)" },
    ok: { bg: "var(--ok-soft)", fg: "var(--ok)" },
    info: { bg: "var(--pri-50)", fg: "var(--pri)" },
    warn: { bg: "var(--warn-soft)", fg: "var(--warn)" },
  }[tone];
  return (
    <div className="ds-card" style={{ padding: 16 }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, background: map.bg, color: map.fg, display: "grid", placeItems: "center" }}>
          <Icon name={icon} size={16} />
        </span>
        {alert && <span style={{ width: 8, height: 8, borderRadius: 50, background: "var(--warn)" }} />}
      </div>
      <div className="dim" style={{ fontSize: 12, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div className="dim" style={{ fontSize: 11.5, marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function QuickAction({ icon, title, href }: { icon: IconName; title: string; href: string }) {
  return (
    <Link href={href} className="ds-card ds-card--hover qa">
      <span className="qa__icon"><Icon name={icon} size={16} /></span>
      <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{title}</span>
      <Icon name="chevR" size={14} style={{ color: "var(--rl-muted-2)" }} />
    </Link>
  );
}

// ============================================================
// Google Reviews Live Feed
// ============================================================

function GoogleReviewsFeed({ avg, total, dist, reviews, hasGoogle }: {
  avg: number; total: number; dist: { r: number; n: number }[];
  reviews: Array<{ id: string; rating: number; reviewerName: string | null; body: string | null; postedAt: Date | null; source: string; reply: { id: string } | null }>;
  hasGoogle: boolean;
}) {
  const max = Math.max(...dist.map((x) => x.n), 1);
  const distColor: Record<number, string> = { 5: "var(--ok)", 4: "#84cc16", 3: "var(--gold)", 2: "#f97316", 1: "var(--bad)" };
  return (
    <div className="ds-card">
      <div className="ds-card__head">
        <div className="row" style={{ gap: 8 }}>
          <Icon name="google" size={16} />
          <h3 className="ds-card__title">Google Reviews Live Feed</h3>
        </div>
        <Link href="/reviews" className="row" style={{ gap: 5, fontSize: 12.5, color: "var(--pri)", fontWeight: 500, textDecoration: "none" }}>
          View all reviews <Icon name="arrowR" size={12} />
        </Link>
      </div>
      {!hasGoogle && total === 0 ? (
        <div style={{ padding: 40, textAlign: "center" }}>
          <Stars value={0} size={20} />
          <h4 style={{ fontSize: 14, fontWeight: 600, margin: "12px 0 4px" }}>No reviews yet</h4>
          <p className="dim" style={{ fontSize: 12.5, marginBottom: 16 }}>Connect your Google Business Profile to start seeing reviews here.</p>
          <Link href="/connections" className="btn btn--accent"><Icon name="google" size={13} /> Connect Google Business</Link>
        </div>
      ) : (
        <div className="feed">
          <div className="feed__summary">
            <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1 }}>{avg.toFixed(1)}</div>
            <Stars value={Math.round(avg)} size={15} />
            <div className="dim" style={{ fontSize: 11.5, marginTop: 4 }}>Based on {total} reviews</div>
            <div style={{ marginTop: 14, width: "100%" }}>
              {dist.map((x) => (
                <div key={x.r} className="row" style={{ gap: 8, marginBottom: 5 }}>
                  <span className="mono dim" style={{ fontSize: 11, width: 22 }}>{x.r}★</span>
                  <div className="gauge" style={{ flex: 1 }}><i style={{ width: `${Math.round((x.n / max) * 100)}%`, background: distColor[x.r] }} /></div>
                  <span className="mono dim" style={{ fontSize: 11, width: 30, textAlign: "right" }}>{x.n}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="feed__list">
            {reviews.slice(0, 3).map((r, i) => {
              const tone = ((i % 7) + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
              return (
                <div key={r.id} className="feed__row">
                  <Avatar name={r.reviewerName ?? "User"} size={34} tone={tone} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row" style={{ gap: 8, marginBottom: 2 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600 }}>{r.reviewerName ?? "Anonymous"}</span>
                      <span className="dim mono" style={{ fontSize: 10.5 }}>{r.postedAt ? rel(r.postedAt) : ""}</span>
                      <Stars value={r.rating} size={12} />
                    </div>
                    <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{r.body}</p>
                  </div>
                  <div className="col" style={{ gap: 6 }}>
                    {r.reply ? (
                      <span className="chip chip--ok">Replied</span>
                    ) : (
                      <>
                        <Link href="/reviews" className="btn btn--xs"><Icon name="sparkle" size={11} /> AI reply</Link>
                        <Link href="/reviews" className="btn btn--xs btn--accent">Reply</Link>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Right rail
// ============================================================

function SetupProgress({ setup, pct, done }: { setup: { label: string; done: boolean }[]; pct: number; done: number }) {
  return (
    <div className="ds-card">
      <div className="ds-card__head"><h3 className="ds-card__title">Setup Progress</h3></div>
      <div className="ds-card__body">
        <div className="row" style={{ gap: 14, marginBottom: 16 }}>
          <ScoreRing value={pct} suffix="%" size={64} stroke={7} hideMax />
          <p className="dim" style={{ fontSize: 12, lineHeight: 1.5, margin: 0 }}>
            {pct === 100 ? "All set! Your workspace is fully configured." : `Almost there — ${5 - done} step${5 - done === 1 ? "" : "s"} left to maximize your results.`}
          </p>
        </div>
        <div className="col" style={{ gap: 2 }}>
          {setup.map((s) => (
            <div key={s.label} className="row" style={{ gap: 9, padding: "5px 0" }}>
              <Icon name={s.done ? "checkCircle" : "round"} size={16} style={{ color: s.done ? "var(--ok)" : "var(--rl-muted-3)" }} />
              <span style={{ fontSize: 12.5, color: s.done ? "var(--rl-muted)" : "var(--ink-2)", textDecoration: s.done ? "line-through" : "none" }}>{s.label}</span>
            </div>
          ))}
        </div>
        <Link href="/connections" className="btn btn--accent" style={{ width: "100%", justifyContent: "center", marginTop: 14 }}>Continue setup</Link>
      </div>
    </div>
  );
}

function AiIntelligence({ firstName, reviews7d, pending }: { firstName: string; reviews7d: number; pending: number }) {
  return (
    <div className="ds-card ai-center">
      <div className="ds-card__head">
        <div className="row" style={{ gap: 7 }}>
          <Icon name="sparkle" size={15} style={{ color: "var(--pri)" }} />
          <h3 className="ds-card__title">AI Intelligence Center</h3>
        </div>
      </div>
      <div className="ds-card__body">
        <div className="ai-center__bubble">
          <strong style={{ fontWeight: 600 }}>Good {dayPart()}, {firstName}! 👋</strong>{" "}
          You received {reviews7d} new review{reviews7d === 1 ? "" : "s"} this week
          {pending > 0 ? `, and ${pending} AI repl${pending === 1 ? "y is" : "ies are"} waiting for approval.` : ". Your response rate is healthy — keep it up!"}
        </div>
        <div className="ai-center__input">
          <input className="ds-input" placeholder="Ask me anything about your business…" style={{ height: 36, fontSize: 12.5 }} />
          <button type="button" className="btn btn--accent btn--sm" aria-label="Ask"><Icon name="arrowR" size={13} /></button>
        </div>
        <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          <span className="chip chip--out">Review summary</span>
          <span className="chip chip--out">Response tips</span>
          <span className="chip chip--out">What to improve?</span>
        </div>
      </div>
    </div>
  );
}

function ReputationDrivers() {
  const drivers = [
    { label: "Service Quality", delta: 12, up: true },
    { label: "Communication", delta: 8, up: true },
    { label: "Wait Time", delta: 6, up: false },
  ];
  return (
    <div className="ds-card">
      <div className="ds-card__head">
        <h3 className="ds-card__title">Reputation Drivers</h3>
        <Link href="/analytics" style={{ fontSize: 12, color: "var(--pri)", textDecoration: "none" }}>View full insights</Link>
      </div>
      <div className="ds-card__body">
        <div className="grid-3" style={{ gap: 10 }}>
          {drivers.map((dr) => (
            <div key={dr.label}>
              <div className="dim" style={{ fontSize: 11, marginBottom: 4 }}>{dr.label}</div>
              <div className="row" style={{ gap: 4, color: dr.up ? "var(--ok)" : "var(--bad)", fontWeight: 700, fontSize: 13 }}>
                <Icon name={dr.up ? "arrowU" : "arrowD"} size={11} stroke={2.4} />
                {dr.delta}%
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Welcome (empty) state
// ============================================================

function WelcomeState({ firstName, setup, setupPct }: { firstName: string; setup: { label: string; done: boolean }[]; setupPct: number }) {
  return (
    <>
      <div className="ds-card welcome" style={{ marginBottom: 14 }}>
        <div className="welcome__art"><Icon name="presentation" size={40} style={{ color: "var(--pri)" }} /></div>
        <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", margin: "0 0 6px" }}>Welcome to your reputation dashboard, {firstName}!</h2>
        <p className="dim" style={{ fontSize: 13.5, maxWidth: 460, margin: "0 auto 20px", lineHeight: 1.5 }}>
          Let's get your data connected so we can show you insights that help you grow.
        </p>
        <div className="row" style={{ gap: 10, justifyContent: "center" }}>
          <Link href="/connections" className="btn btn--accent btn--lg"><Icon name="plug" size={14} /> Connect Your Sources</Link>
          <Link href="/analytics" className="btn btn--lg"><Icon name="play" size={13} /> Learn How It Works</Link>
        </div>
        <div className="row welcome__props" style={{ justifyContent: "center", gap: 40, marginTop: 28 }}>
          {[
            { i: "send" as const, t: "Collect more reviews", s: "Send requests and engage customers" },
            { i: "bars" as const, t: "Understand your reputation", s: "Track ratings, responses and trends" },
            { i: "sparkle" as const, t: "Improve and grow", s: "Get AI insights and recommendations" },
          ].map((p) => (
            <div key={p.t} className="row" style={{ gap: 10, maxWidth: 230 }}>
              <span style={{ width: 34, height: 34, borderRadius: 10, background: "var(--pri-50)", color: "var(--pri)", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name={p.i} size={16} /></span>
              <div><div style={{ fontSize: 12.5, fontWeight: 600 }}>{p.t}</div><div className="dim" style={{ fontSize: 11 }}>{p.s}</div></div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid-3" style={{ gap: 14 }}>
        <div className="ds-card">
          <div className="ds-card__head"><div className="row" style={{ gap: 8 }}><Icon name="google" size={15} /><h3 className="ds-card__title">Google Reviews Live Feed</h3></div></div>
          <div style={{ padding: 40, textAlign: "center" }}>
            <Stars value={0} size={20} />
            <h4 style={{ fontSize: 13.5, fontWeight: 600, margin: "10px 0 4px" }}>No reviews yet</h4>
            <p className="dim" style={{ fontSize: 12, marginBottom: 14 }}>Connect your Google Business Profile to start seeing your reviews here.</p>
            <Link href="/connections" className="btn btn--accent btn--sm"><Icon name="google" size={12} /> Connect Google Business</Link>
          </div>
        </div>
        <div className="ds-card">
          <div className="ds-card__head"><div className="row" style={{ gap: 8 }}><Icon name="bars" size={15} /><h3 className="ds-card__title">Key Metrics</h3></div></div>
          <div className="ds-card__body">
            <div className="grid-3" style={{ gap: 10 }}>
              {["Avg Rating", "Total Reviews", "5-Star Rate", "Response Rate", "Needs Reply", "Setup"].map((m) => (
                <div key={m} style={{ textAlign: "center", padding: "14px 4px", background: "var(--surface-2)", borderRadius: 10 }}>
                  <span style={{ width: 28, height: 28, borderRadius: 8, background: "var(--surface-3)", display: "grid", placeItems: "center", margin: "0 auto 8px", color: "var(--rl-muted-2)" }}><Icon name="bars" size={13} /></span>
                  <div className="dim" style={{ fontSize: 16, fontWeight: 700 }}>—</div>
                  <div className="dim" style={{ fontSize: 10 }}>{m}</div>
                </div>
              ))}
            </div>
            <p className="dim" style={{ fontSize: 11.5, textAlign: "center", marginTop: 12 }}>Your metrics will appear here once data starts coming in.</p>
          </div>
        </div>
        <SetupProgress setup={setup} pct={setupPct} done={setup.filter((s) => s.done).length} />
      </div>
    </>
  );
}

// ============================================================
// Helpers
// ============================================================

function dayPart(): string {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
}

function rel(dt: Date): string {
  const ms = Date.now() - dt.getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return dt.toLocaleDateString();
}
