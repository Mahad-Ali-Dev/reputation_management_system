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
            Claude reads all your survey responses and surfaces the few things worth acting on —
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

function GatedState({ responseCount }: { responseCount: number }) {
  const remaining = Math.max(0, MIN_RESPONSES_FOR_INSIGHTS - responseCount);
  const pct = Math.min(100, Math.round((responseCount / MIN_RESPONSES_FOR_INSIGHTS) * 100));
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
        <Icon name="brain" size={24} />
      </div>
      <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: "-0.015em" }}>
        Collect at least {MIN_RESPONSES_FOR_INSIGHTS} responses to unlock AI Insights
      </h3>
      <p className="dim" style={{ fontSize: 13, marginTop: 8, lineHeight: 1.6 }}>
        You have <strong>{responseCount}</strong> so far — {remaining} more to go. Insights get more
        accurate the more responses you gather.
      </p>
      <div
        style={{
          height: 8,
          maxWidth: 280,
          margin: "16px auto 0",
          borderRadius: 999,
          background: "var(--surface-3)",
          overflow: "hidden",
        }}
      >
        <div style={{ height: "100%", width: `${pct}%`, background: "var(--pri)", borderRadius: 999 }} />
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
