/**
 * Inbox escalate-hook registration (Module 09, Wave 3c — phase 1).
 *
 * Foundation (00) ships AiAssist's escalation as an INTERFACE with a default
 * no-op + a `registerEscalateHook(...)` registry (lib/ai/assist/escalate.ts). The
 * inbox owns the REAL handoff: when an AI generation comes back low-confidence
 * (e.g. an `inbox_reply` suggestion the model isn't sure about) and the caller
 * passed `escalate:true`, this hook surfaces it for a human by flagging an
 * InboxThread.
 *
 * Strategy (fail-soft, never throws — AiAssist already persisted the
 * KnowledgeGap, so an escalation failure must not fail the generation):
 *   - We DO NOT create brand-new fake threads from a gap (we have no channel /
 *     participant). Instead we open a lightweight `webchat` "AI escalation"
 *     InboxThread keyed by the gap id so it's idempotent + visible in the
 *     Conversations "Needs Attention" bucket with an internal note describing the
 *     low-confidence query. A teammate can pick it up.
 *
 * `ensureInboxEscalateHookRegistered()` is idempotent and is imported for side
 * effect from the support server page module so the hook is installed whenever
 * the inbox is rendered (and thus before any inbox AI Suggest runs).
 */

import { registerEscalateHook, type EscalateArgs } from "@/lib/ai/assist/escalate";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { isMissingRelation } from "./fail-soft";

let registered = false;

async function inboxEscalate(args: EscalateArgs): Promise<void> {
  // Only handle inbox-origin escalations here; other purposes fall through to
  // the (already-logged) default behaviour for their own modules.
  if (args.purpose !== "inbox_reply") {
    logger.info({
      event: "inbox.escalate.skipped_non_inbox",
      purpose: args.purpose,
      gapId: args.gapId,
    });
    return;
  }

  try {
    await withTenant(args.orgId, async (tx) => {
      const externalThreadId = `ai-escalation:${args.gapId}`;
      // Idempotent: one escalation thread per gap.
      const existing = await tx.inboxThread.findFirst({
        where: { channel: "webchat", externalThreadId },
        select: { id: true },
      });
      if (existing) return;

      const now = new Date();
      const summary = `AI was unsure how to reply: "${args.query.slice(0, 280)}"`;
      const thread = await tx.inboxThread.create({
        data: {
          organizationId: args.orgId,
          channel: "webchat",
          externalThreadId,
          subject: "AI escalation — needs a human reply",
          participant: { name: "AI escalation", aiEscalation: true, gapId: args.gapId },
          status: "open",
          lastMessageAt: now,
          lastMessageBody: summary,
          lastMessageDirection: "inbound",
          unreadCount: 1,
        },
        select: { id: true },
      });

      await tx.inboxMessage.create({
        data: {
          threadId: thread.id,
          organizationId: args.orgId,
          direction: "internal",
          body: `${summary}\n\nThe AI couldn't produce a confident reply for this conversation. Please review and respond manually.`,
          sentAt: now,
        },
      });
    });

    logger.warn({
      event: "inbox.escalate.flagged",
      orgId: args.orgId,
      gapId: args.gapId,
    });
  } catch (err) {
    // Fail-soft: a not-yet-migrated relation or any error must not break the
    // surrounding AiAssist generation (the KnowledgeGap is already saved).
    if (!isMissingRelation(err)) {
      logger.warn({
        event: "inbox.escalate.failed",
        orgId: args.orgId,
        gapId: args.gapId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

/**
 * Install the inbox escalation hook process-wide. Idempotent — safe to call on
 * every render of the support page (import-for-side-effect).
 */
export function ensureInboxEscalateHookRegistered(): void {
  if (registered) return;
  registered = true;
  registerEscalateHook(inboxEscalate);
  logger.info({ event: "inbox.escalate.hook_registered" });
}

// Register on module load too, so importing this module anywhere wires the hook.
ensureInboxEscalateHookRegistered();
