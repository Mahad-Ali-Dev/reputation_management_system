import { AppShellServer } from "@/components/app-shell-server";
import { EmptyIllustration } from "@/components/empty-state";
import { GettingStarted, type ChecklistStep } from "@/components/getting-started";
import { PageHeader } from "@/components/page-header";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { orgHasFeature } from "@/lib/billing/feature-access";
import { withTenant } from "@/lib/db/with-tenant";
import {
  getAutopilotActivityFeed,
  getAutopilotConfig,
  getNeedsHumanQueue,
} from "@/lib/autopilot/queries";
import { buildRoiFunnel } from "@/lib/roi/attribution";
import { estimateRevenue } from "@/lib/roi/estimate";
import { getRoiHeadline, loadRoiSettings } from "@/lib/roi/summary";
import { AutopilotShell } from "./_components/autopilot-shell";
import { AutopilotToggle } from "./_components/autopilot-toggle";
import type { RoiPanelData } from "./_components/roi-panel";

/**
 * /autopilot — the named product surface ("self-driving reputation").
 *
 * Server component: reads everything tenant-scoped (tolerant of unmigrated
 * tables), renders the hero toggle (always visible, with an upsell hint when not
 * entitled) + the three-tab shell (Activity / Controls / ROI). The toggle gates
 * itself on entitlement server-side; the activity/ROI teaser is fine to show.
 */

export const dynamic = "force-dynamic";

export default async function AutopilotPage() {
  const { orgId } = await getOrgContext();
  const hasAccess = await orgHasFeature(orgId, "ai_autopilot");

  // 30-day window for the ROI funnel; this-week for the digest/overview.
  const now = new Date();
  const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [config, feed, needsYou, funnel, headline, settings, establishments] = await Promise.all([
    getAutopilotConfig(orgId),
    getAutopilotActivityFeed(orgId, 60),
    getNeedsHumanQueue(orgId, 25),
    buildRoiFunnel(orgId, { range: { start: since30d, end: now } }),
    getRoiHeadline(orgId, { start: since30d, end: now }),
    loadRoiSettings(orgId, null),
    listEstablishments(orgId),
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
  };

  const steps: ChecklistStep[] = [
    {
      key: "enable",
      title: "Turn on Autopilot",
      body: "Flip the switch and pick a risk tolerance. Autopilot starts running your reputation loop.",
      done: config.enabled,
    },
    {
      key: "voice",
      title: "Connect your phone for Voice → Review",
      body: "Resolved calls become Google review requests automatically — the funnel no competitor has.",
      done: false,
      cta: { label: "Phone setup", href: "/phone" },
    },
    {
      key: "roi",
      title: "Set your average job value",
      body: "Tell us what a job is worth so the ROI tab can estimate booked revenue.",
      done: settings.averageJobValue != null,
      cta: { label: "ROI settings", href: "/autopilot?tab=roi" },
    },
  ];

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Grow", "Autopilot"]}>
      <PageHeader
        kicker={config.enabled ? "On · running your reputation" : "Off"}
        title="Reputation Autopilot"
        description="One switch runs your whole reputation loop — replies, review requests, Voice→Review, and more — then sends a weekly digest of what it did and the few things that need you."
      />

      <GettingStarted checklistId="autopilot" title="Get Autopilot running" steps={steps} />

      <AutopilotToggle
        enabled={config.enabled}
        riskTolerance={config.riskTolerance}
        hasAccess={hasAccess}
      />

      {hasAccess ? (
        <AutopilotShell config={config} feed={feed} needsYou={needsYou} roi={roiData} />
      ) : (
        <UpsellTeaser />
      )}
    </AppShellServer>
  );
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
    <div className="ds-card" style={{ marginTop: 18, padding: 28, textAlign: "center" }}>
      <EmptyIllustration name="upgrade" size={150} />
      <h3 style={{ margin: "14px 0 6px", fontSize: 17 }}>Self-driving reputation is a Pro feature</h3>
      <p className="dim" style={{ fontSize: 13, maxWidth: 460, margin: "0 auto 16px", lineHeight: 1.6 }}>
        Upgrade to let Autopilot reply to reviews, send review requests, turn phone calls into Google
        reviews, and show you the revenue — all on one toggle, with a weekly digest.
      </p>
      <a href="/subscription?feature=ai_autopilot" className="btn btn--pri">
        Upgrade to Pro
      </a>
    </div>
  );
}
