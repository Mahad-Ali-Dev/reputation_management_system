import { logger } from "@/lib/logger";

/**
 * Email deliverability guard.
 *
 * Surfaces two SILENT failure modes that otherwise make outbound email look
 * "sent" while real recipients receive nothing:
 *
 *   1. RESEND_API_KEY missing — every send throws / no-ops, often swallowed.
 *   2. EMAIL_FROM resolves to a *.resend.dev SANDBOX address (e.g.
 *      `onboarding@resend.dev`). Resend ACCEPTS these sends and returns a
 *      message id with no error, but ONLY delivers them to the Resend account
 *      owner — every other recipient silently gets nothing.
 *
 * Call `assertSendableEmailConfig(from)` at every Resend client construction /
 * send site so the misconfiguration is LOUD in logs instead of invisible.
 *
 * Warnings are deduped per-process (keyed by reason) so a per-minute cron or a
 * bulk send doesn't spam the log — the first occurrence is enough to diagnose.
 */

const _warned = new Set<string>();

/** Pull the `addr@host` out of a "Name <addr@host>" or bare-address `from`. */
function extractAddress(from: string): string {
  const angle = from.match(/<([^>]+)>/);
  return (angle?.[1] ?? from).trim().toLowerCase();
}

/** True when `from` points at the Resend sandbox domain (`*.resend.dev`). */
export function isSandboxFrom(from: string | null | undefined): boolean {
  if (!from) return false;
  const addr = extractAddress(from);
  const host = addr.includes("@") ? addr.slice(addr.indexOf("@") + 1) : addr;
  return host === "resend.dev" || host.endsWith(".resend.dev");
}

function warnOnce(reason: string, payload: Record<string, unknown>, msg: string): void {
  if (_warned.has(reason)) return;
  _warned.add(reason);
  logger.warn({ event: "email.config_guard", reason, ...payload }, msg);
}

/**
 * Log a LOUD, explicit warning when the email transport is misconfigured.
 *
 * Does NOT throw — sends should still be attempted (so the existing error/no-op
 * paths stay intact); the point is to make the silent failure visible. Pass the
 * resolved `from` address actually used for the send.
 *
 * @returns the resolved `from` (unchanged) for convenient inline use.
 */
export function assertSendableEmailConfig(from: string | null | undefined): string | null | undefined {
  if (!process.env.RESEND_API_KEY) {
    warnOnce(
      "missing_api_key",
      {},
      "RESEND_API_KEY is not set — outbound email will NOT be delivered. Set RESEND_API_KEY in the environment.",
    );
  }

  if (isSandboxFrom(from)) {
    warnOnce(
      "sandbox_from",
      { from },
      "EMAIL_FROM resolves to the Resend SANDBOX domain (*.resend.dev). Resend accepts these sends but ONLY delivers them to the Resend account owner — real recipients receive NOTHING with no error. Verify your sending domain in Resend and set EMAIL_FROM to a verified address (e.g. notifications@repulabs.com).",
    );
  }

  return from;
}
