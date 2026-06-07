import { assertEntitled } from "@/lib/billing/entitlements";
import { checkBudget } from "@/lib/ai/budget";
import { logger } from "@/lib/logger";
import { assembleContext } from "./context";
import { generate } from "./generate";
import { classifyText } from "./safety";
import { scoreConfidence, isLowConfidence } from "./confidence";
import { writeKnowledgeGap } from "./knowledge-gap";
import { runEscalation } from "./escalate";
import {
  AiBudgetError,
  type AiAssistInput,
  type AiAssistOption,
  type AiAssistResult,
  type AiAssistDomain,
  type AiAssistPurpose,
} from "./types";

/**
 * AiAssist — the central agentic service (00_foundation §A4).
 *
 * The single architectural object every module's draft/suggest/insight/argument
 * feature calls, so agentic behavior is consistent and metered. This file is
 * the orchestrator; each step delegates to an existing internal or a sibling
 * module. There are NO per-purpose branches in the orchestrator — purpose-
 * specific behavior lives in `context.ts` (domain rows), `generate.ts`
 * (PromptVersion + instruction), and the safety/confidence steps.
 *
 * Fixed pipeline (do not reorder):
 *   1. (caller) requireRole / verified orgId      — the service trusts input.orgId
 *   2. assertEntitled(orgId)                       — paid-feature gate (entitlements)
 *   3. checkBudget(orgId)  → !ok ⇒ AiBudgetError   — daily cap, BEFORE generate
 *   4. assembleContext(input)                      — KB (retrieve+rerank) + profile + domain rows
 *   5. generate(input, ctx)                        — N options, logs 1 AiMessage each
 *   6. classifyText(option)                        — AiSafetyVerdict per option
 *   7. scoreConfidence(option)                     — 0..1, model self-rating else proxy
 *   8. best confidence < threshold ⇒ writeKnowledgeGap + (escalate? runEscalation)
 *   9. return AiAssistResult (best-first)
 *
 * Errors: `AiBudgetError` (code "ai_budget"), `PlanInactiveError` (from
 * entitlements). Transport/generation errors bubble as `Error` so callers can
 * show a retry.
 */

export async function runAiAssist(input: AiAssistInput): Promise<AiAssistResult> {
  const { orgId, purpose } = input;

  // 2. Entitlement gate (the UI gate is presentation-only; this is the boundary).
  await assertEntitled(orgId);

  // 3. Budget check BEFORE any generation spend.
  const budget = await checkBudget(orgId);
  if (!budget.ok) {
    logger.warn({ orgId, purpose, event: "ai.assist.budget_exceeded" });
    throw new AiBudgetError(budget.spentMicros, budget.capMicros);
  }

  // 4. Context assembly (KB + persona + fenced domain rows).
  const ctx = await assembleContext(input);

  // 5. Generate N options (each logs its own AiMessage).
  const gen = await generate(input, ctx);

  // 6–7. Safety + confidence per option, in parallel.
  const sourceText = input.domain?.primaryText ?? null;
  const scored = await Promise.all(
    gen.options.map(async (opt): Promise<AiAssistOption> => {
      const safety = await classifyText({
        orgId,
        aiMessageId: opt.aiMessageId,
        candidate: opt.text,
        sourceText,
      });
      const confidence = scoreConfidence(purpose, {
        kbChunksUsed: ctx.kbChunks.length,
        rerankRationaleStrong: ctx.rerankRationaleStrong,
        safetyClean: !safety.blocked,
        textLength: opt.text.length,
        modelSelfRating: opt.modelSelfRating,
      });
      return {
        text: opt.text,
        aiMessageId: opt.aiMessageId,
        confidence,
        blocked: safety.blocked,
        safetyFlags: safety.flags,
      };
    }),
  );

  // Best-first ordering: unblocked before blocked, then by confidence desc.
  scored.sort((a, b) => {
    if (a.blocked !== b.blocked) return a.blocked ? 1 : -1;
    return b.confidence - a.confidence;
  });

  const costMicros = gen.options.reduce((sum, o) => sum + o.costMicros, 0) + ctx.costMicros;
  const best = scored[0];
  const bestConfidence = best?.confidence ?? 0;

  // 8. Low-confidence learning loop + optional escalation.
  let knowledgeGapId: string | null = null;
  let escalated = false;
  if (!best || isLowConfidence(bestConfidence)) {
    const gap = await writeKnowledgeGap({
      orgId,
      query: input.query,
      context: summarizeContext(ctx.usedChunkIds.length, input.domain),
      confidence: bestConfidence,
      purpose,
      establishmentId: input.domain?.establishmentId ?? null,
      aiMessageId: best?.aiMessageId ?? null,
    });
    knowledgeGapId = gap.id;

    if (input.escalate && gap.id) {
      await runEscalation({ orgId, purpose, gapId: gap.id, query: input.query });
      escalated = true;
    }
  }

  return {
    purpose,
    options: scored,
    usedChunkIds: ctx.usedChunkIds,
    costMicros,
    knowledgeGapId,
    escalated,
    promptVersionId: gen.promptVersionId,
  };
}

/**
 * Re-run a generation, asking for materially different options than before.
 * Thin wrapper over `runAiAssist` that threads the prior texts into the
 * `avoidTexts` fence and applies an optional tone override.
 */
export async function regenerate(
  prevResult: {
    purpose: AiAssistPurpose;
    orgId: string;
    query: string;
    domain?: AiAssistDomain;
  },
  opts?: { avoidTexts?: string[]; toneHint?: string },
): Promise<AiAssistResult> {
  return runAiAssist({
    orgId: prevResult.orgId,
    purpose: prevResult.purpose,
    query: prevResult.query,
    domain: prevResult.domain,
    toneHint: opts?.toneHint,
    avoidTexts: opts?.avoidTexts,
  });
}

/**
 * Spec-named alias (`assist({ orgId, purpose, input, domainContext, n })`).
 * Keeps a single source of truth: it just shapes its args into `AiAssistInput`
 * and calls `runAiAssist`. Prefer importing `runAiAssist` directly in new code.
 */
export async function assist(args: {
  orgId: string;
  purpose: AiAssistPurpose;
  input: string;
  domainContext?: AiAssistDomain;
  n?: number;
  toneHint?: string;
  escalate?: boolean;
  skipKb?: boolean;
}): Promise<AiAssistResult> {
  return runAiAssist({
    orgId: args.orgId,
    purpose: args.purpose,
    query: args.input,
    domain: args.domainContext,
    optionCount: args.n,
    toneHint: args.toneHint,
    escalate: args.escalate,
    skipKb: args.skipKb,
  });
}

/** A non-secret one-line summary of what context fed the (unsure) generation. */
function summarizeContext(chunkCount: number, domain?: AiAssistDomain): string {
  const bits = [`kb_chunks=${chunkCount}`];
  if (domain?.establishmentId) bits.push("establishment=set");
  if (domain?.primaryText) bits.push(`primary_text_len=${domain.primaryText.length}`);
  if (domain?.rows) bits.push(`rows=${Object.keys(domain.rows).length}`);
  return bits.join("; ");
}

// Re-export the public surface so callers `import { ... } from "@/lib/ai/assist"`.
export {
  AiBudgetError,
  type AiAssistInput,
  type AiAssistOption,
  type AiAssistResult,
  type AiAssistDomain,
  type AiAssistPurpose,
} from "./types";
