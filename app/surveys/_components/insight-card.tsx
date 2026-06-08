import { Icon, type IconName } from "@/components/shell/icon";
import {
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  type InsightPriority,
  type InsightType,
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
  return (
    <div
      className="ds-card"
      style={{
        padding: 18,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        borderLeft: `3px solid ${color}`,
        height: "100%",
      }}
    >
      <div className="row" style={{ gap: 8, alignItems: "center" }}>
        <span
          aria-hidden
          style={{
            display: "inline-grid",
            placeItems: "center",
            width: 30,
            height: 30,
            borderRadius: 9,
            background: tintFor(insight.priority),
            color,
            flexShrink: 0,
          }}
        >
          <Icon name={TYPE_ICON[insight.type]} size={15} />
        </span>
        <span
          className="chip"
          style={{
            background: tintFor(insight.priority),
            color,
            fontWeight: 600,
            fontSize: 10.5,
            textTransform: "uppercase",
            letterSpacing: "0.03em",
          }}
        >
          {PRIORITY_LABEL[insight.priority]}
        </span>
        <span className="lbl-mono" style={{ marginLeft: "auto", margin: 0 }}>
          {TYPE_LABEL[insight.type]}
        </span>
      </div>

      <h4 style={{ margin: 0, fontSize: 15.5, fontWeight: 600, letterSpacing: "-0.015em", lineHeight: 1.3 }}>
        {insight.headline}
      </h4>

      <p className="dim" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6 }}>
        {insight.description}
      </p>

      <div
        style={{
          marginTop: "auto",
          paddingTop: 10,
          borderTop: "1px solid var(--line)",
          display: "flex",
          gap: 8,
          alignItems: "flex-start",
        }}
      >
        <Icon name="arrowR" size={13} style={{ color, marginTop: 2, flexShrink: 0 }} />
        <div>
          <div className="lbl-mono" style={{ marginBottom: 2 }}>
            Recommended
          </div>
          <div style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--ink)" }}>{insight.recommendation}</div>
        </div>
      </div>

      {insight.evidenceCount > 0 && (
        <div style={{ fontSize: 11, color: "var(--rl-muted-2)" }}>
          Based on {insight.evidenceCount} response{insight.evidenceCount === 1 ? "" : "s"}
        </div>
      )}
    </div>
  );
}
