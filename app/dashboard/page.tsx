import { AppShellServer } from "@/components/app-shell-server";
import { EmptyIllustration } from "@/components/empty-state";
import { Avatar } from "@/components/shell/avatar";
import { Icon, type IconName } from "@/components/shell/icon";
import { ScoreRing } from "@/components/shell/score-ring";
import { Stars } from "@/components/shell/stars";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { orgHasFeature } from "@/lib/billing/feature-access";
import { syncSubscriptionOnReturn } from "@/lib/billing/sync";
import { prisma } from "@/lib/db/client";
import { buildOnboardingChecklist, getOnboardingFacts } from "@/lib/onboarding/facts";
import { redirect } from "next/navigation";
import { computeHealthScore } from "@/lib/dashboard/health-score";
import { getCachedBriefing } from "@/lib/dashboard/briefing";
import { getDashboardData, getSetupState, type SetupState } from "@/lib/dashboard/queries";
import { getAutopilotOverview } from "@/lib/autopilot/queries";
import { getRoiHeadline } from "@/lib/roi/summary";
import Link from "next/link";
import { AiIntelligenceCenter } from "./_components/ai-intelligence-center";
import { DashboardHero, type HeroKpi } from "./_components/dashboard-hero";
import { VisibilityHealthBanner } from "./_components/visibility-health-banner";
import {
  AiChannelFunnel,
  BusinessInsightsBand,
  type QueueItem,
  RecentActivity,
  SetupProgressMini,
  TodayCommandCard,
  WeeklyReviewChart,
} from "./_components/dashboard-sections";
import "./dashboard-hero.css";

/**
 * Dashboard — repulabs v3 command center (two-tier relayout).
 *
 * A calm, generously-spaced "command center" in three deliberate tiers:
 *   - TIER 1 — the hero KPI strip + ONE prioritized Today card that MERGES the
 *     old SetupProgress + GettingStarted + needs-attention queue into a single
 *     focused surface (finish-setup checklist while incomplete, else the action
 *     queue), beside a slim workspace-setup ring.
 *   - TIER 2 — Analytics: the weekly review chart, review-volume-by-source
 *     (channel mix) + funnel, sentiment, and listings, in a clean grid.
 *   - TIER 3 — Activity: the Google Reviews Live Feed, recent-activity audit
 *     feed, the AI Intelligence Center, and the Autopilot card, secondary.
 *
 * Every existing data source is preserved (nothing refetched differently) and
 * the visibility banner + AI Intelligence Center are repositioned, not removed.
 * All numbers come from live tenant queries (`lib/dashboard/queries`), all
 * fail-soft. The Google Reviews Live Feed is preserved byte-for-byte.
 */

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; session_id?: string }>;
}) {
  const { orgId, userName, userEmail, org } = await getOrgContext();

  const params = await searchParams;

  // Sync-on-return after Stripe Checkout. Idempotent with the webhook, scoped
  // strictly to THIS org's stripeCustomerId (never trusts session_id blindly),
  // and fail-soft. After it runs we re-read the plan so the success banner only
  // shows when the org actually reflects pro/active.
  let checkoutPlan = org.plan;
  if (params.checkout === "success") {
    await syncSubscriptionOnReturn(orgId, org.stripeCustomerId, params.session_id ?? null);
    const refreshed = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { plan: true },
    });
    checkoutPlan = refreshed?.plan ?? checkoutPlan;
  }
  const checkoutActive = params.checkout === "success" && checkoutPlan === "pro";

  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [d, setup, facts, autopilot, roiHeadline, hasAutopilot] = await Promise.all([
    getDashboardData(orgId),
    getSetupState(orgId),
    getOnboardingFacts(orgId),
    getAutopilotOverview(orgId),
    getRoiHeadline(orgId, { start: since30d, end: new Date() }),
    orgHasFeature(orgId, "ai_autopilot"),
  ]);

  // First-run redirect to the agentic onboarding. A brand-new org (never started
  // the wizard, onboardingStep === 0) with no establishment yet hasn't been set
  // up at all — send it to /onboarding to kick off the auto-build. Anyone who
  // started/skipped the wizard (step !== 0, incl. the 99 sentinel) or already has
  // a listing skips this. Fail-soft: a missing org row never blocks the dashboard.
  if (!facts.hasEstablishment) {
    const orgRow = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { onboardingStep: true },
    });
    if (orgRow?.onboardingStep === 0) {
      redirect("/onboarding");
    }
  }

  const total = d.total;
  const avgRating = d.avgRating;
  const byRating = (r: number) => d.ratingGroups.find((g) => g.rating === r)?.count ?? 0;
  const fiveStarRate = total > 0 ? Math.round((byRating(5) / total) * 100) : 0;
  const responseRate = total > 0 ? Math.min(100, Math.round((d.repliedCount / total) * 100)) : 0;
  const hasGoogle = d.hasGoogle;

  // Pluggable Online Visibility Health Score (seo locked until Section 13).
  const health = computeHealthScore({
    avgRating,
    responseRate,
    reviews7d: d.reviews7d,
    seo: null,
  });

  const firstName = userName?.split(" ")[0] ?? userEmail?.split("@")[0] ?? "there";
  const isEmpty = total === 0 && !hasGoogle;

  const briefing = await getCachedBriefing(orgId, firstName);

  // Hero KPI strip (artboard 02).
  const kpis: HeroKpi[] = [
    {
      label: "Composite rating",
      value: avgRating > 0 ? avgRating.toFixed(2) : "—",
      // Sample size, not a trend. The 7d delta is a review-VOLUME metric and
      // lives on the "Reviews · 7d" card below — showing it here read as if the
      // rating itself had dropped (e.g. "-100%" next to a 4.17).
      chip:
        total > 0
          ? { text: `${total.toLocaleString()} review${total === 1 ? "" : "s"}`, tone: "muted" }
          : undefined,
    },
    {
      label: "Reviews · 7d",
      value: String(d.reviews7d),
      chip:
        d.reviews7dDeltaPct !== null
          ? {
              text: `${d.reviews7dDeltaPct >= 0 ? "+" : ""}${d.reviews7dDeltaPct}% vs prior`,
              tone: d.reviews7dDeltaPct >= 0 ? "ok" : "warn",
            }
          : { text: `${total.toLocaleString()} total`, tone: "muted" },
    },
    {
      label: "Requests sent · 30d",
      value: d.requestsSent30d.toLocaleString(),
      // No fabricated "0% open" before anything was sent — chip only when the
      // funnel has a real Opened stage to report.
      chip: (() => {
        const openedPct = d.funnel.find((f) => f.label === "Opened")?.pct;
        return openedPct !== undefined
          ? { text: `${openedPct}% open`, tone: "info" as const }
          : undefined;
      })(),
    },
    {
      label: "Response rate",
      value: `${responseRate}%`,
      chip: { text: responseRate >= 80 ? "target met" : "in progress", tone: responseRate >= 80 ? "ok" : "warn" },
    },
    {
      label: "AI replies drafted",
      value: String(d.aiDrafted24h),
      chip:
        d.pendingReplyCount > 0
          ? { text: `${d.pendingReplyCount} pending`, tone: "warn" }
          : { text: "all clear", tone: "ok" },
    },
  ];

  // Today's operational queue (artboard 03).
  const queue: QueueItem[] = [];
  if (d.needsReplyCount > 0) {
    queue.push({
      label: `${d.needsReplyCount} review${d.needsReplyCount === 1 ? "" : "s"} need reply`,
      sub: d.pendingReplyCount > 0 ? "Drafts ready" : "Awaiting response",
      action: "Reply",
      href: "/reviews",
      icon: "star",
      tone: "plain",
      urgent: true,
    });
  }
  if (d.pendingReplyCount > 0) {
    queue.push({
      label: "AI drafted replies",
      sub: `${d.pendingReplyCount} awaiting approval`,
      action: "Review",
      href: "/reviews",
      icon: "sparkle",
      tone: "ai",
      urgent: true,
    });
  }
  // Low-sentiment alert — surface a meaningful negative share so unhappy
  // customers get prioritized attention. Uses the already-computed sentiment
  // split (no extra query).
  if (total >= 5 && d.sentiment.negativePct >= 20) {
    queue.push({
      label: `${d.sentiment.negativePct}% of reviews are negative`,
      sub: "Review and respond to unhappy customers",
      action: "View",
      href: "/reviews",
      icon: "bell",
      tone: "plain",
      urgent: true,
    });
  }
  if (d.requestsSent30d === 0) {
    queue.push({
      label: "Send your first request",
      sub: "Turn customers into reviews",
      action: "Send",
      href: "/outreach/send",
      icon: "send",
      tone: "plain",
    });
  }

  const onboardingSteps = buildOnboardingChecklist(facts);
  const hasInsightData = total > 0;

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Dashboard"]} biz={org.name}>
      {checkoutActive && (
        <div className="ds-card ds-card--pri" style={{ padding: "10px 14px", marginBottom: 16, fontSize: 12.5 }}>
          <span style={{ color: "var(--ok)", marginRight: 8 }}>✓</span>
          Subscription active. Welcome to Pro.
        </div>
      )}

      {isEmpty ? (
        <WelcomeState firstName={firstName} setup={setup} />
      ) : (
        <div className="dash-tiers">
          {/* ============================================================
              TIER 1 — Command center: hero KPIs + ONE prioritized Today card
              ============================================================ */}
          <div className="dash-tier">
            <DashboardHero
              firstName={firstName}
              subtext={health.summary}
              healthBand={health.band}
              kpis={kpis}
            />

            {/* Online Visibility Health Score banner (condensed, above the fold) */}
            <VisibilityHealthBanner
              score={health.score}
              metrics={health.metrics}
              summary={health.summary}
              band={health.band}
              locations={d.establishmentCount}
              trendPct={d.reviews7dDeltaPct}
            />

            {/* Merged Today card (queue ∪ setup checklist) + slim setup ring */}
            <div className="dash-today">
              <TodayCommandCard
                queue={queue}
                onboardingSteps={onboardingSteps}
                setupComplete={setup.dismissed || setup.pct === 100}
              />
              <SetupProgressMini setup={setup} />
            </div>

            {/* Quick actions */}
            <div className="grid-4">
              <QuickAction icon="send" title="Send Review Request" href="/outreach/send" />
              <QuickAction icon="reply" title="Reply to Reviews" href="/reviews" />
              <QuickAction icon="share" title="Create Social Post" href="/social/posts" />
              <QuickAction icon="sparkle" title="Train Your AI" href="/ai/training" />
            </div>
          </div>

          {/* ============================================================
              TIER 2 — Analytics: trend · volume-by-source · sentiment
              ============================================================ */}
          <div className="dash-tier">
            <div className="dash-sec-head">
              <div>
                <h2 className="dash-sec-head__title">Analytics</h2>
                <div className="dash-sec-head__sub">Trends, sentiment, and review funnel</div>
              </div>
              <Link href="/analytics" className="row" style={{ gap: 5, fontSize: 12.5, color: "var(--pri)", fontWeight: 500, textDecoration: "none" }}>
                Full report <Icon name="arrowR" size={12} />
              </Link>
            </div>

            <WeeklyReviewChart weeklyReviews={d.weeklyReviews} />

            {/* Listings · sentiment · latest reviews */}
            <BusinessInsightsBand
              listings={d.listings}
              sentiment={d.sentiment}
              latestReviews={d.latestReviews}
              hasData={hasInsightData}
            />

            {/* AI insight · channel mix (volume by source) · funnel */}
            <AiChannelFunnel
              pendingReplies={d.pendingReplyCount}
              channelMix={d.channelMix}
              funnel={d.funnel}
            />
          </div>

          {/* ============================================================
              TIER 3 — Activity: live feed + AI center + autopilot, secondary
              ============================================================ */}
          <div className="dash-tier">
            <div className="dash-sec-head">
              <div>
                <h2 className="dash-sec-head__title">Activity & assistance</h2>
                <div className="dash-sec-head__sub">Live reviews, your AI assistant, and autopilot</div>
              </div>
            </div>

            <div className="dash-grid">
              <div className="col" style={{ gap: 20 }}>
                <GoogleReviewsFeed
                  avg={avgRating}
                  total={total}
                  dist={[5, 4, 3, 2, 1].map((r) => ({ r, n: byRating(r) }))}
                  reviews={d.liveReviews}
                  hasGoogle={hasGoogle}
                />

                {/* Recent activity audit feed */}
                <RecentActivity items={d.recentActivity} />
              </div>

              <div className="col" style={{ gap: 20 }}>
                <AiIntelligenceCenter briefing={briefing.body} isEmpty={isEmpty} />
                <AutopilotCard
                  enabled={autopilot.enabled}
                  thisWeek={autopilot.thisWeek.total}
                  needsYou={autopilot.requiresHuman}
                  estimatedRevenue={roiHeadline.estimatedRevenue}
                  currency={roiHeadline.currency}
                  showRevenue={hasAutopilot}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShellServer>
  );
}

// ============================================================
// Stat cards + quick actions
// ============================================================

function QuickAction({ icon, title, href }: { icon: IconName; title: string; href: string }) {
  return (
    <Link href={href} className="ds-card ds-card--hover qa">
      <span className="qa__icon"><Icon name={icon} size={16} /></span>
      <span style={{ fontSize: 13, fontWeight: 650, flex: 1, letterSpacing: "-0.01em" }}>{title}</span>
      <Icon name="chevR" size={14} style={{ color: "var(--rl-muted-2)" }} />
    </Link>
  );
}

/**
 * Reputation Autopilot summary card (Module 15). Status + this-week action count
 * + the "needs you" count, plus the estimated-revenue line (gated behind the
 * ai_autopilot feature — the activity counts are a fine teaser for everyone).
 */
function AutopilotCard({
  enabled,
  thisWeek,
  needsYou,
  estimatedRevenue,
  currency,
  showRevenue,
}: {
  enabled: boolean;
  thisWeek: number;
  needsYou: number;
  estimatedRevenue: number;
  currency: string;
  showRevenue: boolean;
}) {
  return (
    <Link
      href="/autopilot"
      className="ds-card ds-card--hover"
      style={{ display: "block", textDecoration: "none", color: "inherit", padding: 16 }}
    >
      <div className="row" style={{ gap: 10, marginBottom: 10 }}>
        <span
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: enabled ? "var(--pri)" : "var(--pri-50)",
            color: enabled ? "#fff" : "var(--pri)",
            display: "grid",
            placeItems: "center",
          }}
        >
          <Icon name="bolt" size={16} />
        </span>
        <div style={{ flex: 1 }}>
          <div className="row" style={{ gap: 8 }}>
            <h3 className="ds-card__title" style={{ margin: 0 }}>
              Autopilot
            </h3>
            <span className={`chip ${enabled ? "chip--ok" : "chip--info"}`}>
              {enabled ? "On" : "Off"}
            </span>
          </div>
        </div>
        <Icon name="chevR" size={14} style={{ color: "var(--rl-muted-2)" }} />
      </div>

      {enabled ? (
        <div className="row" style={{ gap: 20 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 750, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}>{thisWeek}</div>
            <div className="dim" style={{ fontSize: 11, marginTop: 2 }}>actions this week</div>
          </div>
          {needsYou > 0 && (
            <div>
              <div style={{ fontSize: 22, fontWeight: 750, letterSpacing: "-0.03em", color: "var(--warn)", fontVariantNumeric: "tabular-nums" }}>{needsYou}</div>
              <div className="dim" style={{ fontSize: 11, marginTop: 2 }}>need you</div>
            </div>
          )}
          {showRevenue && (
            <div>
              <div style={{ fontSize: 22, fontWeight: 750, letterSpacing: "-0.03em", color: "var(--pri)", fontVariantNumeric: "tabular-nums" }}>
                {currency} {estimatedRevenue.toLocaleString()}
              </div>
              <div className="dim" style={{ fontSize: 11, marginTop: 2 }}>est. revenue · 30d</div>
            </div>
          )}
        </div>
      ) : (
        <p className="dim" style={{ fontSize: 12.5, margin: 0, lineHeight: 1.5 }}>
          Turn on self-driving reputation — one switch runs replies, review requests, and
          Voice→Review, then sends you a weekly digest.
        </p>
      )}
    </Link>
  );
}

// ============================================================
// Google Reviews Live Feed (preserved byte-for-byte from the prior redesign)
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
            <div style={{ fontSize: 42, fontWeight: 750, letterSpacing: "-0.04em", lineHeight: 1, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{avg.toFixed(1)}</div>
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
// Right rail — Setup Progress
// ============================================================

function SetupProgress({ setup }: { setup: SetupState }) {
  const left = setup.total - setup.completed;
  return (
    <div className="ds-card">
      <div className="ds-card__head"><h3 className="ds-card__title">Setup Progress</h3></div>
      <div className="ds-card__body">
        <div className="row" style={{ gap: 14, marginBottom: 16 }}>
          <ScoreRing value={setup.pct} suffix="%" size={64} stroke={7} hideMax />
          <p className="dim" style={{ fontSize: 12, lineHeight: 1.5, margin: 0 }}>
            {setup.pct === 100 ? "All set! Your workspace is fully configured." : `Almost there — ${left} step${left === 1 ? "" : "s"} left to maximize your results.`}
          </p>
        </div>
        <div className="col" style={{ gap: 2 }}>
          {setup.steps.map((s) => (
            <div key={s.key} className="row" style={{ gap: 9, padding: "5px 0" }}>
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

// ============================================================
// Welcome (empty) state
// ============================================================

function WelcomeState({ firstName, setup }: { firstName: string; setup: SetupState }) {
  return (
    <>
      <div className="ds-card welcome" style={{ marginBottom: 20 }}>
        <EmptyIllustration name="dashboard-welcome" size={340} style={{ marginBottom: 24 }} />
        <h2 style={{ fontSize: 26, fontWeight: 750, letterSpacing: "-0.025em", margin: "0 0 8px" }}>Welcome to your reputation dashboard, {firstName}!</h2>
        <p className="dim" style={{ fontSize: 14, maxWidth: 480, margin: "0 auto 24px", lineHeight: 1.6 }}>
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

      <div className="grid-3">
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
        <SetupProgress setup={setup} />
      </div>
    </>
  );
}

// ============================================================
// Helpers
// ============================================================

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
