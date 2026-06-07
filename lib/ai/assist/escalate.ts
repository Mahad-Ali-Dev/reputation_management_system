import { logger } from "@/lib/logger";
import type { AiAssistPurpose } from "./types";

/**
 * Escalation hook (00_foundation §A4.6).
 *
 * When a generation comes back low-confidence AND the caller passed
 * `escalate: true`, AiAssist writes a KnowledgeGap and then calls an escalation
 * hook so a human can pick the item up (e.g. an inbox handoff). The hook is an
 * INTERFACE implemented per module — Step 9 (inbox) owns the real handoff.
 *
 * The foundation ships only the default no-op, which logs a `warn` so the
 * escalation is observable even before a real implementation is wired (risk #8:
 * "low-confidence inbox items silently only create a KnowledgeGap").
 */
export type EscalateArgs = {
  orgId: string;
  purpose: AiAssistPurpose;
  /** The KnowledgeGap row id written for this low-confidence result. */
  gapId: string;
  query: string;
};

export type EscalateFn = (args: EscalateArgs) => Promise<void>;

/** Default no-op escalation hook. Logs a `warn` so it is observable. */
export const defaultEscalate: EscalateFn = async (args) => {
  logger.warn(
    {
      orgId: args.orgId,
      purpose: args.purpose,
      gapId: args.gapId,
      event: "ai.assist.escalate.noop",
    },
    "AiAssist escalation requested but no handler is wired (default no-op). " +
      "A KnowledgeGap was written; a module (e.g. Step 9 inbox) should register a real hook.",
  );
};

// Module-level registry. Step 9 calls `registerEscalateHook(...)` once at
// startup to install the inbox handoff; until then the no-op is used.
let activeHook: EscalateFn = defaultEscalate;

/** Install the process-wide escalation hook (idempotent; last write wins). */
export function registerEscalateHook(fn: EscalateFn): void {
  activeHook = fn;
}

/** Reset to the default no-op (test hygiene). */
export function resetEscalateHook(): void {
  activeHook = defaultEscalate;
}

/**
 * Run the active escalation hook. Never throws — an escalation failure must not
 * fail the surrounding generation (the KnowledgeGap is already persisted).
 */
export async function runEscalation(args: EscalateArgs): Promise<void> {
  try {
    await activeHook(args);
  } catch (err) {
    logger.warn({
      orgId: args.orgId,
      purpose: args.purpose,
      gapId: args.gapId,
      error: err instanceof Error ? err.message : String(err),
      event: "ai.assist.escalate.failed",
    });
  }
}
