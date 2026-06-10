/**
 * OnboardingRun persistence helpers (PLAIN module — no "use server").
 *
 * Shared by the orchestrator action (`orchestrator-actions.ts`), the scheduler
 * handler (`handlers/onboarding_step.ts`), and the status route. All reads/writes
 * are tenant-scoped via `withTenant`. FAIL-SOFT: the `onboarding_runs` table
 * isn't migrated until the founder runs the SQL, so every access treats Postgres
 * 42P01/42703 as "not configured" and degrades (null / no-op) instead of 500ing.
 */

import { Prisma } from "@prisma/client";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import {
  type ConnectionSuggestion,
  type OnboardingStatus,
  type OnboardingStepKey,
  ONBOARDING_STEP_KEYS,
  type OnboardingStepRecord,
  type StepState,
  initialSteps,
} from "./constants";

const PG_UNDEFINED_TABLE = "42P01";
const PG_UNDEFINED_COLUMN = "42703";

export function isMissingRelation(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const metaCode = (err.meta as { code?: string } | undefined)?.code;
    if (metaCode === PG_UNDEFINED_TABLE || metaCode === PG_UNDEFINED_COLUMN) return true;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes(PG_UNDEFINED_TABLE) || msg.includes(PG_UNDEFINED_COLUMN);
}

/** The fields callers read off a run (suggestions live inside `steps` JSON envelope). */
export type RunRow = {
  id: string;
  status: OnboardingStatus;
  businessName: string | null;
  websiteUrl: string | null;
  currentStep: number;
  steps: OnboardingStepRecord[];
  suggestions: ConnectionSuggestion[];
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * The `steps` Json column stores both the per-step checklist AND the detected
 * connection suggestions. We persist a wrapper object `{ steps, suggestions }`
 * so a single Json column carries the whole run state.
 */
type StepsEnvelope = {
  steps: OnboardingStepRecord[];
  suggestions: ConnectionSuggestion[];
};

function parseEnvelope(raw: Prisma.JsonValue | null | undefined): StepsEnvelope {
  // Back-compat: a bare array is the legacy "just steps" shape.
  if (Array.isArray(raw)) {
    return { steps: raw as unknown as OnboardingStepRecord[], suggestions: [] };
  }
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const steps = Array.isArray(o.steps) ? (o.steps as unknown as OnboardingStepRecord[]) : initialSteps();
    const suggestions = Array.isArray(o.suggestions)
      ? (o.suggestions as unknown as ConnectionSuggestion[])
      : [];
    return { steps, suggestions };
  }
  return { steps: initialSteps(), suggestions: [] };
}

function toRow(r: {
  id: string;
  status: string;
  businessName: string | null;
  websiteUrl: string | null;
  currentStep: number;
  steps: Prisma.JsonValue;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): RunRow {
  const env = parseEnvelope(r.steps);
  return {
    id: r.id,
    status: r.status as OnboardingStatus,
    businessName: r.businessName,
    websiteUrl: r.websiteUrl,
    currentStep: r.currentStep,
    steps: env.steps,
    suggestions: env.suggestions,
    createdByUserId: r.createdByUserId,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

const SELECT = {
  id: true,
  status: true,
  businessName: true,
  websiteUrl: true,
  currentStep: true,
  steps: true,
  createdByUserId: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Read the most-recent ACTIVE run (running|needs_user) for an org, or null. */
export async function getActiveRun(orgId: string): Promise<RunRow | null> {
  try {
    return await withTenant(orgId, async (tx) => {
      const r = await tx.onboardingRun.findFirst({
        where: { status: { in: ["running", "needs_user"] } },
        orderBy: { createdAt: "desc" },
        select: SELECT,
      });
      return r ? toRow(r) : null;
    });
  } catch (err) {
    if (isMissingRelation(err)) return null;
    throw err;
  }
}

/** Read the most-recent run of ANY status (for the status poller). */
export async function getLatestRun(orgId: string): Promise<RunRow | null> {
  try {
    return await withTenant(orgId, async (tx) => {
      const r = await tx.onboardingRun.findFirst({
        orderBy: { createdAt: "desc" },
        select: SELECT,
      });
      return r ? toRow(r) : null;
    });
  } catch (err) {
    if (isMissingRelation(err)) return null;
    throw err;
  }
}

/** Read one run by id (tenant-scoped). Null on missing / unmigrated. */
export async function getRunById(orgId: string, runId: string): Promise<RunRow | null> {
  try {
    return await withTenant(orgId, async (tx) => {
      const r = await tx.onboardingRun.findUnique({ where: { id: runId }, select: SELECT });
      return r ? toRow(r) : null;
    });
  } catch (err) {
    if (isMissingRelation(err)) return null;
    throw err;
  }
}

/**
 * Idempotently get-or-create the active run for an org. If one already exists
 * (partial-unique active index), it's returned untouched; otherwise a fresh
 * `running` run with the initial checklist is created. Race-safe via the unique
 * index (P2002 → re-read).
 *
 * Throws `OnboardingUnavailableError` pre-migration so the action can branch.
 */
export class OnboardingUnavailableError extends Error {
  readonly code = "onboarding_unavailable";
  constructor() {
    super("onboarding_runs table not available (pre-migration)");
    this.name = "OnboardingUnavailableError";
  }
}

export async function upsertActiveRun(args: {
  orgId: string;
  userId: string | null;
  businessName: string;
  websiteUrl: string;
}): Promise<RunRow> {
  const { orgId, userId, businessName, websiteUrl } = args;
  try {
    return await withTenant(orgId, async (tx) => {
      const existing = await tx.onboardingRun.findFirst({
        where: { status: { in: ["running", "needs_user"] } },
        orderBy: { createdAt: "desc" },
        select: SELECT,
      });
      if (existing) return toRow(existing);

      const envelope: StepsEnvelope = { steps: initialSteps(), suggestions: [] };
      try {
        const created = await tx.onboardingRun.create({
          data: {
            organizationId: orgId,
            status: "running",
            businessName,
            websiteUrl,
            currentStep: 0,
            steps: envelope as unknown as Prisma.InputJsonValue,
            createdByUserId: userId,
          },
          select: SELECT,
        });
        return toRow(created);
      } catch (err) {
        // Race: a concurrent start inserted the active run between find + create.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          const now = await tx.onboardingRun.findFirst({
            where: { status: { in: ["running", "needs_user"] } },
            orderBy: { createdAt: "desc" },
            select: SELECT,
          });
          if (now) return toRow(now);
        }
        throw err;
      }
    });
  } catch (err) {
    if (isMissingRelation(err)) throw new OnboardingUnavailableError();
    throw err;
  }
}

/** Mutate the in-memory steps array: set one step's state + detail + timestamps. */
export function markStep(
  steps: OnboardingStepRecord[],
  key: OnboardingStepKey,
  state: StepState,
  detail?: string,
): OnboardingStepRecord[] {
  const nowIso = new Date().toISOString();
  return steps.map((s) => {
    if (s.key !== key) return s;
    const next: OnboardingStepRecord = { ...s, state };
    if (detail !== undefined) next.detail = detail;
    if (state === "running") next.startedAt = nowIso;
    if (state === "done" || state === "skipped" || state === "failed") next.finishedAt = nowIso;
    return next;
  });
}

/**
 * Persist a step transition + (optionally) appended suggestions + status +
 * currentStep onto the run, in one tenant-scoped update. Read-modify-write of
 * the JSON envelope. FAIL-SOFT pre-migration (logged no-op).
 */
export async function patchRun(args: {
  orgId: string;
  runId: string;
  status?: OnboardingStatus;
  currentStep?: number;
  stepKey?: OnboardingStepKey;
  stepState?: StepState;
  stepDetail?: string;
  /** Replace the run's suggestion list with these (Step D). */
  suggestions?: ConnectionSuggestion[];
}): Promise<void> {
  const { orgId, runId } = args;
  try {
    await withTenant(orgId, async (tx) => {
      const row = await tx.onboardingRun.findUnique({
        where: { id: runId },
        select: { steps: true },
      });
      if (!row) return;
      const env = parseEnvelope(row.steps);
      let steps = env.steps;
      if (args.stepKey && args.stepState) {
        steps = markStep(steps, args.stepKey, args.stepState, args.stepDetail);
      }
      const suggestions = args.suggestions ?? env.suggestions;
      const nextEnvelope: StepsEnvelope = { steps, suggestions };

      await tx.onboardingRun.update({
        where: { id: runId },
        data: {
          ...(args.status ? { status: args.status } : {}),
          ...(args.currentStep !== undefined ? { currentStep: args.currentStep } : {}),
          steps: nextEnvelope as unknown as Prisma.InputJsonValue,
        },
      });
    });
  } catch (err) {
    if (isMissingRelation(err)) {
      logger.warn({ orgId, runId, event: "onboarding.patch.unavailable" });
      return;
    }
    throw err;
  }
}

/** Step index → 1-based label key, with bounds safety. */
export function stepKeyAt(index: number): OnboardingStepKey | null {
  return ONBOARDING_STEP_KEYS[index] ?? null;
}
