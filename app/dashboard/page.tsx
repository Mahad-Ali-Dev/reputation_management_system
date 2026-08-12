import { AppShellServer } from "@/components/app-shell-server";
import { Icon } from "@/components/shell/icon";
import { ScoreRing } from "@/components/shell/score-ring";
import { Sparkline } from "@/components/shell/sparkline";
import { Stars } from "@/components/shell/stars";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { syncSubscriptionOnReturn } from "@/lib/billing/sync";
import { type SetupState, getDashboardData, getSetupState } from "@/lib/dashboard/queries";
import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/with-tenant";
import { getOnboardingFacts } from "@/lib/onboarding/facts";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CopilotChips, CopilotPrompt } from "./_components/copilot-panel";
import { KbCrawlStrip } from "./_components/kb-crawl-strip";
import "./dashboard-kit.css";

/**
 * Dashboard — rebuilt 1:1 to the delivered design kit
 * (tasks/Dashboard/Dashboard/ — "Mockup for active state.png" +
 * "Mockup emptystate.png" + the two handoff reports).
 *
 * Layout (top → bottom, both states share the same frame):
 *   1. Greeting hero ("Your reputation, your edge.") + 2×2 stat chips
 *      (Average rating · Total reviews · AI replies sent · 5-star reviews)
 *      with REAL values, REAL 30d deltas and REAL weekly sparklines.
 *   2. "Train your agent" banner + 5 quick training chips → AI training hub.
 *   3. Google Reviews Overview (real distribution + donut) · Recent Reviews
 *      (live rows → /reviews) · Setup Progress (real setup signals).
 *   4. Key Insights: response rate, avg response time (review→published-reply
 *      gap), sentiment split, 7d trend — each renders its designed empty state
 *      when the org has no source data (never a fake value).
 *   5. "Your AI copilot" panel — input + chips wired to the global Ask-AI
 *      assistant via `openAskAi` (no dead inputs).
 *
 * All numbers come from `lib/dashboard/queries` (tenant-scoped, fail-soft).
 * The kit's sidebar/topbar are the designer's frame — we keep AppShellServer.
 */

export const dynamic = "force-dynamic";

const ASSETS = "/assets/repulabs/dashboard";

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

  const [d, setup, facts] = await Promise.all([
    getDashboardData(orgId),
    getSetupState(orgId),
    getOnboardingFacts(orgId),
  ]);

  // In-flight / just-finished website crawls for the status strip. Only URL
  // sources, only the last hour, so a long-settled document never re-appears on
  // the dashboard. Fail-soft: the strip is informational, never worth a 500.
  const kbCrawls = await withTenant(orgId, (tx) =>
    tx.aiDocument.findMany({
      where: {
        sourceType: "url",
        createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
      },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: {
        id: true,
        title: true,
        status: true,
        content: true,
        _count: { select: { embeddings: true } },
      },
    }),
  )
    .then((rows) =>
      rows.map((r) => ({
        documentId: r.id,
        title: r.title,
        stage: (r.status === "failed"
          ? "failed"
          : r.status === "indexed"
            ? "done"
            : r.content && r.content.length > 40
              ? "indexing"
              : "crawling") as "queued" | "crawling" | "indexing" | "done" | "failed",
        chunks: r._count.embeddings,
        message: r.status === "failed" ? r.content : null,
      })),
    )
    .catch(() => []);

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
  const fiveStarCount = byRating(5);
  const responseRate = total > 0 ? Math.min(100, Math.round((d.repliedCount / total) * 100)) : 0;
  const hasGoogle = d.hasGoogle;

  const firstName = userName?.split(" ")[0] ?? userEmail?.split("@")[0] ?? "there";
  const isEmpty = total === 0 && !hasGoogle;

  // Sparklines render only from REAL non-flat series (kit rule: a chip with no
  // real series simply has no sparkline).
  const series = (arr: number[]): number[] | undefined =>
    arr.length >= 2 && arr.some((v) => v > 0) ? arr : undefined;

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Dashboard"]} biz={org.name}>
      {/* Website crawls run as background jobs, so the owner can start one and
          close the modal. This is the only place they'd otherwise see it's
          still working. Renders nothing when there's nothing in flight. */}
      <KbCrawlStrip initial={kbCrawls} />

      {checkoutActive && (
        <div
          className="ds-card ds-card--pri"
          style={{ padding: "10px 14px", marginBottom: 16, fontSize: 12.5 }}
        >
          <span style={{ color: "var(--ok)", marginRight: 8 }}>✓</span>
          Subscription active. Welcome to Pro.
        </div>
      )}

      <div className="dk">
        {/* ============================================================
            1 — Greeting hero + train-agent banner + quick chips | stat chips
            ============================================================ */}
        <div className="dk-top">
          <div className="dk-top__left">
            <div className="dk-card dk-hero">
              <div style={{ minWidth: 0 }}>
                <p className="dk-hero__greet">
                  Good {dayPart()}, {firstName}! 👋
                </p>
                <h1 className="dk-hero__title">Your reputation, your edge.</h1>
                <p className="dk-hero__sub">
                  Track reviews, engage customers and grow your brand trust.
                </p>
              </div>
              {/* Kit hero illustration ("dashboard/dashboard.svg" — the colorful
                  growth board). Same asset in BOTH states (the kit reuses it),
                  extracted from the delivered kit SVG at full resolution and
                  shown large per the brief. */}
              <img className="dk-hero__art" src={`${ASSETS}/kit-hero-board.png`} alt="" />
            </div>

            <div className="dk-card dk-train">
              <img className="dk-train__icon" src={`${ASSETS}/kit-train-stack.png`} alt="" />
              <div className="dk-train__body">
                <h2 className="dk-train__title">Train your agent</h2>
                <p className="dk-train__sub">
                  Teach your AI agent about your business so it can give smarter, on-brand answers.
                </p>
              </div>
              <Link href="/ai" className="dk-train__cta">
                <Icon name="sparkle" size={14} /> Train your agent <Icon name="arrowR" size={13} />
              </Link>
            </div>

            <div className="dk-quick">
              <QuickChip
                icon="kit-chip-upload-faq.png"
                title="Upload FAQs"
                sub="Add common Q&A"
                href="/ai?tab=info"
              />
              <QuickChip
                icon="kit-chip-add-business.png"
                title="Add business info"
                sub="Services, hours, etc."
                href="/ai"
              />
              <QuickChip
                icon="kit-chip-train-reviews.png"
                title="Train from reviews"
                sub="Learn from feedback"
                href="/ai?tab=test"
              />
              <QuickChip
                icon="kit-chip-brand-voice.png"
                title="Brand voices"
                sub="Tone and style"
                href="/ai?tab=behaviour"
              />
              <QuickChip
                icon="kit-chip-knowledge.png"
                title="Knowledge sources"
                sub="Docs, URLs & more"
                href="/ai?tab=knowledge"
              />
            </div>
          </div>

          <div className="dk-stats">
            <StatChip
              label="Average Rating"
              icon="kit-stat-rating.png"
              value={total > 0 ? avgRating.toFixed(1) : null}
              star={total > 0}
              delta={
                d.deltas30d.ratingAbs !== null && d.deltas30d.ratingAbs !== 0
                  ? {
                      text: Math.abs(d.deltas30d.ratingAbs).toFixed(1),
                      dir: d.deltas30d.ratingAbs > 0 ? "up" : "down",
                    }
                  : null
              }
              spark={series(d.ratingTrendPoints) ?? null}
              sparkColor="#2563eb"
              noneTitle="No ratings yet"
              noneHint="Ratings will appear here"
            />
            <StatChip
              label="Total Reviews"
              icon="kit-stat-reviews.png"
              value={total > 0 ? total.toLocaleString() : null}
              delta={
                d.deltas30d.reviewsPct !== null && d.deltas30d.reviewsPct !== 0
                  ? {
                      text: `${Math.abs(d.deltas30d.reviewsPct)}%`,
                      dir: d.deltas30d.reviewsPct > 0 ? "up" : "down",
                    }
                  : null
              }
              spark={series(d.weeklyReviews) ?? null}
              sparkColor="#16a34a"
              noneTitle="No reviews yet"
              noneHint="Reviews will appear here"
            />
            <StatChip
              label="AI Replies Sent"
              icon="kit-stat-ai-replies.png"
              value={d.aiRepliesSent > 0 ? d.aiRepliesSent.toLocaleString() : null}
              delta={
                d.deltas30d.aiRepliesPct !== null && d.deltas30d.aiRepliesPct !== 0
                  ? {
                      text: `${Math.abs(d.deltas30d.aiRepliesPct)}%`,
                      dir: d.deltas30d.aiRepliesPct > 0 ? "up" : "down",
                    }
                  : null
              }
              spark={series(d.weeklyAiReplies) ?? null}
              sparkColor="#7c3aed"
              noneTitle="No replies yet"
              noneHint="Replies will appear here"
              pending={d.pendingReplyCount > 0 ? d.pendingReplyCount : undefined}
            />
            <StatChip
              label="5-star Reviews"
              icon="kit-stat-five-star.png"
              value={fiveStarCount > 0 ? fiveStarCount.toLocaleString() : null}
              delta={
                d.deltas30d.fiveStarPct !== null && d.deltas30d.fiveStarPct !== 0
                  ? {
                      text: `${Math.abs(d.deltas30d.fiveStarPct)}%`,
                      dir: d.deltas30d.fiveStarPct > 0 ? "up" : "down",
                    }
                  : null
              }
              spark={series(d.weeklyFiveStar) ?? null}
              sparkColor="#f59e0b"
              noneTitle="No 5-star reviews yet"
              noneHint="5-star reviews will appear here"
            />
          </div>
        </div>

        {/* ============================================================
            2 — Google Reviews Overview · Recent Reviews · Setup Progress
            ============================================================ */}
        <div className="dk-cols">
          <GoogleOverviewCard
            avg={avgRating}
            total={total}
            byRating={byRating}
            googlePlaceUrl={d.googlePlaceUrl}
          />
          <RecentReviewsCard reviews={d.liveReviews} />
          <SetupProgressCard setup={setup} isEmpty={isEmpty} />
        </div>

        {/* ============================================================
            3 — Key Insights
            ============================================================ */}
        <section aria-label="Key insights">
          <div className="dk-insights__head">
            <h2 className="dk-insights__title">Key Insights</h2>
            {/* Kit shows a "30 days ⌄" range label (static — we don't ship a
                fake dropdown; insights are fixed to the last 30 days). */}
            <span className="dk-insights__range">
              30 days <Icon name="chevD" size={13} />
            </span>
          </div>
          <div className="dk-insights__grid">
            <InsightCard
              label="Response Rate"
              art="kit-insight-response-rate.png"
              value={total > 0 ? `${responseRate}%` : null}
            />
            <InsightCard
              label="Avg. Response Time"
              art="kit-insight-response-time.png"
              value={d.avgResponseHours !== null ? fmtHours(d.avgResponseHours) : null}
            />
            <InsightCard
              label="Sentiment"
              art="kit-insight-sentiment.png"
              value={total > 0 ? sentimentLabel(d.sentiment).label : null}
              chip={
                total > 0
                  ? {
                      text: `${sentimentLabel(d.sentiment).pct}%`,
                      dir: sentimentLabel(d.sentiment).dir,
                      arrow: false,
                    }
                  : undefined
              }
            />
            <InsightCard
              label="Trend"
              art="kit-insight-trend.png"
              value={
                total > 0
                  ? d.reviews7dDeltaPct !== null && d.reviews7dDeltaPct > 0
                    ? "Improving"
                    : "Steady"
                  : null
              }
              chip={
                total > 0 && d.reviews7dDeltaPct !== null && d.reviews7dDeltaPct !== 0
                  ? {
                      text: `${Math.abs(d.reviews7dDeltaPct)}%`,
                      dir: d.reviews7dDeltaPct > 0 ? "up" : "down",
                    }
                  : undefined
              }
            />
          </div>
        </section>

        {/* ============================================================
            4 — Your AI copilot (wired to the global Ask-AI assistant)
            ============================================================ */}
        <section className="dk-copilot" aria-label="AI copilot">
          <div className="dk-copilot__main">
            <div className="dk-copilot__kicker">
              <Icon name="sparkle" size={14} /> AI Assistant{" "}
              <span className="dk-copilot__beta">Beta</span>
            </div>
            <h2 className="dk-copilot__title">Your AI copilot for reputation growth.</h2>
            <p className="dk-copilot__sub">
              Ask anything. Get insights, summaries, and recommendations.
            </p>
            <CopilotPrompt />
          </div>
          {/* Kit: the 4 suggestion chips sit on a full-width row BELOW the
              input, clear of the illustration column. */}
          <CopilotChips />
          {/* Kit "Ai assistant/robot_exact.svg" — the complete 3D copilot mascot
              (robot + chat bubble + sparkles all baked into ONE asset, exactly as
              the mockup). Extracted from the delivered kit SVG at full resolution.
              The asset ships with a baked near-white background, so multiply melts
              it into the lavender panel on every edge (no crop/feather hacks). */}
          <div className="dk-copilot__bot" aria-hidden>
            <img
              className="dk-copilot__art dk-copilot__art--3d"
              src={`${ASSETS}/kit-copilot-robot.png`}
              alt=""
            />
          </div>
        </section>
      </div>
    </AppShellServer>
  );
}

// ============================================================
// Quick training chips
// ============================================================

function QuickChip({
  icon,
  title,
  sub,
  href,
}: { icon: string; title: string; sub: string; href: string }) {
  return (
    <Link href={href} className="dk-card dk-quick__chip">
      <img className="dk-quick__icon" src={`${ASSETS}/${icon}`} alt="" />
      <span style={{ minWidth: 0 }}>
        <span className="dk-quick__title" style={{ display: "block" }}>
          {title}
        </span>
        <span className="dk-quick__sub" style={{ display: "block" }}>
          {sub}
        </span>
      </span>
    </Link>
  );
}

// ============================================================
// Stat chips (hero right cluster)
// ============================================================

function StatChip({
  label,
  icon,
  value,
  star = false,
  delta,
  spark,
  sparkColor,
  noneTitle,
  noneHint,
  pending,
}: {
  label: string;
  icon: string;
  /** null → the kit's designed empty chip ("--", no fake values). */
  value: string | null;
  star?: boolean;
  delta: { text: string; dir: "up" | "down" } | null;
  spark: number[] | null;
  sparkColor: string;
  noneTitle: string;
  noneHint: string;
  /** AI-drafted replies awaiting approval (preserved deep link → /reviews). */
  pending?: number;
}) {
  if (value === null) {
    return (
      <div className="dk-card dk-stat dk-stat--empty">
        <div className="dk-stat__head">
          <img className="dk-stat__icon" src={`${ASSETS}/${icon}`} alt="" />
          <span className="dk-stat__label">{label}</span>
        </div>
        <div className="dk-stat__value">--</div>
        <div className="dk-stat__none">{noneTitle}</div>
        <div className="dk-stat__hint">{noneHint}</div>
      </div>
    );
  }

  return (
    <div className="dk-card dk-stat">
      {/* Kit anatomy: icon tile left, label stacked over value to its right. */}
      <div className="dk-stat__head">
        <img className="dk-stat__icon" src={`${ASSETS}/${icon}`} alt="" />
        <span className="dk-stat__hcol">
          <span className="dk-stat__label">{label}</span>
          <span className="dk-stat__value">
            {value}
            {star && (
              <span className="dk-star" aria-hidden>
                <Icon name="star" size={15} style={{ fill: "currentColor" }} />
              </span>
            )}
          </span>
          {pending !== undefined && (
            <Link
              href="/reviews"
              className="dk-stat__pending"
              title={`${pending} AI replies awaiting approval`}
            >
              {pending} awaiting →
            </Link>
          )}
        </span>
      </div>
      <div className="dk-stat__foot">
        {delta ? (
          <span className={`dk-delta dk-delta--${delta.dir}`}>
            <Icon name={delta.dir === "up" ? "arrowU" : "arrowD"} size={11} />
            {delta.text} <span className="dk-delta__vs">vs last 30 days</span>
          </span>
        ) : (
          <span />
        )}
        {spark && (
          <Sparkline points={spark} color={sparkColor} width={112} height={38} area={false} />
        )}
      </div>
    </div>
  );
}

// ============================================================
// Google Reviews Overview
// ============================================================

/** ONE per-star palette shared by the distribution bars AND the donut — the
 *  kit colored them differently, which made the (fully data-driven) donut read
 *  as a fake decorative circle next to the bars (founder feedback 2026-06-12).
 *  Same star = same color everywhere, so the two visuals visibly agree. */
const RATING_COLORS: Record<number, string> = {
  5: "#2563eb",
  4: "#2563eb", // mockup paints 4★ the same vivid primary blue as 5★ (not a lighter tint)
  3: "#ca8a04",
  2: "#facc15",
  1: "#ef4444",
};

const BAR_COLORS = RATING_COLORS;

/** Brand-colored Google "G" (the kit shows the multicolor mark, not a tinted glyph). */
function GoogleG({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden focusable="false">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

function GoogleOverviewCard({
  avg,
  total,
  byRating,
  googlePlaceUrl,
}: {
  avg: number;
  total: number;
  byRating: (r: number) => number;
  googlePlaceUrl: string | null;
}) {
  const max = Math.max(...[5, 4, 3, 2, 1].map(byRating), 1);
  return (
    <div className="dk-card dk-colcard">
      <div className="dk-colcard__head">
        <h3 className="dk-colcard__title">
          <GoogleG size={15} /> Google Reviews Overview
        </h3>
        {googlePlaceUrl && (
          <a className="dk-colcard__link" href={googlePlaceUrl} target="_blank" rel="noreferrer">
            View on Google <Icon name="ext" size={11} />
          </a>
        )}
      </div>
      {total === 0 ? (
        <div className="dk-cardempty">
          <img
            className="dk-cardempty__art"
            src={`${ASSETS}/kit-empty-google-reviews.png`}
            alt=""
          />
          <h4 className="dk-cardempty__title">No review data yet</h4>
          <p className="dk-cardempty__sub">
            Reviews and ratings will appear here once you start receiving reviews.
          </p>
          <Link href="/connections" className="dk-btn-outline">
            Connect your business <Icon name="arrowR" size={12} />
          </Link>
        </div>
      ) : (
        <>
          <div className="dk-google__body">
            <div className="dk-google__avg">
              <div className="dk-google__num">
                {avg.toFixed(1)}
                <span className="dk-star" aria-hidden>
                  <Icon name="star" size={20} style={{ fill: "currentColor" }} />
                </span>
              </div>
              <div className="dk-google__based">Based on {total.toLocaleString()} reviews</div>
            </div>
            <div className="dk-google__dist">
              {[5, 4, 3, 2, 1].map((r) => (
                <div key={r} className="dk-dist-row">
                  <span className="dk-dist-row__label">
                    {r}
                    <span className="dk-star" style={{ color: "var(--dk-star)" }} aria-hidden>
                      ★
                    </span>
                  </span>
                  <span className="dk-dist-row__track">
                    <span
                      className="dk-dist-row__fill"
                      style={{
                        width: `${Math.round((byRating(r) / max) * 100)}%`,
                        background: BAR_COLORS[r],
                      }}
                    />
                  </span>
                  <span className="dk-dist-row__count">{byRating(r)}</span>
                </div>
              ))}
            </div>
            <RatingDonut total={total} byRating={byRating} />
          </div>
          <Link href="/reviews" className="dk-btn-outline dk-btn-outline--end">
            <Icon name="chat" size={13} /> Manage Reviews <Icon name="arrowR" size={12} />
          </Link>
        </>
      )}
    </div>
  );
}

/** Multi-segment donut of the REAL rating split, total reviews in the center. */
function RatingDonut({ total, byRating }: { total: number; byRating: (r: number) => number }) {
  // Mockup donut is ~94px outer diameter with a ~10px ring (sampled), smaller and
  // thinner than the previous 112/14.
  const size = 96;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const segs = [5, 4, 3, 2, 1]
    .map((rating) => ({ rating, count: byRating(rating) }))
    .filter((s) => s.count > 0)
    .map((s) => {
      const frac = s.count / total;
      const seg = { ...s, dash: frac * c, off: offset };
      offset += frac * c;
      return seg;
    });
  return (
    <div className="dk-donut" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: "rotate(-90deg)" }}
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#f3f4f6"
          strokeWidth={stroke}
        />
        {segs.map((s) => (
          <circle
            key={s.rating}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={RATING_COLORS[s.rating]}
            strokeWidth={stroke}
            strokeDasharray={`${s.dash} ${c - s.dash}`}
            strokeDashoffset={-s.off}
          />
        ))}
      </svg>
      <div className="dk-donut__center">
        <span className="dk-donut__total">{total.toLocaleString()}</span>
        <span className="dk-donut__cap">Total Reviews</span>
      </div>
    </div>
  );
}

// ============================================================
// Recent Reviews
// ============================================================

function RecentReviewsCard({
  reviews,
}: {
  reviews: Array<{
    id: string;
    rating: number;
    reviewerName: string | null;
    body: string | null;
    postedAt: Date | null;
    source: string;
    reply: { id: string } | null;
  }>;
}) {
  return (
    <div className="dk-card dk-colcard">
      <div className="dk-colcard__head">
        <h3 className="dk-colcard__title">Recent Reviews</h3>
        <Link href="/reviews" className="dk-colcard__link">
          View all
        </Link>
      </div>
      {reviews.length === 0 ? (
        <div className="dk-cardempty">
          {/* Kit "Recent reviews/recent reviews.svg" — the asset ships with a baked
              near-white background, so multiply blends it cleanly onto the card. */}
          <img
            className="dk-cardempty__art dk-cardempty__art--blend"
            src={`${ASSETS}/kit-empty-recent-reviews.png`}
            alt=""
          />
          <h4 className="dk-cardempty__title">No reviews yet</h4>
          <p className="dk-cardempty__sub">Reviews from your customers will appear here.</p>
        </div>
      ) : (
        <div>
          {reviews.slice(0, 3).map((rv, i) => (
            <Link key={rv.id} href="/reviews" className="dk-review-row">
              <span
                className={`dk-review-row__avatar dk-review-row__avatar--${["a", "b", "c"][i % 3]}`}
              >
                {initials(rv.reviewerName)}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="dk-review-row__name">{rv.reviewerName ?? "Anonymous"}</span>
                <span className="dk-review-row__meta">
                  <Stars value={rv.rating} size={12} />
                  <span className="dk-review-row__time">{rv.postedAt ? rel(rv.postedAt) : ""}</span>
                </span>
                {rv.body && <p className="dk-review-row__body">{rv.body}</p>}
              </span>
              {rv.source === "google" && (
                <span className="dk-review-row__src" aria-label="Google review">
                  <GoogleG size={14} />
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Setup Progress
// ============================================================

function SetupProgressCard({ setup, isEmpty }: { setup: SetupState; isEmpty: boolean }) {
  const left = setup.total - setup.completed;
  const nextHref = setup.steps.find((s) => !s.done)?.href ?? "/connections";
  return (
    <div className="dk-card dk-colcard">
      <div className="dk-colcard__head">
        <h3 className="dk-colcard__title">Setup Progress</h3>
      </div>
      <div className="dk-setup__top">
        <ScoreRing
          value={setup.pct}
          suffix="%"
          size={72}
          stroke={9}
          hideMax
          color="var(--dk-pri, #2563eb)"
        />
        <p className="dk-setup__copy">
          {setup.pct === 100 ? (
            <>
              <strong>All set!</strong> Your workspace is fully configured.
            </>
          ) : isEmpty || setup.completed === 0 ? (
            <>
              <strong>Let's get you all set up!</strong> Complete these steps to get the most out of
              Repulabs.
            </>
          ) : (
            <>
              <strong>Almost there!</strong> {left} step{left === 1 ? "" : "s"} left to go live.
            </>
          )}
        </p>
      </div>
      <div className="dk-setup__list">
        {setup.steps.map((s) => (
          <Link key={s.key} href={s.href} className="dk-setup__step">
            {s.done ? (
              /* Kit done marker: solid green disc + white check. */
              <span className="dk-setup__check" aria-hidden>
                <Icon name="check" size={11} />
              </span>
            ) : (
              /* Kit pending circle: green outline once setup is underway,
                 grey before anything is done (matches both mockups). */
              <Icon
                name="round"
                size={18}
                style={{
                  color: setup.completed > 0 ? "var(--dk-green, #16a34a)" : "var(--dk-ph, #9ca3af)",
                  flexShrink: 0,
                }}
              />
            )}
            {s.label}
          </Link>
        ))}
      </div>
      {setup.pct < 100 && (
        <Link href={nextHref} className="dk-setup__cta">
          Continue Setup <Icon name="arrowR" size={13} />
        </Link>
      )}
    </div>
  );
}

// ============================================================
// Key Insight cards
// ============================================================

function InsightCard({
  label,
  art,
  value,
  chip,
}: {
  label: string;
  /** Kit insight illustration ("Key insight/*.svg"), extracted to a crisp PNG. */
  art?: string;
  /** null → the kit's designed "-- / No data yet" empty insight. */
  value: string | null;
  /** arrow:false → kit's plain percentage chip (Sentiment card). */
  chip?: { text: string; dir: "up" | "down"; arrow?: boolean };
}) {
  return (
    <div className="dk-card dk-insight">
      {art && <img className="dk-insight__icon" src={`${ASSETS}/${art}`} alt="" />}
      <div style={{ minWidth: 0 }}>
        <div className="dk-insight__label">{label}</div>
        {value === null ? (
          <>
            <div className="dk-insight__value dk-insight__value--empty">--</div>
            <div className="dk-insight__none">No data yet</div>
          </>
        ) : (
          <div className="dk-insight__value">
            {value}
            {chip && (
              <span className={`dk-insight__chip dk-insight__chip--${chip.dir}`}>
                {chip.arrow === false ? chip.text : `${chip.dir === "up" ? "↑" : "↓"} ${chip.text}`}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================

function dayPart(): string {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
}

function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase() || "?";
}

function sentimentLabel(s: { positivePct: number; neutralPct: number; negativePct: number }): {
  label: string;
  pct: number;
  dir: "up" | "down";
} {
  if (s.negativePct > s.positivePct && s.negativePct > s.neutralPct) {
    return { label: "Negative", pct: s.negativePct, dir: "down" };
  }
  if (s.neutralPct > s.positivePct) {
    return { label: "Neutral", pct: s.neutralPct, dir: "up" };
  }
  return { label: "Positive", pct: s.positivePct, dir: "up" };
}

function fmtHours(h: number): string {
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m`;
  if (h < 48) return `${Math.round(h * 10) / 10}h`;
  return `${Math.round((h / 24) * 10) / 10}d`;
}

function rel(dt: Date): string {
  const ms = Date.now() - dt.getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return dt.toLocaleDateString();
}
