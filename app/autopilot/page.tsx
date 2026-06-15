import { AppShellServer } from "@/components/app-shell-server";
import { EmptyIllustration } from "@/components/empty-state";
import { Icon } from "@/components/shell/icon";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { summarizeAutopilotActions } from "@/lib/autopilot/ledger";
import {
  type AutopilotConfigView,
  getAutopilotActivityFeed,
  getAutopilotConfig,
  getNeedsHumanQueue,
} from "@/lib/autopilot/queries";
import { orgHasFeature } from "@/lib/billing/feature-access";
import { withTenant } from "@/lib/db/with-tenant";
import "./autopilot.css";
import { buildRoiFunnel } from "@/lib/roi/attribution";
import { estimateRevenue } from "@/lib/roi/estimate";
import { getRoiHeadline, loadRoiSettings } from "@/lib/roi/summary";
import Link from "next/link";
import { AutopilotShell } from "./_components/autopilot-shell";
import { AutopilotToggle } from "./_components/autopilot-toggle";
import type { RoiPanelData } from "./_components/roi-panel";

/**
 * /autopilot — the named product surface ("self-driving reputation").
 *
 * Server component: reads everything tenant-scoped (tolerant of unmigrated
 * tables) and renders the design-kit chrome — hero row (bot avatar + ON/OFF
 * chip + "At a glance" metrics), the 3-column dashboard grid (setup checklist /
 * master control card / quick-status + about rail) and the Activity-Controls-ROI
 * tab shell. The master toggle gates itself on entitlement server-side; the
 * activity/ROI teaser is fine to show.
 */

export const dynamic = "force-dynamic";

const ASSETS = "/assets/repulabs/autopilot";

const VALID_TABS = ["activity", "controls", "roi"] as const;
type TabKey = (typeof VALID_TABS)[number];

export default async function AutopilotPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { orgId } = await getOrgContext();
  const { tab: tabParam } = await searchParams;
  const initialTab: TabKey = (VALID_TABS as readonly string[]).includes(tabParam ?? "")
    ? (tabParam as TabKey)
    : "activity";
  const hasAccess = await orgHasFeature(orgId, "ai_autopilot");

  // 30-day window for the ROI funnel + glance metrics; this-week for the digest.
  const now = new Date();
  const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [config, feed, needsYou, funnel, headline, settings, establishments, ledger30d, glance] =
    await Promise.all([
      getAutopilotConfig(orgId),
      getAutopilotActivityFeed(orgId, 60),
      getNeedsHumanQueue(orgId, 25),
      buildRoiFunnel(orgId, { range: { start: since30d, end: now } }),
      getRoiHeadline(orgId, { start: since30d, end: now }),
      loadRoiSettings(orgId, null),
      listEstablishments(orgId),
      summarizeAutopilotActions(orgId, since30d), // fail-soft: all-zeros on missing table
      getGlance(orgId), // fail-soft: zeros on missing table
    ]);

  const estimate = estimateRevenue(
    {
      reviewsFromQr: funnel.reviews.fromQr,
      reviewsFromOutreach: funnel.reviews.fromOutreach,
      reviewsFromVoice: funnel.reviews.fromVoice,
      reviewsOrganic: funnel.reviews.organic,
      calls: funnel.calls,
      bookings: funnel.bookings.total,
    },
    settings,
  );

  const roiData: RoiPanelData = {
    funnel: {
      scans: funnel.scans,
      reviews: funnel.reviews,
      gbpViews: funnel.gbpViews,
      calls: funnel.calls,
      bookings: funnel.bookings,
    },
    estimatedRevenue: estimate.estimatedRevenue,
    currency: estimate.assumptions.currency,
    topDriver: headline.topDriver,
    byChannel: estimate.byChannel,
    settings: {
      establishmentId: establishments[0]?.id ?? null,
      averageJobValue: settings.averageJobValue,
      bookingToJobRate: settings.bookingToJobRate,
      currency: settings.currency,
    },
    establishments,
    rangeLabel: "last 30 days",
    automation: {
      actions: ledger30d.total,
      hoursSaved: estimateHoursSaved(ledger30d.byLoop),
    },
  };

  const steps: SetupStep[] = [
    {
      key: "enable",
      title: "Turn on Autopilot",
      body: "Flip the switch and pick a risk tolerance.",
      icon: `${ASSETS}/setup-zap.png`,
      done: config.enabled,
    },
    {
      key: "voice",
      title: "Connect your phone for Voice → Review",
      body: "Enable Voice→Review to turn calls into reviews automatically.",
      icon: `${ASSETS}/setup-phone.png`,
      done: false,
      href: "/phone",
    },
    {
      key: "roi",
      title: "Set your average job value",
      body: "We'll use this to prioritize opportunities and measure ROI.",
      icon: `${ASSETS}/setup-dollar.png`,
      done: settings.averageJobValue != null,
      href: "/autopilot?tab=roi",
    },
  ];

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Grow", "Autopilot"]}>
      <div className="ap2-page">
        {/* ---- Hero: intro + at-a-glance metrics ---- */}
        <header className="ap2-hero">
          <div className="ap2-hero__intro">
            <img className="ap2-hero__avatar" src={`${ASSETS}/bot-avatar.png`} alt="" />
            <div className="ap2-hero__text">
              <div className="ap2-hero__titlerow">
                <h1 className="ap2-hero__title">Reputation Autopilot</h1>
                <span className={`ap2-chip ${config.enabled ? "ap2-chip--on" : "ap2-chip--off"}`}>
                  {config.enabled ? "ON" : "OFF"}
                </span>
              </div>
              <p className="ap2-hero__desc">
                One switch runs your whole reputation loop — replies, review requests, Voice→Review,
                and more — then sends a weekly digest of what it did and the few things that need
                you.
              </p>
            </div>
          </div>

          <div className="ap2-card ap2-glance" aria-label="At a glance">
            <div className="ap2-glance__title">At a glance</div>
            <div className="ap2-glance__row">
              <GlanceMetric
                icon={`${ASSETS}/glance-star.png`}
                value={glance.reviews30d > 0 ? glance.avgRating.toFixed(1) : "—"}
                label="Average Rating"
              />
              <GlanceMetric
                icon={`${ASSETS}/glance-reviews.png`}
                value={glance.reviews30d.toLocaleString()}
                label="New Reviews"
              />
              <GlanceMetric
                icon={`${ASSETS}/glance-growth.png`}
                value={
                  glance.growthPct == null
                    ? "—"
                    : `${glance.growthPct >= 0 ? "+" : ""}${glance.growthPct}%`
                }
                label="Growth"
                tone={glance.growthPct == null ? undefined : glance.growthPct >= 0 ? "up" : "down"}
              />
            </div>
          </div>
        </header>

        {/* ---- Main 3-column grid: setup / master control / status rail ---- */}
        <div className="ap2-grid">
          <SetupCard steps={steps} />

          <AutopilotToggle
            enabled={config.enabled}
            riskTolerance={config.riskTolerance}
            hasAccess={hasAccess}
          />

          <aside className="ap2-rail">
            <QuickStatusCard config={config} />
            <AboutCard />
          </aside>
        </div>

        {/* ---- Tabs: Activity / Controls / ROI ---- */}
        {hasAccess ? (
          <AutopilotShell
            config={config}
            feed={feed}
            needsYou={needsYou}
            roi={roiData}
            initialTab={initialTab}
          />
        ) : (
          <UpsellTeaser />
        )}
      </div>
    </AppShellServer>
  );
}

/* ------------------------------------------------------------------ */
/* Hero: at-a-glance metric                                            */
/* ------------------------------------------------------------------ */

function GlanceMetric({
  icon,
  value,
  label,
  tone,
}: {
  icon: string;
  value: string;
  label: string;
  tone?: "up" | "down";
}) {
  return (
    <div className="ap2-glance__metric">
      <img className="ap2-glance__icon" src={icon} alt="" />
      <div>
        <div
          className={`ap2-glance__value${tone === "up" ? " is-up" : ""}${tone === "down" ? " is-down" : ""}`}
        >
          {value}
        </div>
        <div className="ap2-glance__label">{label}</div>
      </div>
    </div>
  );
}

/**
 * Cheap tenant-scoped glance metrics for the hero: 30-day average rating, new
 * review count, and growth vs the prior 30 days. Fail-soft (zeros / null
 * growth) on errors or unmigrated tables so the page never 500s.
 */
async function getGlance(
  orgId: string,
): Promise<{ avgRating: number; reviews30d: number; growthPct: number | null }> {
  try {
    return await withTenant(orgId, async (tx) => {
      const now = Date.now();
      const DAY = 864e5;
      const since30 = new Date(now - 30 * DAY);
      const since60 = new Date(now - 60 * DAY);
      const [agg, prevCount] = await Promise.all([
        tx.review.aggregate({
          where: { postedAt: { gte: since30 } },
          _avg: { rating: true },
          _count: true,
        }),
        tx.review.count({ where: { postedAt: { gte: since60, lt: since30 } } }),
      ]);
      const reviews30d = agg._count;
      const growthPct =
        prevCount > 0 ? Math.round(((reviews30d - prevCount) / prevCount) * 100) : null;
      return { avgRating: agg._avg.rating ?? 0, reviews30d, growthPct };
    });
  } catch {
    return { avgRating: 0, reviews30d: 0, growthPct: null };
  }
}

/* ------------------------------------------------------------------ */
/* Setup checklist card ("Get Autopilot Running")                      */
/* ------------------------------------------------------------------ */

type SetupStep = {
  key: string;
  title: string;
  body: string;
  icon: string;
  done: boolean;
  href?: string;
};

function SetupCard({ steps }: { steps: SetupStep[] }) {
  const doneCount = steps.filter((s) => s.done).length;
  const pct = Math.round((doneCount / steps.length) * 100);
  return (
    <section className="ap2-card ap2-setup" aria-label="Get Autopilot running">
      <h2 className="ap2-setup__title">Get Autopilot Running</h2>
      <div className="ap2-setup__progresslabel">
        {doneCount}/{steps.length} complete
      </div>
      {/* Decorative — the "n/3 complete" text above is the accessible value. */}
      <div className="ap2-setup__track" aria-hidden="true">
        <span className="ap2-setup__fill" style={{ width: `${Math.max(pct, 4)}%` }} />
      </div>

      <div className="ap2-setup__list">
        {steps.map((step) =>
          step.href && !step.done ? (
            <Link key={step.key} href={step.href} className="ap2-setup__item ap2-setup__item--link">
              <SetupRow step={step} />
            </Link>
          ) : (
            <div key={step.key} className="ap2-setup__item">
              <SetupRow step={step} />
            </div>
          ),
        )}
      </div>

      {/* Kit: label first, book glyph after the text. */}
      <Link href="/docs" className="ap2-btn-secondary ap2-setup__guide">
        View setup guide
        <Icon name="survey" size={14} />
      </Link>
    </section>
  );
}

/** One checklist row's content (icon / copy / done-state indicator). */
function SetupRow({ step }: { step: SetupStep }) {
  return (
    <>
      <img className="ap2-setup__icon" src={step.icon} alt="" />
      <span className="ap2-setup__copy">
        <span className="ap2-setup__steptitle">{step.title}</span>
        <span className="ap2-setup__stepbody">{step.body}</span>
      </span>
      <span className={`ap2-setup__state${step.done ? " is-done" : ""}`} aria-hidden="true">
        <Icon name={step.done ? "check" : "chevR"} size={12} stroke={2.2} />
      </span>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Right rail: quick status + about                                    */
/* ------------------------------------------------------------------ */

const RISK_LABEL: Record<string, string> = {
  conservative: "Conservative",
  balanced: "Balanced",
  aggressive: "Aggressive",
};

function QuickStatusCard({ config }: { config: AutopilotConfigView }) {
  return (
    <section className="ap2-card ap2-quick" aria-label="Quick status">
      <h2 className="ap2-rail__title">Quick status</h2>
      <div className="ap2-quick__row">
        <span className="ap2-quick__label">Autopilot</span>
        <span className={`ap2-chip ${config.enabled ? "ap2-chip--on" : "ap2-chip--off"}`}>
          {config.enabled ? "ON" : "OFF"}
        </span>
      </div>
      <div className="ap2-quick__row">
        <span className="ap2-quick__label">Risk tolerance</span>
        <span className="ap2-chip ap2-chip--indigo">
          {RISK_LABEL[config.riskTolerance] ?? config.riskTolerance}
        </span>
      </div>
      <div className="ap2-quick__row">
        <span className="ap2-quick__label">Auto-replies to 5★</span>
        <span
          className={`ap2-chip ${config.loops.autoReply5Star ? "ap2-chip--on" : "ap2-chip--off"}`}
        >
          {config.loops.autoReply5Star ? "ON" : "OFF"}
        </span>
      </div>
    </section>
  );
}

function AboutCard() {
  return (
    <section className="ap2-card ap2-about" aria-label="About Autopilot">
      <h2 className="ap2-rail__title">About Autopilot</h2>
      <div className="ap2-about__body">
        <p className="ap2-about__copy">
          Autopilot handles the busywork so you can focus on what matters.
        </p>
        <img className="ap2-about__art" src={`${ASSETS}/about-clipboard.png`} alt="" />
      </div>
      <Link href="/tour" className="ap2-btn-secondary ap2-about__cta">
        <Icon name="play" size={12} />
        Learn how it works
      </Link>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Misc                                                                */
/* ------------------------------------------------------------------ */

/**
 * Hours saved, derived from REAL ledger counts × an average handling time per
 * action type (the assumption is surfaced in the tile's caption). Pure math —
 * no fixtures; zero actions → 0.
 */
const MINUTES_PER_ACTION: Record<string, number> = {
  auto_reply: 6,
  low_star_draft: 4,
  review_request: 3,
  voice_review: 3,
  dispute: 10,
  geo_post: 8,
  inbox_reply: 4,
  escalation: 1,
};

function estimateHoursSaved(byLoop: Record<string, number>): number {
  let minutes = 0;
  for (const [loop, count] of Object.entries(byLoop)) {
    minutes += (MINUTES_PER_ACTION[loop] ?? 2) * count;
  }
  return minutes / 60;
}

/** Establishments for the ROI settings dropdown (tolerant of empty/unmigrated). */
async function listEstablishments(orgId: string): Promise<{ id: string; name: string }[]> {
  try {
    const rows = await withTenant(orgId, (tx) =>
      tx.establishment.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true },
        take: 50,
      }),
    );
    return rows;
  } catch {
    return [];
  }
}

function UpsellTeaser() {
  return (
    <div className="ap2-card" style={{ marginTop: 20, padding: 28, textAlign: "center" }}>
      <EmptyIllustration name="upgrade" size={150} />
      <h3 style={{ margin: "14px 0 6px", fontSize: 17 }}>
        Self-driving reputation is a Pro feature
      </h3>
      <p
        className="dim"
        style={{ fontSize: 13, maxWidth: 460, margin: "0 auto 16px", lineHeight: 1.6 }}
      >
        Upgrade to let Autopilot reply to reviews, send review requests, turn phone calls into
        Google reviews, and show you the revenue — all on one toggle, with a weekly digest.
      </p>
      <a href="/subscription?feature=ai_autopilot" className="btn btn--pri">
        Upgrade to Pro
      </a>
    </div>
  );
}
