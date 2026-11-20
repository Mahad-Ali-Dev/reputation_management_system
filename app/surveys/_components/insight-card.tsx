import { Icon, type IconName } from "@/components/shell/icon";
import {
  type InsightPriority,
  type InsightType,
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  type SurveyInsight,
} from "@/lib/surveys/insights-types";

/**
 * Presentational insight card (Module 11 AI Insights). Pure props — used by
 * `ai-insights-panel.tsx`'s 2×2 grid. The priority → colour/label maps come
 * from `lib/surveys/insights` (single source of truth, unit-tested).
 */

const TYPE_ICON: Record<InsightType, IconName> = {
  recurring_negative_theme: "alert",
  staff_highlight: "star",
  nps_trend: "trend",
  survey_fatigue: "clock",
  period_comparison: "bars",
  improvement_rec: "sparkle",
};

const TYPE_LABEL: Record<InsightType, string> = {
  recurring_negative_theme: "Recurring theme",
  staff_highlight: "Staff highlight",
  nps_trend: "NPS trend",
  survey_fatigue: "Survey fatigue",
  period_comparison: "Period comparison",
  improvement_rec: "Recommendation",
};

/** Soft background tint per priority (paired with the solid token border). */
function tintFor(priority: InsightPriority): string {
  switch (priority) {
    case "red":
      return "var(--bad-soft, rgba(220,38,38,0.08))";
    case "orange":
      return "var(--warn-soft, rgba(217,119,6,0.08))";
    case "green":
      return "var(--ok-soft, rgba(5,150,105,0.08))";
    default:
      return "var(--pri-50, rgba(37,99,235,0.06))";
  }
}

export function InsightCard({ insight }: { insight: SurveyInsight }) {
  const color = PRIORITY_COLOR[insight.priority];
  const tone = { "--ins-c": color, "--ins-tint": tintFor(insight.priority) } as React.CSSProperties;
  return (
    <div className="ds-card surv-ins" style={tone}>
      <div className="surv-ins__top">
        <span aria-hidden className="surv-ins__icon">
          <Icon name={TYPE_ICON[insight.type]} size={15} />
        </span>
        <span className="surv-ins__prio">{PRIORITY_LABEL[insight.priority]}</span>
        <span className="surv-ins__type">{TYPE_LABEL[insight.type]}</span>
      </div>

      <h4 className="surv-ins__title">{insight.headline}</h4>

      <p className="surv-ins__desc">{insight.description}</p>

      <div className="surv-ins__rec">
        <Icon name="arrowR" size={13} className="surv-ins__rec-icon" />
        <div>
          <div className="surv-ins__rec-lbl">Recommended</div>
          <div className="surv-ins__rec-body">{insight.recommendation}</div>
        </div>
      </div>

      {insight.evidenceCount > 0 && (
        <div className="surv-ins__foot">
          Based on {insight.evidenceCount} response{insight.evidenceCount === 1 ? "" : "s"}
        </div>
      )}
    </div>
  );
}
