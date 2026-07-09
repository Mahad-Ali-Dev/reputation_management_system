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

import "./analytics-overview.css";
import { ReportsTabs, type ReportTabKey } from "./_components/reports-tabs";
import { RangeSelector } from "./_components/range-selector";
import { OverviewPanel } from "./_components/overview-panel";
import { ExecSummaryCard } from "./_components/exec-summary-card";
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
  const ctx = await getOrgContext();
  const { orgId } = ctx;
  const sp = await searchParams;
  const rangeDays = normalizeRange(sp.range);
  const requestedTab = (sp.tab ?? "overview") as ReportTabKey;
  const activeTab: ReportTabKey = VALID_TABS.has(requestedTab) ? requestedTab : "overview";

  // Every critical-path fetch is fail-soft (.catch → default): a missing SEO
  // table (unmigrated prod), an RLS grant gap, or a slow/broken query must NOT
  // reject the Promise.all and crash the whole report. Worst case the report
  // renders with empty panels instead of the error boundary ("not working").
  const [entitled, establishmentId] = await Promise.all([
    isOrgEntitled(orgId).catch(() => false),
    getPrimaryEstablishmentId(orgId).catch(() => null),
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
    buildOverviewMetrics(orgId, rangeDays, establishmentId), // already fail-soft internally
    listSeoSnapshots(orgId, { establishmentId }).catch(() => []),
    getSeoSnapshotLatest(orgId, establishmentId).catch(() => null),
    listCompetitors(orgId, establishmentId).catch(() => []),
    getGeoGridLatest(orgId, establishmentId).catch(() => null),
  ]);

  // The AI executive summary (generateExecSummary → Anthropic, ~15s) is NOT
  // awaited on the critical path — it blocked the entire report render and blew
  // past the prod reverse-proxy timeout ("Business Reports not working"). It now
  // streams inside <Suspense> via <ExecSummaryAsync/>, so the page shell + every
  // panel render in ~3s and the summary fills in when ready.
  const scoreFactors: ScoreFactor[] = metrics.seo.scoreFactors;
  // Guarded: computeRecommendations is a pure fn on the critical path (runs
  // before the tab boundaries), so a throw here would crash the whole page.
  let recommendationsRaw: ReturnType<typeof computeRecommendations> = [];
  try {
    recommendationsRaw = computeRecommendations({
      establishmentId,
      ourRecentReviewVelocity: metrics.reputation.recentReviewVelocity,
      // A competitor's TOTAL review count isn't a velocity; down-scale to a
      // comparable recent-window signal (≈ per-month) for the benchmark.
      competitorVelocities: competitors.map((c) => Math.round((c.reviewCount ?? 0) / 12)),
      geoGrid: geoGrid ? { keyword: geoGrid.keyword, areaLabel: null, cells: geoGrid.cells } : null,
    });
  } catch {
    recommendationsRaw = [];
  }

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

  // SEO + Competitors panels hit external Google APIs (GBP Insights / GA4 /
  // PageSpeed) that can be slow in prod. They are NOT awaited on the critical
  // path — each streams inside its own <Suspense> below (see the panels map), so
  // the report shell is never blocked by a slow third-party call. Non-entitled
  // orgs get an UpgradeCard (no fetch, no gated data serialized).

  // Overview compare chart reuses the Competitors tab's `listCompetitors` rows
  // (already fetched above) — gated data is only serialized for entitled orgs.
  const competitorCompare = entitled
    ? {
        you: {
          name: ctx.org.name,
          rating: metrics.reputation.avgRating || null,
          reviewCount: metrics.reputation.reviewCount || null,
        },
        competitors: competitors.map((c) => ({
          name: c.name,
          rating: c.rating,
          reviewCount: c.reviewCount,
        })),
      }
    : null;

  const panels: Record<ReportTabKey, React.ReactNode> = {
    overview: (
      <OverviewPanel
        metrics={metrics}
        execSummarySlot={
          <Suspense
            fallback={
              <ExecSummaryCard
                summary="Generating your executive summary…"
                generatedAt={null}
                ai={false}
                canRegenerate={false}
              />
            }
          >
            <ExecSummaryAsync
              orgId={orgId}
              rangeDays={rangeDays}
              metrics={metrics}
              entitled={entitled}
            />
          </Suspense>
        }
        entitled={entitled}
        orgName={ctx.org.name}
        competitorCompare={competitorCompare}
      />
    ),
    weekly: <WeeklyReportsPanel snapshots={snapshots} entitled={entitled} />,
    score: <ReputationScorePanel score={latestSnapshot?.reputationScore ?? metrics.seo.reputationScore} factors={pickFactors(latestSnapshot?.scoreFactors, scoreFactors)} />,
    seo: entitled ? (
      <Suspense fallback={<div className="ds-card" style={{ height: 360 }} />}>
        <SeoPanelAsync orgId={orgId} establishmentId={establishmentId} metrics={metrics} />
      </Suspense>
    ) : (
      <UpgradeCard feature="rank_tracking" />
    ),
    competitors: entitled ? (
      <Suspense fallback={<div className="ds-card" style={{ height: 360 }} />}>
        <CompetitorsPanelAsync
          orgId={orgId}
          establishmentId={establishmentId}
          metrics={metrics}
          competitors={competitors}
        />
      </Suspense>
    ) : (
      <UpgradeCard feature="competitor_intel" />
    ),
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

/**
 * Prefer the stored snapshot factors; fall back to the freshly-computed ones.
 * The stored value is raw DB JSON — validate each row before trusting it, or a
 * malformed snapshot crashes the score panel (`factor.points.toFixed`).
 */
function pickFactors(stored: unknown, fresh: ScoreFactor[]): ScoreFactor[] {
  if (Array.isArray(stored) && stored.length > 0) {
    const valid = stored.filter(
      (f): f is ScoreFactor =>
        typeof (f as ScoreFactor | null)?.label === "string" &&
        Number.isFinite((f as ScoreFactor).points) &&
        Number.isFinite((f as ScoreFactor).weight),
    );
    if (valid.length > 0) return valid;
  }
  return fresh;
}

/**
 * Streamed AI executive summary. Rendered inside a <Suspense> boundary so the
 * ~15s Anthropic call never blocks the report shell (previously it did, causing
 * prod proxy timeouts). generateExecSummary is fail-soft (returns a deterministic
 * fallback, never throws), so a slow/absent model only delays this one card.
 */
async function ExecSummaryAsync({
  orgId,
  rangeDays,
  metrics,
  entitled,
}: {
  orgId: string;
  rangeDays: number;
  metrics: Awaited<ReturnType<typeof buildOverviewMetrics>>;
  entitled: boolean;
}) {
  // Hard-bound the Anthropic call so the streamed response can't hang for 15s+
  // (which, behind a buffering reverse proxy, reads as "report never loads").
  // On timeout / error → a neutral card the user can Regenerate.
  const s = await withTimeout(
    generateExecSummary(orgId, rangeDays, metrics).then(serializeSummary).catch(() => null),
    9000,
    null,
  );
  if (!s) {
    return (
      <ExecSummaryCard
        summary="Your executive summary is taking longer than usual to generate. Hit Regenerate to try again."
        generatedAt={null}
        ai={false}
        canRegenerate={entitled}
      />
    );
  }
  return (
    <ExecSummaryCard
      summary={s.summary}
      generatedAt={s.generatedAt}
      ai={s.ai}
      canRegenerate={entitled}
    />
  );
}

/** Race a promise against a timeout that resolves to a fallback — bounds any
 *  slow external call so a streamed Suspense boundary can't hang the response. */
function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: T): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((resolve) => setTimeout(() => resolve(onTimeout), ms)),
  ]);
}

/** Streamed SEO & Visibility panel — wraps renderSeoPanel in a component so its
 *  external Google/PageSpeed calls run inside a <Suspense> boundary, never on the
 *  page's critical path. */
async function SeoPanelAsync({
  orgId,
  establishmentId,
  metrics,
}: {
  orgId: string;
  establishmentId: string | null;
  metrics: Awaited<ReturnType<typeof buildOverviewMetrics>>;
}) {
  try {
    return await renderSeoPanel(orgId, establishmentId, metrics);
  } catch {
    return <PanelUnavailable label="SEO & Visibility" />;
  }
}

/** Streamed Competitors panel — same rationale as SeoPanelAsync. */
async function CompetitorsPanelAsync({
  orgId,
  establishmentId,
  metrics,
  competitors,
}: {
  orgId: string;
  establishmentId: string | null;
  metrics: Awaited<ReturnType<typeof buildOverviewMetrics>>;
  competitors: Awaited<ReturnType<typeof listCompetitors>>;
}) {
  try {
    return await renderCompetitorsPanel(orgId, establishmentId, metrics, competitors);
  } catch {
    return <PanelUnavailable label="Competitors" />;
  }
}

/** Tiny degraded-state card for a panel whose data source failed (missing table,
 *  RLS grant gap, external API down) — keeps the report shell alive. */
function PanelUnavailable({ label }: { label: string }) {
  return (
    <div
      className="ds-card"
      style={{ padding: 28, textAlign: "center", color: "var(--ink-3, #667085)", fontSize: 13.5 }}
    >
      {label} data is temporarily unavailable. It’ll appear here once the
      integration is connected and syncing.
    </div>
  );
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
