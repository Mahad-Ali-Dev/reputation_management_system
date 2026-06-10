/**
 * Handler: `onboarding_step` — the agentic onboarding orchestrator.
 *
 * The orchestrator is a CHAINED step-machine: each scheduled job runs exactly
 * ONE step (inside `withTenant`), records progress on the `OnboardingRun`, then
 * enqueues the NEXT step as a fresh `scheduled_jobs` row. The minute-cron drains
 * each in turn. This keeps every unit of work small, idempotent, and crash-safe
 * (a stuck step retries; a re-fired step skips work it already did).
 *
 * Steps (auto-only path — no OAuth; each idempotent / skip-if-done; fail-soft so
 * a non-dependent step continues even if a prior one soft-failed):
 *   A provision a default Establishment + set Organization.websiteUrl/description
 *   B runAutoSetup (crawl → profile → seed AI KB)
 *   C brand voice — derive aiPersonalityStyle from the profile (budget-guarded)
 *   D detect + store connection SUGGESTIONS (Google/Yelp/Facebook from crawl)
 *   E seed default outreach templates + ONE disabled starter AutomationRule
 *   F widget key + prime dashboard briefing + Organization.onboardingStep=99
 *
 * The handler ALWAYS returns `{ ok:true }` to the dispatcher (the orchestrator
 * owns its own fail-soft semantics + status on the run); it never wants the
 * generic scheduled-job retry loop to re-run a whole step. Transient infra
 * errors are caught and the step is marked failed on the run, then the chain
 * still advances so the dashboard becomes usable.
 */

import { randomBytes } from "node:crypto";
import { anthropic, MODELS } from "@/lib/ai/client";
import { runAutoSetup } from "@/lib/ai/auto-setup";
import { checkBudget } from "@/lib/ai/budget";
import { isOrgEntitled } from "@/lib/billing/entitlements";
import { buildBriefingForOrg } from "@/lib/dashboard/briefing";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import {
  type ConnectionSuggestion,
  type OnboardingStepKey,
  type OnboardingStepPayload,
  ONBOARDING_STEP_KEYS,
} from "@/lib/onboarding/constants";
import { getRunById, patchRun, stepKeyAt } from "@/lib/onboarding/run-store";
import { schedule } from "@/lib/scheduler";
import { revalidatePath } from "next/cache";
import type { ScheduledHandlerJob } from "./index";

/** Personality enum the AiTrainingProfile + training UI accept. */
const PERSONALITIES = ["friendly", "professional", "playful", "concise"] as const;
type Personality = (typeof PERSONALITIES)[number];

export async function handleOnboardingStep(
  job: ScheduledHandlerJob,
): Promise<{ ok: boolean; detail?: string }> {
  const payload = job.payload as Partial<OnboardingStepPayload>;
  const runId = typeof payload.runId === "string" ? payload.runId : null;
  const stepIndex = typeof payload.step === "number" ? payload.step : 0;
  const businessName = typeof payload.businessName === "string" ? payload.businessName : "My Business";
  const websiteUrl = typeof payload.websiteUrl === "string" ? payload.websiteUrl : "";
  const userId = typeof payload.userId === "string" ? payload.userId : null;

  if (!runId) {
    // Malformed payload — nothing to drive. Don't churn the retry loop.
    logger.warn({ orgId: job.orgId, jobId: job.id, event: "onboarding.step.no_run_id" });
    return { ok: true, detail: "no_runId" };
  }

  const key = stepKeyAt(stepIndex);
  if (!key) {
    logger.warn({ orgId: job.orgId, runId, stepIndex, event: "onboarding.step.bad_index" });
    return { ok: true, detail: "bad_step_index" };
  }

  // If the run was already finalized (failed/done) or cancelled, stop the chain.
  const run = await getRunById(job.orgId, runId);
  if (!run) {
    return { ok: true, detail: "run_missing" };
  }
  if (run.status === "done" || run.status === "failed") {
    return { ok: true, detail: `run_${run.status}` };
  }

  await patchRun({
    orgId: job.orgId,
    runId,
    currentStep: stepIndex,
    stepKey: key,
    stepState: "running",
  });

  const ctx = { orgId: job.orgId, runId, userId, businessName, websiteUrl };
  let detail = "";
  let stepFailed = false;
  try {
    detail = await runStep(key, ctx);
  } catch (err) {
    stepFailed = true;
    detail = err instanceof Error ? err.message : String(err);
    logger.error({
      orgId: job.orgId,
      runId,
      step: key,
      error: detail,
      event: "onboarding.step.threw",
    });
  }

  await patchRun({
    orgId: job.orgId,
    runId,
    stepKey: key,
    stepState: stepFailed ? "failed" : "done",
    stepDetail: detail.slice(0, 500),
  });

  // Advance the chain. If this was the last step, finalize the run.
  const nextIndex = stepIndex + 1;
  if (nextIndex >= ONBOARDING_STEP_KEYS.length) {
    await patchRun({ orgId: job.orgId, runId, status: "done", currentStep: ONBOARDING_STEP_KEYS.length });
    logger.info({ orgId: job.orgId, runId, event: "onboarding.run.done" });
    return { ok: true, detail: "run_done" };
  }

  // Enqueue the next step (durable, deduped on (runId, step) so a re-fired
  // handler can't double-enqueue the same next step).
  try {
    await schedule({
      orgId: job.orgId,
      kind: "onboarding_step",
      runAt: new Date(),
      payload: {
        runId,
        step: nextIndex,
        businessName,
        websiteUrl,
        userId,
      } satisfies OnboardingStepPayload,
      dedupeKey: `${runId}:${nextIndex}`,
    });
  } catch (err) {
    // Couldn't enqueue the next step (e.g. scheduler unavailable). Mark the run
    // needs_user so the chain doesn't silently stall — the dashboard is still
    // usable and the user can retry.
    logger.error({
      orgId: job.orgId,
      runId,
      nextIndex,
      error: err instanceof Error ? err.message : String(err),
      event: "onboarding.step.enqueue_next_failed",
    });
    await patchRun({ orgId: job.orgId, runId, status: "needs_user", currentStep: nextIndex });
  }

  return { ok: true, detail: `step_${key}_${stepFailed ? "failed" : "done"}` };
}

type StepCtx = {
  orgId: string;
  runId: string;
  userId: string | null;
  businessName: string;
  websiteUrl: string;
};

async function runStep(key: OnboardingStepKey, ctx: StepCtx): Promise<string> {
  switch (key) {
    case "A":
      return stepA_provision(ctx);
    case "B":
      return stepB_autoSetup(ctx);
    case "C":
      return stepC_brandVoice(ctx);
    case "D":
      return stepD_suggestConnections(ctx);
    case "E":
      return stepE_seedTemplates(ctx);
    case "F":
      return stepF_finalize(ctx);
  }
}

/** A — provision a default Establishment + set Organization profile scalars. */
async function stepA_provision(ctx: StepCtx): Promise<string> {
  const { orgId, businessName, websiteUrl } = ctx;
  return withTenant(orgId, async (tx) => {
    // Skip-if-done: only create the default establishment when the org has none.
    const existing = await tx.establishment.findFirst({
      where: { deletedAt: null },
      select: { id: true },
    });
    if (!existing) {
      await tx.establishment.create({
        data: {
          organizationId: orgId,
          kind: "business",
          name: businessName,
          websiteUrl: websiteUrl || null,
        },
        select: { id: true },
      });
    }
    // Set org profile scalars only when empty (never clobber user edits).
    const org = await tx.organization.findUnique({
      where: { id: orgId },
      select: { websiteUrl: true, businessDescription: true },
    });
    await tx.organization.update({
      where: { id: orgId },
      data: {
        websiteUrl: org?.websiteUrl ?? (websiteUrl || null),
        businessDescription: org?.businessDescription ?? businessName,
      },
    });
    return existing ? "establishment exists" : "established provisioned";
  });
}

/** B — crawl → profile → seed AI KB via the pure runAutoSetup core. */
async function stepB_autoSetup(ctx: StepCtx): Promise<string> {
  const { orgId, userId, websiteUrl } = ctx;
  if (!websiteUrl) return "no website url — skipped";
  const result = await runAutoSetup({ orgId, userId: userId ?? orgId, url: websiteUrl });
  if (result.ok) {
    return `crawled ${result.pagesCrawled} page(s); fields: ${result.fields.join(", ") || "none"}`;
  }
  // Soft fail — the rest of onboarding still proceeds (fail-soft continue).
  return `auto-setup skipped: ${result.error}`;
}

/**
 * C — derive aiPersonalityStyle from the extracted profile. Budget + entitlement
 * guarded; on any gate miss or error it leaves the existing/default voice in
 * place (idempotent, zero-spend fallback).
 */
async function stepC_brandVoice(ctx: StepCtx): Promise<string> {
  const { orgId } = ctx;

  const overview = await withTenant(orgId, async (tx) => {
    const p = await tx.aiTrainingProfile.findUnique({
      where: { organizationId: orgId },
      select: { businessOverview: true, servicesProducts: true, aiPersonalityStyle: true },
    });
    return p;
  });
  if (!overview || (!overview.businessOverview && !overview.servicesProducts)) {
    return "no profile text — kept default voice";
  }

  // Gate before any paid call.
  const hasKey = !!process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== "sk-ant-...";
  if (!hasKey || !(await isOrgEntitled(orgId))) {
    return "voice gate not met — kept default";
  }
  const budget = await checkBudget(orgId);
  if (!budget.ok) return "budget exceeded — kept default";

  let personality: Personality = "friendly";
  try {
    const text = `${overview.businessOverview ?? ""}\n${overview.servicesProducts ?? ""}`.slice(0, 4000);
    const res = await anthropic.messages.create({
      model: MODELS.HAIKU,
      max_tokens: 16,
      system:
        "Classify the brand voice that best fits this business for an AI assistant replying to customers. Answer with EXACTLY one word from: friendly, professional, playful, concise. No punctuation.",
      messages: [{ role: "user", content: `<doc>${text}</doc>` }],
    });
    const out = res.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join(" ")
      .trim()
      .toLowerCase();
    const match = PERSONALITIES.find((p) => out.includes(p));
    if (match) personality = match;
  } catch (err) {
    logger.warn({
      orgId,
      error: err instanceof Error ? err.message : String(err),
      event: "onboarding.brand_voice.ai_failed",
    });
    return "voice classify failed — kept default";
  }

  await withTenant(orgId, async (tx) => {
    await tx.aiTrainingProfile.update({
      where: { organizationId: orgId },
      data: { aiPersonalityStyle: personality },
    });
  });
  return `brand voice: ${personality}`;
}

/**
 * D — detect connection SUGGESTIONS from the crawl corpus (the AiDocument the
 * auto-setup step stored). Suggestions only — no OAuth. We scan the stored
 * website doc for Google/Yelp/Facebook URLs.
 */
async function stepD_suggestConnections(ctx: StepCtx): Promise<string> {
  const { orgId, runId } = ctx;
  const corpus = await withTenant(orgId, async (tx) => {
    const doc = await tx.aiDocument.findFirst({
      where: { establishmentId: null, sourceType: "url" },
      orderBy: { createdAt: "desc" },
      select: { content: true, sourceUri: true },
    });
    return doc;
  });

  const suggestions = detectSuggestions(`${corpus?.content ?? ""}\n${corpus?.sourceUri ?? ""}`);
  await patchRun({ orgId, runId, suggestions });
  return suggestions.length ? `suggested: ${suggestions.map((s) => s.provider).join(", ")}` : "no platforms found";
}

const PROVIDER_PATTERNS: Array<{ provider: string; re: RegExp }> = [
  { provider: "google", re: /https?:\/\/(?:www\.)?(?:google\.[a-z.]+\/maps[^\s"'<>]*|g\.page\/[^\s"'<>]+|maps\.app\.goo\.gl\/[^\s"'<>]+)/i },
  { provider: "yelp", re: /https?:\/\/(?:www\.)?yelp\.[a-z.]+\/biz\/[^\s"'<>]+/i },
  { provider: "facebook", re: /https?:\/\/(?:www\.)?facebook\.com\/[^\s"'<>]+/i },
];

/** Extract at most one URL per provider from arbitrary text. Exported for tests. */
export function detectSuggestions(text: string): ConnectionSuggestion[] {
  const out: ConnectionSuggestion[] = [];
  for (const { provider, re } of PROVIDER_PATTERNS) {
    const m = text.match(re);
    if (m?.[0]) {
      out.push({ provider, url: m[0].replace(/[).,]+$/, ""), source: "website" });
    }
  }
  return out;
}

/** E — seed default outreach templates (isDefault) + ONE disabled starter rule. */
async function stepE_seedTemplates(ctx: StepCtx): Promise<string> {
  const { orgId, businessName } = ctx;
  return withTenant(orgId, async (tx) => {
    // Skip-if-done: only seed when the org has no default templates yet.
    const existingDefaults = await tx.outreachTemplate.count({ where: { isDefault: true } });
    let templateId: string | null = null;
    if (existingDefaults === 0) {
      const email = await tx.outreachTemplate.create({
        data: {
          organizationId: orgId,
          channel: "email",
          name: "Review request (email)",
          subject: `How was your experience with ${businessName}?`,
          body: `Hi {{customerName}},\n\nThanks for choosing ${businessName}! We'd love a quick review — it only takes a minute: {{reviewLink}}\n\nThank you!`,
          isDefault: true,
        },
        select: { id: true },
      });
      templateId = email.id;
      await tx.outreachTemplate.create({
        data: {
          organizationId: orgId,
          channel: "sms",
          name: "Review request (SMS)",
          body: `Hi {{customerName}}, thanks for visiting ${businessName}! Mind leaving a quick review? {{reviewLink}}`,
          isDefault: true,
        },
        select: { id: true },
      });
    } else {
      const t = await tx.outreachTemplate.findFirst({
        where: { isDefault: true, channel: "email" },
        select: { id: true },
      });
      templateId = t?.id ?? null;
    }

    // ONE disabled starter campaign — org-level (establishmentId null), keyed on
    // a stable trigger so the @@unique([org, est, trigger]) makes re-runs a no-op.
    const existingRule = await tx.automationRule.findFirst({
      where: { establishmentId: null, trigger: "post_visit" },
      select: { id: true },
    });
    if (!existingRule) {
      await tx.automationRule.create({
        data: {
          organizationId: orgId,
          establishmentId: null,
          enabled: false, // DISABLED starter — user reviews + turns on.
          trigger: "post_visit",
          delayHours: 72,
          templateId,
        },
        select: { id: true },
      });
    }
    return existingDefaults === 0 ? "templates + starter campaign seeded" : "templates already present";
  });
}

/** F — widget key + prime dashboard briefing + onboardingStep=99 + revalidate. */
async function stepF_finalize(ctx: StepCtx): Promise<string> {
  const { orgId, userId, businessName } = ctx;

  // Widget key — skip-if-done (one active key is enough for embed).
  await withTenant(orgId, async (tx) => {
    const existingKey = await tx.widgetKey.findFirst({
      where: { status: "active" },
      select: { id: true },
    });
    if (!existingKey) {
      const publicKey = `wk_${randomBytes(16).toString("base64url")}`;
      const hmacSecret = randomBytes(32).toString("base64url");
      const created = await tx.widgetKey.create({
        data: { organizationId: orgId, publicKey, hmacSecret, originAllowlist: [] },
        select: { id: true },
      });
      // audit_log.actor_id is NOT NULL — only log when a user initiated the run.
      if (userId) {
        await tx.auditLog.create({
          data: {
            organizationId: orgId,
            actorType: "user",
            actorId: userId,
            action: "ai.widget_key.created",
            resourceType: "widget_key",
            resourceId: created.id,
            afterData: { via: "onboarding_orchestrator" },
          },
        });
      }
    }
    // onboardingStep sentinel 99 = onboarding complete/dismissed.
    await tx.organization.update({ where: { id: orgId }, data: { onboardingStep: 99 } });
  });

  // Prime today's dashboard briefing (best-effort, fail-soft inside the helper).
  try {
    await buildBriefingForOrg(orgId, new Date(), businessName);
  } catch (err) {
    logger.warn({
      orgId,
      error: err instanceof Error ? err.message : String(err),
      event: "onboarding.finalize.briefing_failed",
    });
  }

  revalidatePath("/dashboard");
  revalidatePath("/ai/training");
  return "dashboard ready";
}
