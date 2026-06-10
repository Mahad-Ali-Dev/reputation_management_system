/**
 * Agentic onboarding orchestrator — shared constants & types.
 *
 * PLAIN MODULE (no "use server"): step keys, status enums, and the JSON shapes
 * the status API / poller consume live here so the "use server" action file
 * (`orchestrator-actions.ts`) can export ONLY async functions. The scheduler
 * handler, the status route, and the frontend all import from here.
 *
 * The orchestrator is a chained step-machine on top of `scheduled_jobs`
 * (`kind: "onboarding_step"`). One active `OnboardingRun` per org tracks
 * progress; each step runs in `withTenant` then enqueues the next. The steps
 * are the "auto" path (no OAuth) — anything requiring user consent surfaces as
 * a SUGGESTION on the run, never blocks completion.
 */

/** Terminal + in-flight run statuses (mirrors OnboardingRun.status). */
export const ONBOARDING_STATUSES = ["running", "needs_user", "done", "failed"] as const;
export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];

/** Statuses that count as an ACTIVE run (the partial-unique index keys on these). */
export const ACTIVE_ONBOARDING_STATUSES: readonly OnboardingStatus[] = ["running", "needs_user"];

/**
 * The ordered step keys. The integer index into this array is the run's
 * `currentStep` and the `step` carried in each scheduled-job payload.
 *
 *   A provision Establishment + org profile
 *   B runAutoSetup (crawl → profile → seed AI KB)
 *   C brand voice (derive aiPersonalityStyle)
 *   D detect + store connection SUGGESTIONS (no OAuth)
 *   E seed default templates + ONE disabled starter campaign
 *   F widget key + dashboard briefing + onboardingStep=99 + revalidate
 */
export const ONBOARDING_STEP_KEYS = ["A", "B", "C", "D", "E", "F"] as const;
export type OnboardingStepKey = (typeof ONBOARDING_STEP_KEYS)[number];

/** Human-readable label per step (shown in the /onboarding checklist). */
export const ONBOARDING_STEP_LABELS: Record<OnboardingStepKey, string> = {
  A: "Setting up your business",
  B: "Reading your website & building your AI",
  C: "Learning your brand voice",
  D: "Finding your review platforms",
  E: "Creating your starter templates",
  F: "Finishing your dashboard",
};

/** Per-step status in the run's `steps[]` checklist. */
export const STEP_STATES = ["pending", "running", "done", "skipped", "failed"] as const;
export type StepState = (typeof STEP_STATES)[number];

/** One entry in `OnboardingRun.steps` (a JSON array). */
export type OnboardingStepRecord = {
  key: OnboardingStepKey;
  label: string;
  state: StepState;
  /** Short human detail (e.g. "crawled 8 pages", or an error message). */
  detail?: string;
  /** ISO timestamp when the step last transitioned to running. */
  startedAt?: string;
  /** ISO timestamp when the step reached a terminal state. */
  finishedAt?: string;
};

/**
 * A detected (but not connected) review/social platform surfaced from the
 * crawl corpus. SUGGESTIONS ONLY — the user still has to OAuth-connect each.
 */
export type ConnectionSuggestion = {
  provider: string; // google | yelp | facebook
  url: string;
  /** Where we found it (e.g. "footer link", "contact page"). */
  source?: string;
};

/**
 * The status JSON the poller (`GET /api/onboarding/status`) returns and the
 * `/onboarding` page renders. STABLE CONTRACT for the frontend agent.
 */
export type OnboardingStatusResponse = {
  /** False when no active/most-recent run exists for the org. */
  hasRun: boolean;
  run: {
    id: string;
    status: OnboardingStatus;
    businessName: string | null;
    websiteUrl: string | null;
    /** Index into ONBOARDING_STEP_KEYS of the step currently in flight. */
    currentStep: number;
    totalSteps: number;
    steps: OnboardingStepRecord[];
    suggestions: ConnectionSuggestion[];
    /** True once status is "done" or "needs_user" (dashboard is usable). */
    dashboardReady: boolean;
    createdAt: string;
    updatedAt: string;
  } | null;
};

/** Build the initial `steps[]` checklist (all pending) for a fresh run. */
export function initialSteps(): OnboardingStepRecord[] {
  return ONBOARDING_STEP_KEYS.map((key) => ({
    key,
    label: ONBOARDING_STEP_LABELS[key],
    state: "pending" as StepState,
  }));
}

/** The scheduled-job payload carried by every `onboarding_step` job. */
export type OnboardingStepPayload = {
  runId: string;
  /** 0-based index into ONBOARDING_STEP_KEYS. */
  step: number;
  businessName: string;
  websiteUrl: string;
  userId: string | null;
};
