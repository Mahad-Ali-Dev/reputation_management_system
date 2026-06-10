"use server";

/**
 * Agentic onboarding orchestrator — server actions.
 *
 * "use server" module: exports ONLY async functions. Step keys, status enums,
 * and run-state helpers live in the plain modules `./constants` + `./run-store`.
 *
 * startOnboarding(form): the entry point from `/onboarding`'s 2-field form
 * (business name + website). It:
 *   1. requireRole("admin")          — only an admin can kick off a build
 *   2. assertEntitled                — paid pipeline; gate before any work
 *   3. rate-limit                    — bounds repeat starts (url_crawl limiter)
 *   4. SSRF-validate the URL         — same http(s) + shape check as auto-setup
 *   5. upsert the active OnboardingRun (idempotent — partial-unique active index)
 *   6. enqueue step A (ScheduledJob now; QStash too when configured, for speed)
 *   7. redirect("/onboarding")       — the page polls /api/onboarding/status
 *
 * Idempotency: re-submitting returns the existing active run + re-enqueues step A
 * with the same dedupeKey, so a double-click never spawns a second build.
 */

import { z } from "zod";
import { requireRole } from "@/lib/auth/rbac";
import { assertEntitled } from "@/lib/billing/entitlements";
import { logger } from "@/lib/logger";
import { assertRateLimit } from "@/lib/ratelimit";
import {
  type OnboardingStepPayload,
  type OnboardingStatusResponse,
} from "./constants";
import { buildStatusResponse } from "./status";
import {
  OnboardingUnavailableError,
  getActiveRun as _getActiveRun,
  type RunRow,
  upsertActiveRun,
} from "./run-store";
import { schedule } from "@/lib/scheduler";
import { redirect } from "next/navigation";

const StartSchema = z.object({
  businessName: z.string().trim().min(1, "Enter your business name").max(200),
  websiteUrl: z
    .string()
    .trim()
    .url("Enter a valid website URL")
    .max(2048)
    .refine((u) => u.startsWith("https://") || u.startsWith("http://"), "URL must be http(s)"),
});

/** Result returned to the form when we DON'T redirect (validation / gate errors). */
export type StartOnboardingResult = { ok: false; error: string };

/**
 * Kick off (or resume) the onboarding build. On success this REDIRECTS to
 * `/onboarding` and never returns; it only returns a `{ ok:false }` for a
 * recoverable validation/entitlement/rate-limit error the form can render.
 */
export async function startOnboarding(form: FormData): Promise<StartOnboardingResult> {
  const { orgId, userId } = await requireRole("admin");

  // Paid pipeline — gate before any work.
  try {
    await assertEntitled(orgId);
  } catch {
    return { ok: false, error: "Automated setup isn't included on your current plan. Upgrade in Settings → Subscription." };
  }

  // Rate-limit repeat starts (reuse the crawl limiter — same external-fetch cost).
  try {
    await assertRateLimit("url_crawl", orgId);
  } catch {
    return { ok: false, error: "You've started a setup recently. Please wait a couple of minutes and try again." };
  }

  const parsed = StartSchema.safeParse({
    businessName: form.get("businessName"),
    websiteUrl: form.get("websiteUrl"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your details and try again." };
  }
  const { businessName, websiteUrl } = parsed.data;

  await enqueueRun({ orgId, userId, businessName, websiteUrl });
  redirect("/onboarding");
}

/**
 * Re-drive a stalled run from its current step (the run went `needs_user`, e.g.
 * a step couldn't enqueue its successor). Admin + entitlement gated. Resumes by
 * re-enqueuing the step the run is parked on (deduped, so it's a safe no-op if a
 * job is already queued). Redirects back to `/onboarding`.
 */
export async function retryOnboarding(): Promise<StartOnboardingResult> {
  const { orgId, userId } = await requireRole("admin");
  try {
    await assertEntitled(orgId);
  } catch {
    return { ok: false, error: "Automated setup isn't included on your current plan." };
  }

  const run = await _getActiveRun(orgId);
  if (!run) {
    return { ok: false, error: "There's no setup in progress to retry." };
  }

  const step = Math.max(0, run.currentStep);
  try {
    await scheduleStep({
      orgId,
      runId: run.id,
      step,
      businessName: run.businessName ?? "My Business",
      websiteUrl: run.websiteUrl ?? "",
      userId: run.createdByUserId ?? userId,
    });
  } catch (err) {
    logger.error({
      orgId,
      runId: run.id,
      error: err instanceof Error ? err.message : String(err),
      event: "onboarding.retry.enqueue_failed",
    });
    return { ok: false, error: "Couldn't resume setup right now. Please try again shortly." };
  }
  redirect("/onboarding");
}

/**
 * Read helper for the active run (re-exported as an async server action so the
 * `/onboarding` page can call it). Returns the typed run row or null.
 */
export async function getActiveRun(): Promise<RunRow | null> {
  const { orgId } = await requireRole("manager");
  return _getActiveRun(orgId);
}

/** The status JSON for the active/latest run (used by the page + poller server-side). */
export async function getOnboardingStatus(): Promise<OnboardingStatusResponse> {
  const { orgId } = await requireRole("manager");
  return buildStatusResponse(orgId);
}

// ---- internals (async; allowed in a "use server" module) ----

/** Upsert the active run + enqueue step A (durable now; QStash too for speed). */
async function enqueueRun(args: {
  orgId: string;
  userId: string;
  businessName: string;
  websiteUrl: string;
}): Promise<void> {
  const { orgId, userId, businessName, websiteUrl } = args;

  let run: RunRow;
  try {
    run = await upsertActiveRun({ orgId, userId, businessName, websiteUrl });
  } catch (err) {
    if (err instanceof OnboardingUnavailableError) {
      // Pre-migration: surface a soft log but don't 500 the form — redirect still
      // lands on /onboarding which shows a friendly "not available yet" state.
      logger.warn({ orgId, event: "onboarding.start.unavailable" });
      return;
    }
    throw err;
  }

  await scheduleStep({
    orgId,
    runId: run.id,
    step: run.currentStep, // resume at the run's current step (0 for a fresh run)
    businessName,
    websiteUrl,
    userId,
  });
}

/**
 * Enqueue ONE onboarding step as a durable ScheduledJob (runAt now). The
 * minute-cron (`/api/cron/dispatch-scheduled`) drains it and the handler chains
 * to the next step. Deduped on `(runId, step)` so a re-submit / double-click is
 * idempotent.
 */
async function scheduleStep(p: {
  orgId: string;
  runId: string;
  step: number;
  businessName: string;
  websiteUrl: string;
  userId: string | null;
}): Promise<void> {
  const payload: OnboardingStepPayload = {
    runId: p.runId,
    step: p.step,
    businessName: p.businessName,
    websiteUrl: p.websiteUrl,
    userId: p.userId,
  };

  await schedule({
    orgId: p.orgId,
    kind: "onboarding_step",
    runAt: new Date(),
    payload,
    dedupeKey: `${p.runId}:${p.step}`,
  });
}
