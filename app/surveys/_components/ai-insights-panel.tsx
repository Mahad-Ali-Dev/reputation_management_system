"use client";

import { UpgradeCard } from "@/components/pro-gate";
import { Icon } from "@/components/shell/icon";
import { refreshSurveyInsightsAction } from "@/lib/surveys/insight-actions";
import { MIN_RESPONSES_FOR_INSIGHTS, type SurveyInsight } from "@/lib/surveys/insights-types";
import { useState, useTransition } from "react";
import { InsightCard } from "./insight-card";

/**
 * AI Insights tab (Module 11 — the differentiator). Renders the cached insights
 * in a responsive 2×2 grid, the gated empty state below 10 responses, an upgrade
 * affordance for Free plans, and a "Refresh Analysis" button wired to
 * `refreshSurveyInsightsAction`. Entitlement is decided server-side (`hasAccess`).
 */
export function AiInsightsPanel({
  initialInsights,
  responseCount,
  generatedAt,
  hasAccess,
}: {
  initialInsights: SurveyInsight[];
  responseCount: number;
  generatedAt: string | null;
  /** Computed server-side via orgHasFeature (no client secret). */
  hasAccess: boolean;
}) {
  const [insights, setInsights] = useState<SurveyInsight[]>(initialInsights);
  const [lastGenerated, setLastGenerated] = useState<string | null>(generatedAt);
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);

  const gated = responseCount < MIN_RESPONSES_FOR_INSIGHTS;

  function handleRefresh() {
    setNotice(null);
    startTransition(async () => {
      const result = await refreshSurveyInsightsAction();
      if (result.ok && result.gated) {
        setNotice(
          `Collect at least ${MIN_RESPONSES_FOR_INSIGHTS} responses to unlock AI Insights.`,
        );
        return;
      }
      if (result.ok) {
        setInsights(result.insights);
        setLastGenerated(result.generatedAt);
        if (result.insights.length === 0) setNotice("Analysis ran but found no clear themes yet.");
        return;
      }
      if (result.reason === "not_entitled") {
        setNotice("AI Insights is a Pro feature. Upgrade to generate insights.");
      } else if (result.reason === "budget") {
        setNotice("Daily AI budget reached. Try again tomorrow.");
      } else if (result.reason === "no_key") {
        setNotice("AI is not configured on this workspace yet.");
        setInsights(result.insights);
      } else {
        setNotice("Couldn't refresh analysis. Please try again.");
      }
    });
  }

  // Free plan → upgrade card (server already decided hasAccess).
  if (!hasAccess) {
    return (
      <div className="surv-upgrade">
        <UpgradeCard feature="surveys_insights" />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="surv-sechead">
        <div>
          <h3 className="surv-sechead__title">AI Insights</h3>
          <p className="surv-sechead__sub">
            Claude reads all your survey responses and surfaces the few things worth acting on
            ranked by priority, with a concrete recommendation each.
          </p>
        </div>
        <button
          type="button"
          className="btn btn--sm surv-sechead__action"
          onClick={handleRefresh}
          disabled={pending || gated}
        >
          <Icon name="refresh" size={12} />
          {pending ? "Analyzing…" : "Refresh analysis"}
        </button>
      </div>

      {notice && <div className="ds-card surv-notice">{notice}</div>}

      {gated ? (
        <GatedState responseCount={responseCount} />
      ) : insights.length === 0 ? (
        <EmptyState onRefresh={handleRefresh} pending={pending} />
      ) : (
        <div className="surv-ins-grid">
          {insights.slice(0, 4).map((ins, i) => (
            <InsightCard key={`${ins.type}-${i}`} insight={ins} />
          ))}
        </div>
      )}

      {lastGenerated && !gated && (
        <div className="surv-generated">
          <Icon name="clock" size={11} />
          Last generated {new Date(lastGenerated).toLocaleString()} · AI cost is metered against
          your plan.
        </div>
      )}
    </div>
  );
}

const KIT = "/assets/repulabs/customer-surveys/ai-insight";

/**
 * Kit "Unlock smart insights" card — two columns: value-prop benefits on the
 * left, analytics-illustration + honest threshold/progress on the right. Shown
 * below the 10-response minimum. Progress + copy come from the real response
 * count; the illustration is decorative (never presented as real analysis).
 */
function GatedState({ responseCount }: { responseCount: number }) {
  const remaining = Math.max(0, MIN_RESPONSES_FOR_INSIGHTS - responseCount);
  const pct = Math.min(100, Math.round((responseCount / MIN_RESPONSES_FOR_INSIGHTS) * 100));
  return (
    <div className="ds-card surv-ai-unlock">
      <div className="surv-ai-unlock__left">
        <span className="surv-eyebrow">
          <Icon name="sparkle" size={11} />
          AI INSIGHTS
        </span>
        <h2 className="surv-ai-h">
          Unlock smart <em>insights</em>
          <br />
          from your surveys
        </h2>
        <p className="surv-ai-intro">
          Our AI analyzes responses and highlights what matters most so you can take action with
          confidence.
        </p>
        <div className="surv-ai-benefits">
          <AiBenefit
            art="discover"
            tile="surv-tile--violet"
            title="Discover key themes"
            body="Understand the top topics your customers care about."
          />
          <AiBenefit
            art="green-smiley"
            tile="surv-tile--green"
            title="Spot strengths"
            body="See what's working well and worth celebrating."
          />
          <AiBenefit
            art="improve"
            tile="surv-tile--orange"
            title="Find areas to improve"
            body="Identify pain points and fix issues faster."
          />
        </div>
      </div>
      <div className="surv-ai-unlock__right">
        <img src="/assets/repulabs/customer-surveys/results/over-time.svg" alt="" aria-hidden />
        <h3 className="surv-ai-threshold-h">
          Collect at least {MIN_RESPONSES_FOR_INSIGHTS} responses
        </h3>
        <p className="surv-ai-threshold-copy">
          You have <strong>{responseCount}</strong> so far {remaining} more to go. Insights get more
          accurate the more responses you gather.
        </p>
        <span className="surv-ai-pill">
          <Icon name="plus" size={12} />
          {responseCount} / {MIN_RESPONSES_FOR_INSIGHTS} responses
        </span>
        {/* biome-ignore lint/a11y/useFocusableInteractive: read-only progress meter, not a control */}
        <div
          className="surv-ai-track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={MIN_RESPONSES_FOR_INSIGHTS}
          aria-valuenow={responseCount}
          aria-label="Responses collected for AI Insights"
        >
          <div className="surv-ai-track__fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

function AiBenefit({
  art,
  tile,
  title,
  body,
}: { art: string; tile: string; title: string; body: string }) {
  return (
    <div className="surv-ai-benefit">
      <span className={`surv-ai-benefit__tile ${tile}`} aria-hidden>
        <img src={`${KIT}/${art}.svg`} alt="" />
      </span>
      <div>
        <div className="surv-ai-benefit__title">{title}</div>
        <div className="surv-ai-benefit__body">{body}</div>
      </div>
    </div>
  );
}

function EmptyState({ onRefresh, pending }: { onRefresh: () => void; pending: boolean }) {
  return (
    <div className="ds-card surv-ins-empty">
      <div aria-hidden className="surv-ins-empty__icon">
        <Icon name="sparkle" size={24} />
      </div>
      <h3 className="surv-ins-empty__title">Ready to analyze your responses</h3>
      <p className="surv-ins-empty__sub">
        Run the analysis to turn your survey responses into prioritized, actionable insights.
      </p>
      <button type="button" className="btn btn--pri btn--lg" onClick={onRefresh} disabled={pending}>
        <Icon name="sparkle" size={14} />
        {pending ? "Analyzing…" : "Generate insights"}
      </button>
    </div>
  );
}
