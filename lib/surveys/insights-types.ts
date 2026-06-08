/**
 * Pure constants and types for Survey AI Insights (Module 11).
 *
 * Kept in a separate file with zero Node.js / Anthropic imports so that client
 * components and the read-only insights-queries module can import them without
 * pulling node:crypto or the Anthropic SDK into the browser bundle.
 */

/** The closed set of insight categories the model may emit. */
export const INSIGHT_TYPES = [
  "recurring_negative_theme",
  "staff_highlight",
  "nps_trend",
  "survey_fatigue",
  "period_comparison",
  "improvement_rec",
] as const;
export type InsightType = (typeof INSIGHT_TYPES)[number];

/** The closed set of priority levels (→ card colour). */
export const INSIGHT_PRIORITIES = ["red", "orange", "green", "blue"] as const;
export type InsightPriority = (typeof INSIGHT_PRIORITIES)[number];

/**
 * Maps priority → a design-system colour token. `red` = urgent problem,
 * `orange` = watch, `green` = strength, `blue` = informational.
 */
export const PRIORITY_COLOR: Record<InsightPriority, string> = {
  red: "var(--bad)",
  orange: "var(--warn)",
  green: "var(--ok)",
  blue: "var(--pri)",
};

/** Human label per priority (for the card badge). */
export const PRIORITY_LABEL: Record<InsightPriority, string> = {
  red: "Urgent",
  orange: "Watch",
  green: "Strength",
  blue: "Insight",
};

/** Below this many responses, insights are gated (build-plan AC). */
export const MIN_RESPONSES_FOR_INSIGHTS = 10;

/** A single insight card (the cached row shape + the model's output shape). */
export type SurveyInsight = {
  type: InsightType;
  priority: InsightPriority;
  headline: string;
  description: string;
  recommendation: string;
  evidenceCount: number;
};
