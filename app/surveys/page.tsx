import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { orgHasFeature } from "@/lib/billing/feature-access";
import { getConnectedProviders } from "@/lib/connections/status";
import { withTenant } from "@/lib/db/with-tenant";
import { listSurveyAutomations } from "@/lib/surveys/automations";
import { couponStats, listCoupons } from "@/lib/surveys/coupon-queries";
import { getCachedInsights } from "@/lib/surveys/insights-queries";
import {
  listCampaigns,
  listResponsesDetailed,
  npsDistribution,
  responseRateOverTime,
  surveysOverview,
} from "@/lib/surveys/queries";
import { Suspense } from "react";
import type { WizardContact, WizardTemplate } from "./_components/create-wizard";
import { NewSurveyModal } from "./_components/new-survey-modal";
import {
  SurveysTabs,
  type SurveyCampaignCard,
  type SurveyCsat,
  type SurveyRoutingSnapshot,
  type SurveysTabsData,
} from "./_components/surveys-tabs";

/**
 * Customer Surveys hub (Module 11) — the 5-tab shell host.
 *
 * Fetches all server data once (campaigns, org-wide overview, NPS distribution,
 * response-rate trend, detailed responses, automations, connection status,
 * cached AI insights) and passes it to the client `<SurveysTabs>` controller.
 * Renders the zero-state checklist when there is nothing yet. `?tab=` seeds the
 * active tab server-side so deep links land on the right panel.
 */

export const dynamic = "force-dynamic";

const VALID_TABS = [
  "surveys",
  "templates",
  "automations",
  "responses",
  "insights",
  // "incentives",
] as const;
type TabKey = (typeof VALID_TABS)[number];

/** Back-compat aliases so old deep-links resolve to the lifecycle tabs. */
const TAB_ALIASES: Record<string, TabKey> = {
  campaigns: "surveys",
  results: "responses",
  // coupons: "incentives",
};

export default async function SurveysPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { orgId } = await getOrgContext();
  const { tab: tabParam } = await searchParams;
  const resolvedTab = TAB_ALIASES[tabParam ?? ""] ?? tabParam ?? "";
  const initialTab: TabKey = (VALID_TABS as readonly string[]).includes(
    resolvedTab,
  )
    ? (resolvedTab as TabKey)
    : "surveys";

  // Fetch everything in parallel; the NEW-table reads (insights/automations)
  // fail soft inside their own helpers (un-migrated → empty).
  const [
    campaignsRaw,
    overview,
    distribution,
    rateOverTime,
    responses,
    automations,
    cachedInsights,
    connectedProviders,
    hasInsightsAccess,
    couponStatsData,
    coupons,
    csat,
    routeCounts,
  ] = await Promise.all([
    listCampaigns(orgId),
    surveysOverview(orgId),
    npsDistribution(orgId),
    responseRateOverTime(orgId, 30),
    listResponsesDetailed(orgId, undefined, 200),
    listSurveyAutomations(orgId),
    getCachedInsights(orgId),
    getConnectedProviders(orgId),
    orgHasFeature(orgId, "surveys_insights"),
    couponStats(orgId),
    listCoupons(orgId, 50),
    surveysCsat(orgId),
    smartRouteCounts(orgId),
  ]);

  // Wizard data for the New Survey modal — fetched in its own small batch so it
  // can't be starved by the large parallel read above (same loaders as
  // /surveys/new, so the modal's recipient step shows the exact same contacts).
  const [wizardContacts, firstEstId] = await Promise.all([
    loadWizardContacts(orgId),
    firstEstablishmentId(orgId),
  ]);

  const campaigns: SurveyCampaignCard[] = campaignsRaw.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    status: c.status,
    createdAt: c.createdAt.toISOString(),
    responses: c._count?.responses ?? 0,
    tokens: c._count?.tokens ?? 0,
  }));

  const responseCount = overview.completed;

  // Wizard templates (existing campaigns), reused by the New Survey modal.
  const wizardTemplates: WizardTemplate[] = campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    questionCount: 0,
  }));

  // Smart-routing snapshot for the landing branch tiles. `smartRouteEnabled` is
  // per-campaign; surface the first ACTIVE campaign's config (fall back to the
  // newest) with a deep-link to edit it. Counts are org-wide, fail-soft.
  // Only a campaign that actually has routing enabled may headline the card —
  // the old `?? campaignsRaw[0]` fallback could caption org-wide routed counts
  // with a campaign that never routed anything.
  const routingSource =
    campaignsRaw.find((c) => c.status === "active" && c.smartRouteEnabled) ??
    campaignsRaw.find((c) => c.smartRouteEnabled) ??
    null;
  const routing: SurveyRoutingSnapshot | null = routingSource
    ? {
        enabled: routingSource.smartRouteEnabled,
        sourceName: routingSource.name,
        editHref: `/surveys/${routingSource.id}`,
        routedReview: routeCounts.review,
        routedAlert: routeCounts.alert,
      }
    : null;

  const data: SurveysTabsData = {
    campaigns,
    overview,
    distribution,
    rateOverTime,
    responses,
    automations,
    automationCampaigns: campaigns.map((c) => ({ id: c.id, name: c.name })),
    connectedProviders: [...connectedProviders],
    insights: cachedInsights.insights,
    insightsGeneratedAt: cachedInsights.generatedAt
      ? cachedInsights.generatedAt.toISOString()
      : null,
    responseCount,
    hasInsightsAccess,
    couponStats: couponStatsData,
    coupons,
    csat,
    routing,
    newSurvey: {
      contacts: wizardContacts,
      templates: wizardTemplates,
      defaultEstablishmentId: firstEstId,
    },
  };

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["CRM", "Customer Feedback"]}>
      <div className="surv">
        <div className="surv-hero">
          <div className="surv-hero__art" aria-hidden>
            <img
              src="/assets/repulabs/customer-surveys/campaigns/survey.svg"
              alt=""
            />
          </div>
          <PageHeader
            kicker="Campaigns · Builder · Results ·"
            title="Surveys"
            description="Run the full survey lifecycle in one place. Build a campaign, send it, read the results, and reward promoters all from these tabs. Promoters get a Google review CTA; detractors land in your private inbox so you can fix it before they post."
            actions={
              <NewSurveyModal
                contacts={wizardContacts}
                templates={wizardTemplates}
                defaultEstablishmentId={firstEstId}
              />
            }
          />
        </div>

        <Suspense
          fallback={<div className="ds-card" style={{ height: 240 }} />}
        >
          <SurveysTabs initialTab={initialTab} data={data} />
        </Suspense>
      </div>
    </AppShellServer>
  );
}

/**
 * Org-wide CSAT from rating-type answers (1–5 stars): % of ratings ≥ 4.
 * Walks recent responses (tenant-scoped) and flattens their rating answers.
 * `null` when no rating answers exist → the landing KPI tile is omitted.
 * Fail-soft (un-migrated/RLS issues → null).
 */
async function surveysCsat(orgId: string): Promise<SurveyCsat | null> {
  try {
    return await withTenant(orgId, async (tx) => {
      const rows = await tx.surveyResponse.findMany({
        orderBy: { createdAt: "desc" },
        take: 2000,
        select: {
          answers: {
            where: { question: { type: "rating" } },
            select: { value: true },
          },
        },
      });
      const ratings: number[] = [];
      for (const r of rows) {
        for (const a of r.answers) {
          const n = (a.value as { number?: number } | null)?.number;
          if (typeof n === "number" && n >= 1 && n <= 5) ratings.push(n);
        }
      }
      if (ratings.length === 0) return null;
      const satisfied = ratings.filter((n) => n >= 4).length;
      return {
        score: Math.round((satisfied / ratings.length) * 100),
        count: ratings.length,
      };
    });
  } catch {
    return null;
  }
}

/** Contacts with a valid email, for the New Survey wizard's recipient step.
 *  Fail-soft (un-migrated/RLS → []). Mirrors /surveys/new's loader. */
async function loadWizardContacts(orgId: string): Promise<WizardContact[]> {
  try {
    return await withTenant(orgId, async (tx) => {
      const rows = await tx.contact.findMany({
        where: { email: { not: null } },
        select: { id: true, name: true, email: true },
        orderBy: { createdAt: "desc" },
        take: 500,
      });
      return rows
        .filter((c): c is { id: string; name: string | null; email: string } => !!c.email)
        .map((c) => ({ id: c.id, name: c.name, email: c.email }));
    });
  } catch {
    return [];
  }
}

/** The org's first establishment id — the wizard's default routing target. */
async function firstEstablishmentId(orgId: string): Promise<string | undefined> {
  try {
    const rows = await withTenant(orgId, async (tx) =>
      tx.establishment.findMany({
        where: { deletedAt: null },
        select: { id: true },
        orderBy: { createdAt: "asc" },
        take: 1,
      }),
    );
    return rows[0]?.id;
  } catch {
    return undefined;
  }
}

/** Org-wide smart-route outcome counts (fail-soft → zeros). */
async function smartRouteCounts(
  orgId: string,
): Promise<{ review: number; alert: number }> {
  try {
    return await withTenant(orgId, async (tx) => {
      const rows = await tx.surveyResponse.groupBy({
        by: ["smartRouteTo"],
        _count: { _all: true },
      });
      let review = 0;
      let alert = 0;
      for (const r of rows) {
        if (r.smartRouteTo === "review_request") review = r._count._all;
        else if (r.smartRouteTo === "internal_alert") alert = r._count._all;
      }
      return { review, alert };
    });
  } catch {
    return { review: 0, alert: 0 };
  }
}
