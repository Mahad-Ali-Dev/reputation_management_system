/**
 * AI Suggest service for the Unified Inbox (Module 09, Wave 3c — phase 1).
 *
 * `suggestReplies({ orgId, threadId })` loads the recent transcript of an
 * InboxThread and asks the central AiAssist service for N candidate replies
 * using the existing `inbox_reply` purpose (DO NOT fork the purpose union). The
 * thread text is passed as fenced `domain.primaryText` so AiAssist applies the
 * same prompt-injection defense + KB retrieval + safety/confidence pipeline every
 * other module uses.
 *
 * Resilience contract (tested):
 *  - Returns up to N DISTINCT option strings on the happy path.
 *  - Returns `{ options: [] }` (never throws) when AI is unconfigured, the org is
 *    not entitled, the daily budget is hit, the thread is missing/not-migrated,
 *    or generation fails — the composer just shows "no suggestions".
 *  - On a LOW-CONFIDENCE result it passes `escalate:true`, so AiAssist writes a
 *    KnowledgeGap and fires the registered escalate hook (see escalate-register).
 */

import { runAiAssist, AiBudgetError } from "@/lib/ai/assist";
import { PlanInactiveError } from "@/lib/billing/entitlements";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { softInbox } from "./fail-soft";

export type SuggestResult = {
  options: string[];
  /** Reason the option list is empty (for a softer UI hint). */
  reason?: "ok" | "ai_unconfigured" | "plan_inactive" | "ai_budget" | "no_thread" | "error";
};

/** How many recent messages of context we feed the suggester. */
const CONTEXT_WINDOW = 10;

function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Build a compact, role-labelled transcript for the prompt's primaryText. */
function renderTranscript(
  messages: { direction: string; body: string }[],
  participantName: string | null,
): string {
  const who = participantName?.trim() || "Customer";
  const lines = messages
    .filter((m) => m.direction !== "internal") // never feed internal notes to the model
    .map((m) => {
      const speaker = m.direction === "inbound" ? who : "You";
      return `${speaker}: ${m.body}`;
    });
  return lines.join("\n");
}

export async function suggestReplies(args: {
  orgId: string;
  threadId: string;
  /** Override option count (default 3, clamped 1..5 by AiAssist). */
  optionCount?: number;
  /** Texts to steer away from (Regenerate). */
  avoidTexts?: string[];
}): Promise<SuggestResult> {
  if (!isAiConfigured()) return { options: [], reason: "ai_unconfigured" };

  // 1. Load the thread transcript (tenant-scoped, fail-soft → no_thread).
  const ctx = await softInbox(
    () =>
      withTenant(args.orgId, async (tx) => {
        const thread = await tx.inboxThread.findUnique({
          where: { id: args.threadId },
          select: { id: true, channel: true, participant: true, establishmentId: true },
        });
        if (!thread) return null;
        const messages = await tx.inboxMessage.findMany({
          where: { threadId: args.threadId },
          orderBy: { sentAt: "desc" },
          take: CONTEXT_WINDOW,
          select: { direction: true, body: true },
        });
        // findMany was desc for "last N" — flip to chronological for the prompt.
        messages.reverse();
        const p =
          thread.participant && typeof thread.participant === "object"
            ? (thread.participant as Record<string, unknown>)
            : {};
        const name =
          (typeof p.name === "string" && p.name) ||
          (typeof p.displayName === "string" && p.displayName) ||
          null;
        return { channel: thread.channel, establishmentId: thread.establishmentId, messages, name };
      }),
    null,
    { event: "inbox.suggest.load_failed", swallowAll: true, context: { orgId: args.orgId } },
  );

  if (!ctx || ctx.messages.length === 0) return { options: [], reason: "no_thread" };

  const transcript = renderTranscript(ctx.messages, ctx.name);
  const channelLabel = ctx.channel.replace(/_/g, " ");

  // 2. Ask AiAssist (existing `inbox_reply` purpose). Escalate on low confidence.
  //    Use runAiAssist directly so we can thread `avoidTexts` (Regenerate).
  try {
    const result = await runAiAssist({
      orgId: args.orgId,
      purpose: "inbox_reply",
      query: `Write a helpful, on-brand reply to the latest ${channelLabel} message in this conversation. Be concise and friendly; do not invent facts.`,
      domain: {
        establishmentId: ctx.establishmentId,
        primaryText: transcript,
        rows: { channel: ctx.channel },
      },
      optionCount: args.optionCount ?? 3,
      escalate: true,
      avoidTexts: args.avoidTexts,
    });

    // Best-first already; keep unblocked options, dedupe, trim empties.
    const seen = new Set<string>();
    const options: string[] = [];
    for (const o of result.options) {
      const text = o.text.trim();
      if (!text || o.blocked) continue;
      const k = text.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      options.push(text);
    }

    return { options, reason: "ok" };
  } catch (err) {
    if (err instanceof PlanInactiveError) return { options: [], reason: "plan_inactive" };
    if (err instanceof AiBudgetError) return { options: [], reason: "ai_budget" };
    logger.warn({
      event: "inbox.suggest.failed",
      orgId: args.orgId,
      threadId: args.threadId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { options: [], reason: "error" };
  }
}
