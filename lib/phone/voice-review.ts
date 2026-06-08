/**
 * Voice → Review funnel (Module 15 — the unique differentiator).
 *
 * "You are the only tool that can convert a phone call into a Google review with
 *  zero human effort." When the AI receptionist RESOLVES a call (answers a
 * question, books an appointment), this hook enqueues a review request to that
 * caller a few hours later — through the SAME outreach engine the rest of the
 * product uses, fully consent- and dedupe-guarded.
 *
 * Invoked from `app/api/voice/status/route.ts` (the Twilio status callback) when
 * a call reaches a terminal success. It MUST NEVER throw or block the webhook's
 * 200 (Twilio retries on non-200 → double processing), so every path returns a
 * structured `{ enqueued, reason }` and the caller wraps it in `.catch`.
 *
 * Guards (all must pass to enqueue):
 *   - call status === "completed" AND durationSeconds >= MIN_RESOLVE_SECONDS
 *   - intent is a positive/neutral resolution (booking/pricing/hours/general),
 *     never "complaint" (those go to a human, not a review ask)
 *   - a usable contact: leadPhone (E.164) or leadEmail
 *   - the org's Voice→Review toggle is on (AutopilotConfig.voiceToReviewEnabled);
 *     fail-safe ON when no config row yet (the feature is opt-out per-org)
 *   - NOT unsubscribed; SMS only when consent is on, else PREFER email
 *   - dedupe: no prior voice review request for this recipient within DEDUPE_DAYS
 *
 * Delivery rides the durable, already-wired path: `enqueueReviewRequest` creates
 * a `scheduled` ReviewRequest the per-minute `dispatch-review-requests` cron
 * sends at `scheduledFor`. (The Scheduler `scheduled_request` kind is still a
 * foundation no-op stub in this build, so we do NOT route through it.)
 */

import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { enqueueReviewRequest } from "@/lib/outreach/enqueue";
import { hasSmsConsent, isUnsubscribed } from "@/lib/outreach/suppression";
import { recordAutopilotAction } from "@/lib/autopilot/ledger";

/** Minimum call length (seconds) to count as a genuine resolution, not a hangup. */
export const MIN_RESOLVE_SECONDS = 20;
/** Don't ask the same caller for a review twice within this window. */
export const DEDUPE_DAYS = 30;

const PHONE_RE = /^\+[1-9][0-9]{1,14}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Intents that are NOT a positive resolution — never trigger a review ask. */
const NEGATIVE_INTENTS = new Set(["complaint", "complaints", "cancel", "cancellation", "refund"]);

function delayHours(): number {
  const raw = Number(process.env.VOICE_REVIEW_DELAY_HOURS);
  return Number.isFinite(raw) && raw >= 0 && raw <= 168 ? raw : 3;
}

/** Postgres "relation/column does not exist" → table not migrated. */
function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  if (code === "P2021" || code === "P2022" || code === "42P01" || code === "42703") return true;
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("42P01") || msg.includes("42703");
}

export type VoiceReviewResult = { enqueued: boolean; reason?: string };

/**
 * Maybe enqueue a Voice→Review request for a resolved call. Best-effort: returns
 * a structured result and never throws (the catch-all at the end guarantees it).
 */
export async function maybeEnqueueVoiceReview(args: {
  orgId: string;
  callId: string;
}): Promise<VoiceReviewResult> {
  const { orgId, callId } = args;
  try {
    // ---- Load the call + the Voice→Review toggle in one tenant tx ----
    const loaded = await withTenant(orgId, async (tx) => {
      const call = await tx.phoneCall.findFirst({
        where: { id: callId },
        select: {
          id: true,
          status: true,
          durationSeconds: true,
          intent: true,
          leadPhone: true,
          leadEmail: true,
          leadName: true,
          fromE164: true,
          phoneNumberId: true,
        },
      });
      if (!call) return { call: null as null };

      // Toggle: read AutopilotConfig.voiceToReviewEnabled. Fail-safe ON when the
      // table isn't migrated or there's no row (opt-out feature).
      let voiceEnabled = true;
      try {
        const cfg = await tx.autopilotConfig.findUnique({
          where: { organizationId: orgId },
          select: { voiceToReviewEnabled: true },
        });
        if (cfg) voiceEnabled = cfg.voiceToReviewEnabled;
      } catch (err) {
        if (!isMissingRelation(err)) throw err;
        // table not migrated → default on
      }

      // Resolve the establishment: the called number's establishment, else the
      // org's primary (oldest non-deleted) establishment.
      let establishmentId: string | null = null;
      if (call.phoneNumberId) {
        const pn = await tx.phoneNumber.findFirst({
          where: { id: call.phoneNumberId },
          select: { establishmentId: true },
        });
        establishmentId = pn?.establishmentId ?? null;
      }
      if (!establishmentId) {
        const primary = await tx.establishment.findFirst({
          where: { deletedAt: null },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        });
        establishmentId = primary?.id ?? null;
      }

      return { call, voiceEnabled, establishmentId };
    });

    if (!loaded.call) return skip(orgId, callId, "call_not_found");
    const { call, voiceEnabled, establishmentId } = loaded;

    if (!voiceEnabled) return skip(orgId, callId, "voice_review_disabled");

    // ---- Resolution guards ----
    if (call.status !== "completed") return skip(orgId, callId, "not_completed");
    const duration = call.durationSeconds ?? 0;
    if (duration < MIN_RESOLVE_SECONDS) return skip(orgId, callId, "too_short");

    const intent = (call.intent ?? "").trim().toLowerCase();
    if (intent && NEGATIVE_INTENTS.has(intent)) return skip(orgId, callId, "negative_intent");

    if (!establishmentId) return skip(orgId, callId, "no_establishment");

    // ---- Choose channel + recipient (prefer SMS w/ consent, else email) ----
    const phone = (call.leadPhone ?? "").trim();
    const email = (call.leadEmail ?? "").trim();
    const hasPhone = PHONE_RE.test(phone);
    const hasEmail = EMAIL_RE.test(email);
    if (!hasPhone && !hasEmail) return skip(orgId, callId, "no_contact");

    let channel: "sms" | "email" | null = null;
    let recipient = "";
    if (hasPhone) {
      const consent = await hasSmsConsent({ organizationId: orgId, phoneE164: phone });
      if (consent && !(await isUnsubscribed({ channel: "sms", recipient: phone, organizationId: orgId }))) {
        channel = "sms";
        recipient = phone;
      }
    }
    if (!channel && hasEmail) {
      if (!(await isUnsubscribed({ channel: "email", recipient: email, organizationId: orgId }))) {
        channel = "email";
        recipient = email;
      }
    }
    if (!channel) return skip(orgId, callId, "no_consented_channel");

    // ---- Dedupe: a prior voice review request for this recipient recently? ----
    const since = new Date(Date.now() - DEDUPE_DAYS * 24 * 60 * 60 * 1000);
    const dup = await withTenant(orgId, (tx) =>
      tx.reviewRequest.findFirst({
        where: { recipient, triggerSource: "voice_call", createdAt: { gte: since } },
        select: { id: true },
      }),
    );
    if (dup) return skip(orgId, callId, "duplicate");

    // ---- Enqueue via the shared seam (scheduled, cron-dispatched) ----
    const result = await enqueueReviewRequest({
      orgId,
      establishmentId,
      channel,
      recipient,
      recipientName: call.leadName ?? null,
      triggerSource: "voice_call",
      delayHours: delayHours(),
    });

    if (!result.ok) {
      logger.info(
        { orgId, callId, reason: result.reason, event: "voice.review.enqueue.skipped" },
        "voice→review not enqueued",
      );
      return { enqueued: false, reason: result.reason };
    }

    // Best-effort ledger write (never blocks).
    await recordAutopilotAction({
      orgId,
      loop: "voice_review",
      action: "scheduled_request",
      resourceType: "review_request",
      resourceId: result.reviewRequestId,
      status: result.status === "failed" ? "failed" : "done",
      detail: { callId, channel, delayHours: delayHours() },
    });

    logger.info(
      { orgId, callId, channel, reviewRequestId: result.reviewRequestId, event: "voice.review.enqueue.ok" },
      "voice→review request enqueued",
    );
    return { enqueued: true };
  } catch (err) {
    // Absolute guarantee: never throw into the Twilio webhook.
    logger.error(
      { orgId, callId, event: "voice.review.enqueue.error", error: err instanceof Error ? err.message : String(err) },
      "voice→review hook failed (swallowed)",
    );
    return { enqueued: false, reason: "error" };
  }
}

function skip(orgId: string, callId: string, reason: string): VoiceReviewResult {
  logger.info({ orgId, callId, reason, event: "voice.review.enqueue.skipped" }, "voice→review skipped");
  return { enqueued: false, reason };
}
