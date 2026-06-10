"use client";

import { EmptyIllustration } from "@/components/empty-state";
import { TabBar, type TabItem } from "@/components/tab-bar";
import { Icon } from "@/components/shell/icon";
import type { SurveyAutomationRow } from "@/lib/surveys/automations";
import type { IncentiveCoupon, IncentiveStats } from "@/lib/surveys/coupon-queries";
import type { SurveyInsight } from "@/lib/surveys/insights-types";
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
        <SurveysPanel data={data} />
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

function SurveysPanel({ data }: { data: SurveysTabsData }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <StatCards overview={data.overview} />
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
                Created {new Date(c.createdAt).toLocaleDateString()}
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
