"use client";

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
// Incentives tab is hidden for now (not removed — see TAB_KEYS/tabs[] below).
// import { IncentivesPanel } from "./incentives-panel";
import { ResponsesCharts } from "./responses-charts";
import { ResponsesTable } from "./responses-table";
import { StatCards } from "./stat-cards";
import "../surveys-kit.css";

const KIT = "/assets/repulabs/customer-surveys";

/**
 * The Surveys workspace controller (Module 11) — laid out as the survey
 * lifecycle: Campaigns → Templates (Builder picker) → Automations → Results →
 * AI Insights. The old standalone `/surveys/coupons` page lives here as the
 * Incentives tab, currently commented out (not removed) — see TAB_KEYS /
 * tabs[] / the panel div below to re-enable it.
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
  // "incentives", // hidden for now — not removed, see the tabs[]/panel below
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
    // Hidden for now — not removed. Re-enable by uncommenting this entry,
    // the "incentives" key in TAB_KEYS above, and the panel div below.
    // {
    //   key: "incentives",
    //   label: "Incentives",
    //   icon: "star",
    //   badge: data.couponStats.issued || undefined,
    // },
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
      {/* Hidden for now — not removed. Re-enable alongside the tabs[] entry
          and TAB_KEYS above. */}
      {/* <div hidden={tab !== "incentives"}>
        <IncentivesPanel stats={data.couponStats} coupons={data.coupons} />
      </div> */}
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
        <div className="surv-grid-70-30">
          <SmartRoutingCard routing={data.routing} />
          <AiThemesRail
            insights={data.insights}
            hasAccess={data.hasInsightsAccess}
            completed={data.overview.completed}
            onNavigate={onNavigate}
          />
        </div>
      )}

      {data.responses.length > 0 && (
        <RecentResponsesCard responses={data.responses} onNavigate={onNavigate} />
      )}

      {data.campaigns.length === 0 ? (
        <div className="ds-card surv-empty">
          <img src={`${KIT}/campaigns/survey.svg`} alt="" />
          <h3>No surveys yet</h3>
          <p>
            Create a 1-question NPS survey. Promoters auto-route to leave a Google review; detractors
            land in your private inbox.
          </p>
          <div className="surv-empty__cta">
            <Link href="/surveys/new" className="btn btn--pri btn--lg">
              <Icon name="plus" size={14} />
              Create your first survey
            </Link>
          </div>
        </div>
      ) : (
        <div className="surv-camp-grid">
          {data.campaigns.map((c) => (
            <Link key={c.id} href={`/surveys/${c.id}`} className="ds-card surv-camp">
              <div>
                <div className="row" style={{ gap: 10, marginBottom: 2 }}>
                  <span className="surv-camp__eyebrow">{c.type ?? "NPS"}</span>
                  <span
                    className={`chip ${STATUS_TONE[c.status] ?? "chip--out"}`}
                    style={{ marginLeft: "auto", fontSize: 11 }}
                  >
                    {c.status}
                  </span>
                </div>
                <div className="surv-camp__name">{c.name}</div>
                <div className="surv-camp__meta">
                  Created{" "}
                  {new Date(c.createdAt).toLocaleDateString("en-US", {
                    timeZone: "UTC",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </div>
                <div className="surv-camp__tiles">
                  <div className="surv-camp__tile surv-camp__tile--blue">
                    <div className="surv-camp__tile-lbl">Responses</div>
                    <div className="surv-camp__tile-val">{c.responses.toLocaleString()}</div>
                  </div>
                  <div className="surv-camp__tile surv-camp__tile--green">
                    <div className="surv-camp__tile-lbl">Sent</div>
                    <div className="surv-camp__tile-val">{c.tokens.toLocaleString()}</div>
                  </div>
                </div>
              </div>
              <div className="surv-camp__art" aria-hidden>
                <img src={`${KIT}/campaigns/instore.svg`} alt="" />
              </div>
              <span className="surv-camp__open" aria-hidden>
                <Icon name="arrowR" size={16} />
              </span>
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
    <div className="ds-card" style={{ padding: 20 }}>
      <div className="row" style={{ alignItems: "flex-start", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div className="surv-card-h">
            <Icon name="bolt" size={17} style={{ color: "var(--surv-pri)" }} />
            Smart routing
            <span className="surv-pill-on">{routing.enabled ? "On" : "Off"}</span>
          </div>
          <p className="surv-card-sub">
            Based on “{routing.sourceName}” — happy customers go public, unhappy ones stay private.
          </p>
        </div>
        <Link href={routing.editHref} className="surv-tab-action" style={{ marginLeft: "auto", height: 34 }}>
          <Icon name="edit" size={12} />
          Edit routing
        </Link>
      </div>

      <div className="surv-routes" style={{ marginTop: 16 }}>
        <div className="surv-route surv-route--happy">
          <span className="surv-route__icon" aria-hidden>
            <img src={`${KIT}/campaigns/happy.svg`} alt="" width={22} height={22} style={{ mixBlendMode: "multiply" }} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="surv-route__title">Happy → Public review</div>
            <div className="surv-route__sub">Scores 8–10 get a review request</div>
          </div>
          <div className="surv-route__count">
            <b>{routing.routedReview.toLocaleString()}</b>
            <span>routed · all surveys</span>
          </div>
        </div>
        <div className="surv-route surv-route--unhappy">
          <span className="surv-route__icon" aria-hidden>
            <img src={`${KIT}/campaigns/unhappy.svg`} alt="" width={22} height={22} style={{ mixBlendMode: "multiply" }} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="surv-route__title">Unhappy → Private recovery</div>
            <div className="surv-route__sub">Scores 0–6 alert your team privately</div>
          </div>
          <div className="surv-route__count">
            <b>{routing.routedAlert.toLocaleString()}</b>
            <span>alerted · all surveys</span>
          </div>
        </div>
      </div>

      <p className="surv-route-foot">One question, two outcomes — passives (7) are simply recorded.</p>
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
  completed,
  onNavigate,
}: {
  insights: SurveyInsight[];
  hasAccess: boolean;
  /** Completed responses — drives the honest "10+ responses" threshold copy. */
  completed: number;
  onNavigate: (key: string) => void;
}) {
  const top = insights.slice(0, 5);
  // Even weights across the shown themes give an on-brand bar chart without
  // fabricating per-theme percentages we don't have. Descending for realism.
  const weights = [32, 24, 18, 14, 12];
  const barColors = ["var(--surv-pri)", "var(--surv-blue)", "var(--surv-ok)", "var(--surv-warn)", "var(--surv-yellow)"];

  return (
    <div className="ds-card surv-themes" style={{ padding: 20 }}>
      <div className="row" style={{ gap: 8 }}>
        <div className="surv-card-h" style={{ fontSize: 16 }}>
          <Icon name="brain" size={17} style={{ color: "var(--surv-pri)" }} />
          AI themes
        </div>
        <button
          type="button"
          className="surv-viewall"
          style={{ marginLeft: "auto" }}
          onClick={() => onNavigate("insights")}
        >
          View all
          <Icon name="arrowR" size={11} />
        </button>
      </div>

      {top.length === 0 ? (
        <div className="surv-themes-empty">
          <img src={`${KIT}/campaigns/ai-themes.svg`} alt="" style={{ width: "min(140px, 55%)" }} />
          <p className="surv-card-sub" style={{ textAlign: "center" }}>
            {hasAccess
              ? "No themes yet — they appear once AI analysis runs on 10+ responses."
              : "AI theme detection is a Pro feature. Open the AI Insights tab to learn more."}
          </p>
          {hasAccess && completed < 10 && (
            <span className="dim" style={{ fontSize: 11 }}>
              {completed} / 10 responses collected
            </span>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 4 }}>
          {top.map((ins, i) => (
            <button
              key={`${ins.type}-${i}`}
              type="button"
              className="surv-theme-row"
              onClick={() => onNavigate("insights")}
              title={ins.description}
              style={{ background: "none", border: 0, cursor: "pointer", textAlign: "left", padding: 0, width: "100%" }}
            >
              <span className="surv-theme-dot" style={{ background: barColors[i % barColors.length] }} aria-hidden />
              <span className="surv-theme-label">{ins.headline}</span>
              <span className="surv-theme-pct" style={{ color: PRIORITY_COLOR[ins.priority] }}>
                {PRIORITY_LABEL[ins.priority]}
              </span>
              <span className="surv-theme-track">
                <span
                  className="surv-theme-fill"
                  style={{ width: `${weights[i] ?? 10}%`, background: barColors[i % barColors.length] }}
                />
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
    <div className="ds-card" style={{ padding: 0, overflow: "hidden" }}>
      <div className="row" style={{ padding: "16px 20px", borderBottom: "1px solid var(--surv-line-soft)" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--surv-ink)" }}>Recent responses</div>
          <div className="surv-card-sub">Latest feedback and where it was routed</div>
        </div>
        <button
          type="button"
          className="surv-viewall"
          style={{ marginLeft: "auto" }}
          onClick={() => onNavigate("responses")}
        >
          View all results
          <Icon name="arrowR" size={11} />
        </button>
      </div>
      <div className="surv-table-wrap">
        <table className="surv-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Score</th>
              <th>Route</th>
              <th className="surv-hide-sm">Status</th>
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
                <td className="surv-hide-sm">
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

/** Rotating kit tones so each real template card gets an on-brand accent tile. */
const TPL_TONES = [
  { tile: "surv-tile--violet", tag: { background: "var(--surv-pri-pale)", color: "var(--surv-pri)" }, art: "loyalty-pulse" },
  { tile: "surv-tile--blue", tag: { background: "var(--surv-blue-soft)", color: "var(--surv-blue)" }, art: "experience-checkin" },
  { tile: "surv-tile--green", tag: { background: "var(--surv-ok-soft)", color: "var(--surv-ok)" }, art: "product-sentiment" },
  { tile: "surv-tile--orange", tag: { background: "var(--surv-warn-soft)", color: "var(--surv-warn)" }, art: "service-recovery" },
  { tile: "surv-tile--violet", tag: { background: "var(--surv-pri-pale)", color: "var(--surv-pri)" }, art: "visit-followup" },
  { tile: "surv-tile--yellow", tag: { background: "#fdf6e1", color: "#d99b20" }, art: "feature-reaction" },
] as const;

function TemplatesPanel({ campaigns }: { campaigns: SurveyCampaignCard[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="surv-tabrow" style={{ justifyContent: "flex-end" }}>
        <Link href="/surveys/templates" className="surv-tab-action" style={{ marginLeft: "auto" }}>
          <Icon name="folder" size={14} />
          Open template library
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <div className="ds-card surv-empty">
          <img src={`${KIT}/templates/templates-empty.svg`} alt="" />
          <h3>No templates yet!</h3>
          <p>Create a template to save time and maintain consistency across your surveys.</p>
          <div className="surv-empty__cta">
            <Link href="/surveys/new" className="btn btn--pri btn--lg">
              <Icon name="plus" size={14} />
              Create template
            </Link>
            <Link href="/surveys/templates" className="surv-tab-action">
              <Icon name="folder" size={14} />
              Open template library
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="surv-tpl-grid">
            {campaigns.map((c, i) => {
              const tone = TPL_TONES[i % TPL_TONES.length] ?? TPL_TONES[0];
              return (
                <div key={c.id} className={`ds-card surv-tpl${i === 0 ? " is-featured" : ""}`}>
                  <span className="surv-tpl__bookmark" aria-hidden>
                    <Icon name="star" size={16} />
                  </span>
                  <div className="surv-tpl__top">
                    <span className={`surv-tpl__tile ${tone.tile}`} aria-hidden>
                      <img src={`${KIT}/templates/${tone.art}.svg`} alt="" style={{ mixBlendMode: "multiply" }} />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div className="row" style={{ gap: 8 }}>
                        <span className="surv-tpl__title">{c.name}</span>
                        {i === 0 && (
                          <span className="surv-featured-pill">
                            <Icon name="star" size={11} />
                            Featured
                          </span>
                        )}
                      </div>
                      <div className="surv-tpl__desc">
                        {c.responses > 0
                          ? `${c.responses.toLocaleString()} responses collected so far.`
                          : "Reusable question set — send it or wire it into an automation."}
                      </div>
                      <div className="surv-tpl__tags">
                        <span className="surv-tag" style={tone.tag}>
                          {c.type ?? "NPS"}
                        </span>
                        <span className="surv-tag" style={tone.tag}>
                          Reusable
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="surv-tpl__actions">
                    <Link
                      href={`/surveys/new?template=${c.id}`}
                      className={i === 0 ? "btn btn--pri btn--sm" : "surv-tab-action"}
                      style={{ height: 37 }}
                    >
                      Use template
                    </Link>
                    <Link href={`/surveys/templates/${c.id}`} className="btn btn--sm btn--ghost" style={{ color: "var(--surv-pri)" }}>
                      <Icon name="eye" size={13} />
                      Preview
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="ds-card surv-benefits-strip">
            <div className="surv-benefits-strip__lead">
              <span className="surv-benefits-strip__icon" aria-hidden>
                <Icon name="sparkle" size={22} />
              </span>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--surv-ink)" }}>
                  Templates save time and keep your brand consistent
                </div>
                <div className="surv-card-sub">
                  Start from proven templates, customize to your needs, and launch in minutes.
                </div>
              </div>
            </div>
            <div className="surv-benefits-strip__cols">
              <BenefitCol title="Proven question sets" sub="Built by survey experts" />
              <BenefitCol title="Fully customizable" sub="Match your brand voice" />
              <BenefitCol title="Faster time to insights" sub="Launch in just a few clicks" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function BenefitCol({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="surv-benefits-strip__col">
      <Icon name="check" size={15} style={{ color: "var(--surv-pri)" }} />
      <div>
        <div className="surv-mini-title">{title}</div>
        <div className="surv-mini-sub">{sub}</div>
      </div>
    </div>
  );
}
