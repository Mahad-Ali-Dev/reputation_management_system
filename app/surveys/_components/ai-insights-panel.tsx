"use client";

import { Icon } from "@/components/shell/icon";
import { UpgradeCard } from "@/components/pro-gate";
import {
  MIN_RESPONSES_FOR_INSIGHTS,
  type SurveyInsight,
} from "@/lib/surveys/insights-types";
import { refreshSurveyInsightsAction } from "@/lib/surveys/insight-actions";
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
        setNotice(`Collect at least ${MIN_RESPONSES_FOR_INSIGHTS} responses to unlock AI Insights.`);
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
      <div style={{ display: "flex", justifyContent: "center", padding: "32px 16px" }}>
        <UpgradeCard feature="surveys_insights" />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="row" style={{ alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, letterSpacing: "-0.015em" }}>
            AI Insights
          </h3>
          <p className="dim" style={{ margin: "4px 0 0", fontSize: 12.5, maxWidth: 540, lineHeight: 1.55 }}>
            Claude reads all your survey responses and surfaces the few things worth acting on
            ranked by priority, with a concrete recommendation each.
          </p>
        </div>
        <button
          type="button"
          className="btn btn--sm"
          style={{ marginLeft: "auto" }}
          onClick={handleRefresh}
          disabled={pending || gated}
        >
          <Icon name="refresh" size={12} />
          {pending ? "Analyzing…" : "Refresh analysis"}
        </button>
      </div>

      {notice && (
        <div
          className="ds-card"
          style={{ padding: "10px 14px", fontSize: 12.5, color: "var(--rl-muted)", background: "var(--surface-2)" }}
        >
          {notice}
        </div>
      )}

      {gated ? (
        <GatedState responseCount={responseCount} />
      ) : insights.length === 0 ? (
        <EmptyState onRefresh={handleRefresh} pending={pending} />
      ) : (
        <div className="grid-2" style={{ gap: 14, alignItems: "stretch" }}>
          {insights.slice(0, 4).map((ins, i) => (
            <InsightCard key={`${ins.type}-${i}`} insight={ins} />
          ))}
        </div>
      )}

      {lastGenerated && !gated && (
        <div className="dim" style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name="clock" size={11} />
          Last generated {new Date(lastGenerated).toLocaleString()} · AI cost is metered against your plan.
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
          <AiBenefit art="discover" tile="surv-tile--violet" title="Discover key themes" body="Understand the top topics your customers care about." />
          <AiBenefit art="green-smiley" tile="surv-tile--green" title="Spot strengths" body="See what's working well and worth celebrating." />
          <AiBenefit art="improve" tile="surv-tile--orange" title="Find areas to improve" body="Identify pain points and fix issues faster." />
        </div>
      </div>
      <div className="surv-ai-unlock__right">
        <img src="/assets/repulabs/customer-surveys/results/over-time.svg" alt="" aria-hidden style={{ width: "min(300px, 80%)" }} />
        <h3 className="surv-ai-threshold-h">Collect at least {MIN_RESPONSES_FOR_INSIGHTS} responses</h3>
        <p className="surv-ai-threshold-copy">
          You have <strong>{responseCount}</strong> so far {remaining} more to go. Insights get more
          accurate the more responses you gather.
        </p>
        <span className="surv-ai-pill">
          <Icon name="plus" size={12} />
          {responseCount} / {MIN_RESPONSES_FOR_INSIGHTS} responses
        </span>
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

function AiBenefit({ art, tile, title, body }: { art: string; tile: string; title: string; body: string }) {
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
    <div className="ds-card" style={{ padding: 40, textAlign: "center", maxWidth: 520, marginInline: "auto" }}>
      <div
        aria-hidden
        style={{
          width: 52,
          height: 52,
          borderRadius: 14,
          margin: "0 auto 16px",
          background: "var(--pri-50, rgba(37,99,235,0.08))",
          color: "var(--pri)",
          display: "grid",
          placeItems: "center",
        }}
      >
        <Icon name="sparkle" size={24} />
      </div>
      <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: "-0.015em" }}>
        Ready to analyze your responses
      </h3>
      <p className="dim" style={{ fontSize: 13, marginTop: 8, lineHeight: 1.6 }}>
        Run the analysis to turn your survey responses into prioritized, actionable insights.
      </p>
      <button type="button" className="btn btn--pri btn--lg" style={{ marginTop: 18 }} onClick={onRefresh} disabled={pending}>
        <Icon name="sparkle" size={14} />
        {pending ? "Analyzing…" : "Generate insights"}
      </button>
    </div>
  );
}
