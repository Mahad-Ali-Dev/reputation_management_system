import { Suspense } from "react";
import { getOrgContext } from "@/lib/auth/org-context";
import { isOrgEntitled } from "@/lib/billing/entitlements";
import { AppShellServer } from "@/components/app-shell-server";
import { TopBar } from "@/components/topbar";
import { PageHeader } from "@/components/page-header";
import { UpgradeCard } from "@/components/pro-gate";

import { buildOverviewMetrics, normalizeRange } from "@/lib/seo/overview";
import { generateExecSummary } from "@/lib/seo/exec-summary";
import {
  getPrimaryEstablishmentId,
  listSeoSnapshots,
  listKeywordRanks,
  getCitationAudit,
  getGa4Summary,
  listCompetitors,
  getGeoGridLatest,
  getSeoSnapshotLatest,
} from "@/lib/seo/queries";
import { getGbpInsights } from "@/lib/seo/adapters/gbp-insights";
import { fetchCoreWebVitals } from "@/lib/seo/adapters/pagespeed";
import { computeRecommendations } from "@/lib/seo/recommendations";
import type { ScoreFactor } from "@/lib/seo/reputation-score";

import { ReportsTabs, type ReportTabKey } from "./_components/reports-tabs";
import { RangeSelector } from "./_components/range-selector";
import { OverviewPanel } from "./_components/overview-panel";
import { WeeklyReportsPanel } from "./_components/weekly-reports-panel";
import { ReputationScorePanel } from "./_components/reputation-score-panel";
import { SeoPanel } from "./_components/seo-panel";
import { CompetitorsPanel } from "./_components/competitors-panel";
import { RecommendationsPanel } from "./_components/recommendations-panel";

export const dynamic = "force-dynamic";

const VALID_TABS = new Set<ReportTabKey>([
  "overview",
  "weekly",
  "score",
  "seo",
  "competitors",
  "recommendations",
]);

type SearchParams = { tab?: string; range?: string };

/**
 * Business Reports — the intelligence hub (Module 13).
 *
 * Server host: resolves org context + entitlement, then fetches all per-tab
 * data (reputation FIRST, then the Pro-gated SEO/competitor layer only when
 * entitled) and renders the date-ranged `<ReportsTabs>` shell. The standalone
 * SEO onboarding wizard has been retired — global agentic onboarding
 * (`/onboarding` + the orchestrator) now provisions setup, so this page always
 * shows the report tabs. Every SEO read is fail-soft (the SEO tables aren't
 * migrated until the founder applies the SQL), so this never 500s.
 */
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { orgId } = await getOrgContext();
  const sp = await searchParams;
  const rangeDays = normalizeRange(sp.range);
  const requestedTab = (sp.tab ?? "overview") as ReportTabKey;
  const activeTab: ReportTabKey = VALID_TABS.has(requestedTab) ? requestedTab : "overview";

  const [entitled, establishmentId] = await Promise.all([
    isOrgEntitled(orgId),
    getPrimaryEstablishmentId(orgId),
  ]);

  const header = (
    <PageHeader
      title="Business Reports"
      description="Your reputation + local-SEO intelligence hub — reviews, rankings, competitors, and what to do next."
      breadcrumb={[{ label: "Intelligence" }, { label: "Business Reports" }]}
      actions={
        <Suspense fallback={null}>
          <RangeSelector current={rangeDays} />
        </Suspense>
      }
    />
  );

  // ── Full hub ─────────────────────────────────────────────────
  // Reputation-first data (always available). SEO/competitor data only when
  // entitled — we never fetch+send gated panel content to a non-entitled client.
  const [metrics, snapshots, latestSnapshot, competitors, geoGrid] = await Promise.all([
    buildOverviewMetrics(orgId, rangeDays, establishmentId),
    listSeoSnapshots(orgId, { establishmentId }),
    getSeoSnapshotLatest(orgId, establishmentId),
    listCompetitors(orgId, establishmentId),
    getGeoGridLatest(orgId, establishmentId),
  ]);

  const execSummary = await generateExecSummary(orgId, rangeDays, metrics);
  const scoreFactors: ScoreFactor[] = metrics.seo.scoreFactors;
  const recommendationsRaw = computeRecommendations({
    establishmentId,
    ourRecentReviewVelocity: metrics.reputation.recentReviewVelocity,
    // A competitor's TOTAL review count isn't a velocity; down-scale to a
    // comparable recent-window signal (≈ per-month) for the benchmark.
    competitorVelocities: competitors.map((c) => Math.round((c.reviewCount ?? 0) / 12)),
    geoGrid: geoGrid ? { keyword: geoGrid.keyword, areaLabel: null, cells: geoGrid.cells } : null,
  });

  // Geo grid props for the Recommendations + (future) geo views.
  const geoGridProps = geoGrid
    ? {
        keyword: geoGrid.keyword,
        gridSize: geoGrid.gridSize,
        cells: geoGrid.cells,
        establishmentId,
        canSchedule: entitled,
      }
    : null;

  // SEO + Competitors panels: only build their data when entitled. When not,
  // the tab is padlocked and we render an UpgradeCard placeholder.
  const seoNode = entitled
    ? await renderSeoPanel(orgId, establishmentId, metrics)
    : <UpgradeCard feature="rank_tracking" />;
  const competitorsNode = entitled
    ? await renderCompetitorsPanel(orgId, establishmentId, metrics, competitors)
    : <UpgradeCard feature="competitor_intel" />;

  const panels: Record<ReportTabKey, React.ReactNode> = {
    overview: <OverviewPanel metrics={metrics} execSummary={serializeSummary(execSummary)} entitled={entitled} />,
    weekly: <WeeklyReportsPanel snapshots={snapshots} entitled={entitled} />,
    score: <ReputationScorePanel score={latestSnapshot?.reputationScore ?? metrics.seo.reputationScore} factors={pickFactors(latestSnapshot?.scoreFactors, scoreFactors)} />,
    seo: seoNode,
    competitors: competitorsNode,
    recommendations: (
      <RecommendationsPanel
        recommendations={recommendationsRaw}
        geoGrid={geoGridProps}
        establishmentId={establishmentId}
        canSchedule={entitled}
      />
    ),
  };

  return (
    <AppShellServer topBar={<TopBar title="Business Reports" />} crumbs={["Intelligence", "Business Reports"]}>
      {header}
      <Suspense fallback={<div className="ds-card" style={{ height: 360 }} />}>
        <ReportsTabs activeTab={activeTab} entitled={entitled} panels={panels} />
      </Suspense>
    </AppShellServer>
  );
}

// ── data builders ────────────────────────────────────────────

function serializeSummary(s: { summary: string; generatedAt: Date; ai: boolean }) {
  return { summary: s.summary, generatedAt: s.generatedAt.toISOString(), ai: s.ai };
}

/** Prefer the stored snapshot factors; fall back to the freshly-computed ones. */
function pickFactors(stored: unknown, fresh: ScoreFactor[]): ScoreFactor[] {
  if (Array.isArray(stored) && stored.length > 0) return stored as ScoreFactor[];
  return fresh;
}

async function renderSeoPanel(orgId: string, establishmentId: string | null, metrics: Awaited<ReturnType<typeof buildOverviewMetrics>>) {
  const [keywordRanks, citations, ga4, gbp] = await Promise.all([
    listKeywordRanks(orgId, establishmentId),
    getCitationAudit(orgId, establishmentId),
    getGa4Summary(orgId, establishmentId),
    getGbpInsights(orgId),
  ]);
  // PageSpeed needs a URL; use the org website if present. No URL ⇒ adapter
  // returns {available:false} cleanly.
  const vitals = await fetchCoreWebVitals({ url: metricsWebsiteUrl(metrics) });
  return (
    <SeoPanel
      data={{
        keywordRanks,
        citations,
        ga4,
        gbp,
        vitals,
        connected: metrics.connected,
      }}
    />
  );
}

/** The org website url isn't on OverviewMetrics; PageSpeed gates on creds anyway. */
function metricsWebsiteUrl(_metrics: Awaited<ReturnType<typeof buildOverviewMetrics>>): string {
  return "";
}

async function renderCompetitorsPanel(
  _orgId: string,
  establishmentId: string | null,
  metrics: Awaited<ReturnType<typeof buildOverviewMetrics>>,
  competitors: Awaited<ReturnType<typeof listCompetitors>>,
) {
  const ctx = await getOrgContext();
  return (
    <CompetitorsPanel
      data={{
        competitors,
        you: {
          name: ctx.org.name,
          rating: metrics.reputation.avgRating || null,
          reviewCount: metrics.reputation.reviewCount || null,
        },
        establishmentId,
      }}
    />
  );
}
