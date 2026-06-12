"use client";

import { EmptyIllustration } from "@/components/empty-state";
import { TabBar, type TabItem } from "@/components/tab-bar";
import { Icon } from "@/components/shell/icon";
import type { SurveyAutomationRow } from "@/lib/surveys/automations";
import type { IncentiveCoupon, IncentiveStats } from "@/lib/surveys/coupon-queries";
import {
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  type SurveyInsight,
} from "@/lib/surveys/insights-types";
import type {
  DetailedResponse,
  NpsDistribution,
  ResponseRatePoint,
  SurveysOverview,
} from "@/lib/surveys/queries";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { AiInsightsPanel } from "./ai-insights-panel";
import { AutomationsPanel } from "./automations-panel";
import { IncentivesPanel } from "./incentives-panel";
import { ResponsesCharts } from "./responses-charts";
import { ResponsesTable } from "./responses-table";
import { StatCards } from "./stat-cards";

/**
 * The Surveys workspace controller (Module 11) — laid out as the survey
 * lifecycle: Campaigns → Templates (Builder picker) → Automations → Results →
 * AI Insights → Incentives. The old standalone `/surveys/coupons` page now lives
 * here as the Incentives tab.
 *
 * Uses the Wave-0 `TabBar` in CONTROLLED mode so ALL panels stay mounted
 * (per-tab client state — an in-progress automation form, scroll position —
 * survives a switch). On top of controlled state we keep `?tab=<key>` in the URL
 * (shallow `router.replace`) so tabs are linkable and reload-stable. The active
 * tab is seeded from the URL by the server parent. Legacy `?tab=responses` keys
 * still resolve to the Results tab.
 *
 * Inactive panels are hidden with the native `hidden` attribute — never
 * conditionally rendered (that is the one mistake TabBar is shaped to prevent).
 */

export type SurveyCampaignCard = {
  id: string;
  name: string;
  type: string;
  status: string;
  createdAt: string;
  responses: number;
  tokens: number;
};

/** Org-wide CSAT from rating-type answers (null = none exist → tile omitted). */
export type SurveyCsat = { score: number; count: number };

/**
 * Landing-page snapshot of the smart-routing config. Routing is per-campaign
 * (`smartRouteEnabled`), so the server picks the first active routed campaign
 * and pairs it with org-wide routed-outcome counts. `null` = no campaigns yet
 * → the routing card is omitted.
 */
export type SurveyRoutingSnapshot = {
  enabled: boolean;
  sourceName: string;
  editHref: string;
  routedReview: number;
  routedAlert: number;
};

export type SurveysTabsData = {
  campaigns: SurveyCampaignCard[];
  overview: SurveysOverview;
  distribution: NpsDistribution;
  rateOverTime: ResponseRatePoint[];
  responses: DetailedResponse[];
  automations: SurveyAutomationRow[];
  automationCampaigns: { id: string; name: string }[];
  connectedProviders: string[];
  insights: SurveyInsight[];
  insightsGeneratedAt: string | null;
  responseCount: number;
  hasInsightsAccess: boolean;
  couponStats: IncentiveStats;
  coupons: IncentiveCoupon[];
  csat: SurveyCsat | null;
  routing: SurveyRoutingSnapshot | null;
};

const TAB_KEYS = [
  "surveys",
  "templates",
  "automations",
  "responses",
  "insights",
  "incentives",
] as const;
type TabKey = (typeof TAB_KEYS)[number];

const STATUS_TONE: Record<string, string> = {
  draft: "chip--out",
  active: "chip--ok",
  paused: "chip--warn",
  archived: "chip--out",
};

export function SurveysTabs({ initialTab, data }: { initialTab: TabKey; data: SurveysTabsData }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<TabKey>(initialTab);

  const onChange = useCallback(
    (key: string) => {
      const next = (TAB_KEYS as readonly string[]).includes(key) ? (key as TabKey) : "surveys";
      setTab(next);
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.set("tab", next);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const tabs: TabItem[] = [
    { key: "surveys", label: "Campaigns", icon: "survey", badge: data.campaigns.length || undefined },
    { key: "templates", label: "Templates", icon: "copy" },
    { key: "automations", label: "Automations", icon: "bolt", badge: data.automations.length || undefined },
    { key: "responses", label: "Results", icon: "pie", badge: data.responseCount || undefined },
    { key: "insights", label: "AI Insights", icon: "brain" },
    {
      key: "incentives",
      label: "Incentives",
      icon: "star",
      badge: data.couponStats.issued || undefined,
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <TabBar tabs={tabs} activeKey={tab} onChange={onChange} />
      </div>

      <div hidden={tab !== "surveys"}>
        <SurveysPanel data={data} onNavigate={onChange} />
      </div>
      <div hidden={tab !== "templates"}>
        <TemplatesPanel campaigns={data.campaigns} />
      </div>
      <div hidden={tab !== "automations"}>
        <AutomationsPanel
          automations={data.automations}
          campaigns={data.automationCampaigns}
          connectedProviders={data.connectedProviders}
        />
      </div>
      <div hidden={tab !== "responses"}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <ResponsesCharts
            distribution={data.distribution}
            rateOverTime={data.rateOverTime}
            avgNps={data.overview.avgNps}
          />
          <ResponsesTable responses={data.responses} />
        </div>
      </div>
      <div hidden={tab !== "insights"}>
        <AiInsightsPanel
          initialInsights={data.insights}
          responseCount={data.responseCount}
          generatedAt={data.insightsGeneratedAt}
          hasAccess={data.hasInsightsAccess}
        />
      </div>
      <div hidden={tab !== "incentives"}>
        <IncentivesPanel stats={data.couponStats} coupons={data.coupons} />
      </div>
    </div>
  );
}

function SurveysPanel({
  data,
  onNavigate,
}: {
  data: SurveysTabsData;
  /** Switches the workspace tab (same handler as the TabBar). */
  onNavigate: (key: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <StatCards overview={data.overview} csat={data.csat} />

      {data.routing && (
        <div className="svl-grid">
          <SmartRoutingCard routing={data.routing} />
          <AiThemesRail
            insights={data.insights}
            hasAccess={data.hasInsightsAccess}
            onNavigate={onNavigate}
          />
        </div>
      )}

      {data.responses.length > 0 && (
        <RecentResponsesCard responses={data.responses} onNavigate={onNavigate} />
      )}

      {data.campaigns.length === 0 ? (
        <div className="ds-card" style={{ padding: 48, textAlign: "center", maxWidth: 520, marginInline: "auto" }}>
          <EmptyIllustration name="surveys-empty" style={{ marginBottom: 16 }} />
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: "-0.015em" }}>No surveys yet</h3>
          <p className="dim" style={{ fontSize: 13, marginTop: 8, lineHeight: 1.6 }}>
            Create a 1-question NPS survey. Promoters auto-route to leave a Google review; detractors
            land in your private inbox.
          </p>
          <Link href="/surveys/new" className="btn btn--pri btn--lg" style={{ marginTop: 18 }}>
            <Icon name="plus" size={14} />
            Create your first survey
          </Link>
        </div>
      ) : (
        <div className="grid-2" style={{ gap: 14 }}>
          {data.campaigns.map((c) => (
            <Link
              key={c.id}
              href={`/surveys/${c.id}`}
              className="ds-card ds-card--hover"
              style={{ padding: 20, textDecoration: "none", color: "inherit" }}
            >
              <div className="row" style={{ marginBottom: 10 }}>
                <span className="lbl-mono" style={{ margin: 0 }}>
                  {c.type ?? "NPS"}
                </span>
                <span className={`chip ${STATUS_TONE[c.status] ?? "chip--out"}`} style={{ marginLeft: "auto" }}>
                  {c.status}
                </span>
              </div>
              <h3 style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.015em", margin: 0 }}>{c.name}</h3>
              <div className="dim" style={{ fontSize: 12.5, marginTop: 6 }}>
                Created {new Date(c.createdAt).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" })}
              </div>
              <div
                className="row"
                style={{ marginTop: 18, paddingTop: 12, borderTop: "1px solid var(--line)", gap: 18 }}
              >
                <div>
                  <div className="lbl-mono">Responses</div>
                  <div style={{ fontSize: 18, fontWeight: 600 }}>{c.responses.toLocaleString()}</div>
                </div>
                <div>
                  <div className="lbl-mono">Sent</div>
                  <div style={{ fontSize: 18, fontWeight: 600 }}>{c.tokens.toLocaleString()}</div>
                </div>
                <Icon name="arrowR" size={14} style={{ marginLeft: "auto", color: "var(--rl-muted-2)" }} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Smart-routing visual card — the two branch tiles (Happy → Public review /
 * Unhappy → Private recovery) mirroring the REAL per-campaign routing rule in
 * lib/surveys/actions.ts (score ≥ 8 → review_request, ≤ 6 → internal_alert).
 * Counts are org-wide routed outcomes; the edit link opens the source campaign.
 */
function SmartRoutingCard({ routing }: { routing: SurveyRoutingSnapshot }) {
  return (
    <div className="ds-card svl-route-card" style={{ padding: 20 }}>
      <div className="svl-route-head">
        <div>
          <div className="row" style={{ gap: 8 }}>
            <Icon name="bolt" size={14} style={{ color: "var(--pri)" }} />
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, letterSpacing: "-0.015em" }}>
              Smart routing
            </h3>
            <span className={`chip ${routing.enabled ? "chip--ok" : "chip--out"}`} style={{ fontSize: 11 }}>
              {routing.enabled ? "On" : "Off"}
            </span>
          </div>
          <p className="dim" style={{ margin: "4px 0 0", fontSize: 12.5, lineHeight: 1.5 }}>
            Based on “{routing.sourceName}” — happy customers go public, unhappy ones stay private.
          </p>
        </div>
        <Link href={routing.editHref} className="btn btn--sm" style={{ marginLeft: "auto" }}>
          <Icon name="edit" size={12} />
          Edit routing
        </Link>
      </div>

      <div className="svl-route-branches">
        <div className="svl-branch svl-branch--happy">
          <span className="svl-branch__icon" aria-hidden>
            <Icon name="checkCircle" size={17} />
          </span>
          <div>
            <div className="svl-branch__title">Happy → Public review</div>
            <div className="svl-branch__sub">Scores 8–10 get a review request</div>
          </div>
          <div className="svl-branch__count">
            <b>{routing.routedReview.toLocaleString()}</b>
            <span>routed · all surveys</span>
          </div>
        </div>
        <div className="svl-branch svl-branch--unhappy">
          <span className="svl-branch__icon" aria-hidden>
            <Icon name="alert" size={17} />
          </span>
          <div>
            <div className="svl-branch__title">Unhappy → Private recovery</div>
            <div className="svl-branch__sub">Scores 0–6 alert your team privately</div>
          </div>
          <div className="svl-branch__count">
            <b>{routing.routedAlert.toLocaleString()}</b>
            <span>alerted · all surveys</span>
          </div>
        </div>
      </div>

      <div className="svl-route-rule">One question, two outcomes — passives (7) are simply recorded</div>
    </div>
  );
}

/**
 * AI-theme chips rail — reuses the cached AI-insights rows already fetched for
 * the AI Insights tab (fail-soft upstream). Each chip jumps to that tab; the
 * zero/gated states are honest about why nothing is showing.
 */
function AiThemesRail({
  insights,
  hasAccess,
  onNavigate,
}: {
  insights: SurveyInsight[];
  hasAccess: boolean;
  onNavigate: (key: string) => void;
}) {
  const top = insights.slice(0, 5);
  return (
    <div className="ds-card svl-themes" style={{ padding: 20 }}>
      <div className="row" style={{ gap: 8 }}>
        <Icon name="brain" size={14} style={{ color: "var(--pri)" }} />
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, letterSpacing: "-0.015em" }}>
          AI themes
        </h3>
        <button
          type="button"
          className="btn btn--sm"
          style={{ marginLeft: "auto" }}
          onClick={() => onNavigate("insights")}
        >
          View all
          <Icon name="arrowR" size={11} />
        </button>
      </div>

      {top.length === 0 ? (
        <p className="dim" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55 }}>
          {hasAccess
            ? "No themes yet — they appear once AI analysis runs on 10+ responses."
            : "AI theme detection is a Pro feature. Open the AI Insights tab to learn more."}
        </p>
      ) : (
        <div className="svl-theme-list">
          {top.map((ins, i) => (
            <button
              key={`${ins.type}-${i}`}
              type="button"
              className="svl-theme"
              onClick={() => onNavigate("insights")}
              title={ins.description}
            >
              <span className="svl-theme__dot" style={{ background: PRIORITY_COLOR[ins.priority] }} aria-hidden />
              <span className="svl-theme__label">{ins.headline}</span>
              <span className="svl-theme__tag" style={{ color: PRIORITY_COLOR[ins.priority] }}>
                {PRIORITY_LABEL[ins.priority]}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Compact recent-responses preview (Customer / Score / Route / Status) — the
 * first rows of the same `listResponsesDetailed` data the Results tab renders
 * in full. Footer button jumps to the Results tab.
 */
function RecentResponsesCard({
  responses,
  onNavigate,
}: {
  responses: SurveysTabsData["responses"];
  onNavigate: (key: string) => void;
}) {
  const recent = responses.slice(0, 6);
  return (
    <div className="ds-card svl-recent" style={{ padding: 0, overflow: "hidden" }}>
      <div className="row" style={{ padding: "14px 16px", borderBottom: "1px solid var(--line)" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Recent responses</div>
          <div className="dim" style={{ fontSize: 12 }}>Latest feedback and where it was routed</div>
        </div>
        <button
          type="button"
          className="btn btn--sm"
          style={{ marginLeft: "auto" }}
          onClick={() => onNavigate("responses")}
        >
          View all results
          <Icon name="arrowR" size={11} />
        </button>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Score</th>
              <th>Route</th>
              <th className="svl-hide-sm">Status</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((r) => (
              <tr key={r.id}>
                <td>
                  <span style={{ fontWeight: 500 }}>{r.recipient ?? "Anonymous"}</span>
                  {r.campaignName && (
                    <div className="dim" style={{ fontSize: 11 }}>{r.campaignName}</div>
                  )}
                </td>
                <td>
                  <ScoreChip nps={r.npsScore} rating={r.rating} />
                </td>
                <td>
                  {r.smartRouteTo === "review_request" ? (
                    <span className="chip chip--ok" style={{ fontSize: 11 }}>Public review</span>
                  ) : r.smartRouteTo === "internal_alert" ? (
                    <span className="chip chip--warn" style={{ fontSize: 11 }}>Private recovery</span>
                  ) : (
                    <span className="dim">—</span>
                  )}
                </td>
                <td className="svl-hide-sm">
                  <span className="dim" style={{ whiteSpace: "nowrap", fontSize: 12 }}>
                    Completed {new Date(r.createdAt).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" })}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Color-coded score chip — NPS 0–10 preferred, 1–5★ rating fallback. */
function ScoreChip({ nps, rating }: { nps: number | null; rating: number | null }) {
  if (nps !== null) {
    const tone =
      nps >= 9
        ? { bg: "var(--ok-soft, rgba(5,150,105,0.1))", fg: "var(--ok)" }
        : nps >= 7
          ? { bg: "var(--warn-soft, rgba(217,119,6,0.1))", fg: "var(--warn)" }
          : { bg: "var(--bad-soft, rgba(220,38,38,0.1))", fg: "var(--bad)" };
    return (
      <span
        className="chip"
        style={{ background: tone.bg, color: tone.fg, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
      >
        {nps}/10
      </span>
    );
  }
  if (rating !== null) return <span>{rating}★</span>;
  return <span className="dim">—</span>;
}

function TemplatesPanel({ campaigns }: { campaigns: SurveyCampaignCard[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="row" style={{ alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, letterSpacing: "-0.015em" }}>Templates</h3>
          <p className="dim" style={{ margin: "4px 0 0", fontSize: 12.5, maxWidth: 540, lineHeight: 1.55 }}>
            Build a reusable question set + branding, preview it live, then send or automate it.
          </p>
        </div>
        <Link href="/surveys/templates" className="btn btn--pri btn--sm" style={{ marginLeft: "auto" }}>
          <Icon name="ext" size={12} />
          Open template library
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <div className="ds-card" style={{ padding: 36, textAlign: "center" }}>
          <p className="dim" style={{ fontSize: 13, margin: 0 }}>
            No templates yet.{" "}
            <Link href="/surveys/templates" style={{ color: "var(--pri)" }}>
              Create one
            </Link>{" "}
            to reuse across campaigns.
          </p>
        </div>
      ) : (
        <div className="grid-3" style={{ gap: 12 }}>
          {campaigns.map((c) => (
            <Link
              key={c.id}
              href={`/surveys/templates/${c.id}`}
              className="ds-card ds-card--hover"
              style={{ padding: 16, textDecoration: "none", color: "inherit" }}
            >
              <div className="row" style={{ marginBottom: 8 }}>
                <Icon name="copy" size={14} style={{ color: "var(--rl-muted)" }} />
                <span className="lbl-mono" style={{ marginLeft: "auto", margin: 0 }}>
                  {c.type ?? "NPS"}
                </span>
              </div>
              <div style={{ fontSize: 14.5, fontWeight: 600 }}>{c.name}</div>
              <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>
                Edit questions & branding →
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
