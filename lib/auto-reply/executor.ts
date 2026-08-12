/**
 * Auto-reply executor — runs after a Review is ingested. Picks the first
 * matching rule for the review's org (and optionally listing), generates an
 * AI draft, and persists a ReviewReply row in either:
 *
 *   - draft_only                → status='pending_review' (host approves before publish)
 *   - auto_publish_after_delay  → status='pending_review' + scheduledPublishAt
 *                                 (host has `delay_minutes` to cancel)
 *
 * The "auto-publish" arm INTENTIONALLY stages at `pending_review` instead of
 * `draft` so the host gets the standard approve/edit UI. The `delay_minutes`
 * window is enforced by the publish cron, not by a setTimeout (server
 * processes restart; setTimeout doesn't survive). If the host doesn't
 * cancel within the window, the publish-cron picks it up and pushes live.
 *
 * Safety:
 *   - We re-run the existing safety classifier on every AI draft. If the
 *     classifier blocks, we DOWNGRADE auto_publish to draft-only — the
 *     host has to look at it. This stops a malicious review body from
 *     coercing the AI into auto-publishing something embarrassing.
 *   - The classifier blocks AND the rule was auto-publish? We log a
 *     `auto_reply.safety_blocked_autopublish` warn so the host can audit.
 *
 * Re-entrancy:
 *   - If a ReviewReply ALREADY exists for this review (human drafted, or
 *     the executor already fired), we bail out. Same review never gets
 *     two AI drafts from us — the host's manual draft is sacred.
 *
 * Tenant isolation:
 *   - Every DB write goes through `withTenant(orgId, …)`. The AI message
 *     row also lands tenant-scoped via `generateReply`'s own withTenant.
 */

import { generateReply } from "@/lib/ai/generate-reply";
import { classifyReplySafety } from "@/lib/ai/safety-classify";
import { recordAutopilotAction } from "@/lib/autopilot/ledger";
import { resolveAutopilotPolicy, shouldAutoAct } from "@/lib/autopilot/policy";
import { isOrgEntitled } from "@/lib/billing/entitlements";
import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import type { Prisma } from "@prisma/client";
import { pickRule } from "./match";
import { fixedScheduledPublishAt, nextScheduledPublishAt, usesRandomizedWindow } from "./schedule";

type BrandVoiceJson = {
  tone?: string[];
  banned_words?: string[];
  required_signature?: string;
  example_replies?: Array<{ rating: number; body: string }>;
  persona?: string;
  language?: string;
} | null;

export interface ExecuteAutoReplyInput {
  reviewId: string;
  organizationId: string;
  establishmentId: string;
}

export type ExecuteAutoReplyResult =
  | {
      ran: false;
      reason: "no_matching_rule" | "reply_already_exists" | "review_missing" | "plan_inactive";
    }
  | {
      ran: true;
      ruleId: string;
      replyId: string;
      finalStatus: "pending_review";
      autoPublishAt: Date | null;
      safetyBlocked: boolean;
    };

/**
 * Public entry point. Designed to be called fire-and-forget from the
 * ingest pipeline; the caller never awaits the result. We swallow errors
 * inside this function so a misbehaving rule (e.g., a deleted establishment
 * row) can't crash the ingest path.
 */
export async function executeAutoReplyRules(
  input: ExecuteAutoReplyInput,
): Promise<ExecuteAutoReplyResult> {
  try {
    return await runExecutor(input);
  } catch (err) {
    logger.error(
      {
        err: err instanceof Error ? err.message : String(err),
        reviewId: input.reviewId,
        organizationId: input.organizationId,
        event: "auto_reply.executor.unhandled",
      },
      "auto-reply executor crashed; swallowing to protect ingest",
    );
    return { ran: false, reason: "review_missing" };
  }
}

async function runExecutor(input: ExecuteAutoReplyInput): Promise<ExecuteAutoReplyResult> {
  const { reviewId, organizationId, establishmentId } = input;

  // Load: the review (with reply state to short-circuit), the establishment
  // (for brand voice), and any matching rules. All in one tenant tx.
  const ctx = await withTenant(organizationId, async (tx) => {
    const [review, rules] = await Promise.all([
      tx.review.findFirst({
        where: { id: reviewId },
        select: {
          id: true,
          rating: true,
          body: true,
          source: true,
          reviewerName: true,
          reply: { select: { id: true } },
          establishment: {
            select: { id: true, name: true, brandVoice: true },
          },
        },
      }),
      // Pull both establishment-specific rules AND org-wide rules in one
      // query, ordered creation-time ASC so the first-match-wins semantics
      // are deterministic.
      tx.autoReplyRule.findMany({
        where: {
          enabled: true,
          OR: [
            { establishmentId },
            { establishmentId: null }, // org-wide rules
          ],
        },
        orderBy: [
          // Listing-specific rules trump org-wide. Using a CASE-ish trick
          // via two sorts: NULLS LAST on establishmentId then by createdAt.
          { establishmentId: { sort: "asc", nulls: "last" } },
          { createdAt: "asc" },
        ],
      }),
    ]);
    return { review, rules };
  });

  if (!ctx.review) {
    return { ran: false, reason: "review_missing" };
  }
  if (ctx.review.reply) {
    // Either a human already drafted, or we already fired. Never overwrite.
    return { ran: false, reason: "reply_already_exists" };
  }

  // Auto-reply generation spends AI budget — a paid feature. Skip silently for
  // orgs without an active plan (lapsed / free / expired trial).
  if (!(await isOrgEntitled(organizationId))) {
    return { ran: false, reason: "plan_inactive" };
  }

  const rule = pickRule(
    {
      rating: ctx.review.rating,
      body: ctx.review.body,
      source: ctx.review.source,
    },
    ctx.rules,
  );
  if (!rule) {
    return { ran: false, reason: "no_matching_rule" };
  }

  // ---- Generate ----
  const gen = await generateReply({
    orgId: organizationId,
    review: {
      id: ctx.review.id,
      rating: ctx.review.rating,
      body: ctx.review.body,
      reviewerName: ctx.review.reviewerName,
    },
    establishment: {
      id: ctx.review.establishment.id,
      name: ctx.review.establishment.name,
      brandVoice: applyToneOverride(
        ctx.review.establishment.brandVoice as BrandVoiceJson,
        rule.replyTone,
      ),
    },
  });

  // ---- Safety classify ----
  const { blocked } = await classifyReplySafety({
    orgId: organizationId,
    aiMessageId: gen.aiMessageId,
    candidate: gen.body,
    sourceReview: {
      rating: ctx.review.rating,
      body: ctx.review.body,
      reviewerName: ctx.review.reviewerName,
    },
  });

  // ---- Reputation Autopilot policy ----
  // The Autopilot page's master switch, risk tolerance and 5★ toggle used to
  // gate NOTHING: `shouldAutoAct` and `resolveAutopilotPolicy` were written but
  // never called, so those controls saved to the DB and changed no behaviour.
  // This is the seam that makes them real.
  //
  // The decision the owner chose: auto-publish 5★, DRAFT everything else — so a
  // 1-4★ reply is never published without a human reading it. `shouldAutoAct`
  // already encodes exactly that (rating < 5 → draft; 5★ → auto only when the
  // toggle is on, risk isn't conservative, and confidence clears the floor).
  const policy = await resolveAutopilotPolicy(organizationId);
  const decision = shouldAutoAct(policy, "auto_reply", {
    rating: ctx.review.rating,
    confidence: gen.confidence ?? null,
    blocked,
  });

  // Auto-publish gets disabled by ANY classifier flag. Drafts always stay
  // pending_review regardless — they go through the same approve gate as
  // human-triggered drafts. Autopilot is an ADDITIONAL gate on top of the
  // rule's own action: the rule may say "auto publish", but if Autopilot is off
  // (or conservative, or the review isn't 5★) it still lands as a draft.
  const willAutoPublish =
    rule.action === "auto_publish_after_delay" && !blocked && decision === "auto";
  // Durable post time. Rules opting into the randomized window (the managed 5★
  // toggle, delayMinutes = sentinel) spread across 2–4h so the cadence reads as
  // human; legacy fixed-delay rules keep their exact `delayMinutes` offset.
  const autoPublishAt = willAutoPublish
    ? usesRandomizedWindow(rule.delayMinutes)
      ? nextScheduledPublishAt()
      : fixedScheduledPublishAt(rule.delayMinutes)
    : null;

  // `reviewId` from the input is the same as ctx.review.id (we looked it
  // up by primary key). We use the destructured `reviewId` from the top of
  // the function for the closure below, which sidesteps the "TS narrowing
  // doesn't cross function boundaries" gotcha that requires a non-null
  // assertion on ctx.review inside withTenant.

  // ---- Persist ----
  const persisted = await withTenant(organizationId, async (tx) => {
    // Double-check no concurrent writer beat us to it. The unique constraint
    // on `review_replies.review_id` would surface as a 23505 anyway, but
    // catching it here lets us log the race rather than throw upstream.
    const existing = await tx.reviewReply.findUnique({
      where: { reviewId },
      select: { id: true },
    });
    if (existing) {
      return { replyId: existing.id, raceLost: true };
    }
    const baseData = {
      reviewId,
      organizationId,
      body: gen.body,
      // Always pending_review — even auto-publish flow lands here first.
      // The publish cron promotes to `published` after `scheduledPublishAt`.
      status: "pending_review",
      // Durably record a safety-classifier block with a prefix the publish
      // cron's `startsWith("auto_reply:")` filter EXCLUDES. Without this the
      // block was only logged, so the cron would still auto-publish a flagged
      // reply after the delay. A blocked draft can now go live ONLY via
      // manual human approval (which publishes by reviewId, prefix-agnostic).
      generatedBy: blocked ? `auto_reply_blocked:${rule.id}` : `auto_reply:${rule.id}`,
    };
    // The durable randomized/fixed post time lives in `scheduledPublishAt`; the
    // publish cron drains by it. Pre-migration safety: if the live DB hasn't
    // gained the column yet (42703), retry without it — the cron's derived-
    // window fallback still picks the reply up. NULL for draft-only rules.
    const reply = await createReplyWithSchedule(tx, baseData, autoPublishAt);
    // Bump rule audit counters in the same tx. Cheap, and useful for the
    // "this rule has fired 27 times this month" line in the UI.
    await tx.autoReplyRule.update({
      where: { id: rule.id },
      data: {
        fireCount: { increment: 1 },
        lastFiredAt: new Date(),
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId,
        actorType: "system",
        // System events have no human actor — convention in this codebase
        // is to set actorId to the orgId so the row still satisfies the
        // NOT NULL constraint while remaining clearly system-attributable
        // (actorType disambiguates).
        actorId: organizationId,
        action: "review.reply.auto_drafted",
        resourceType: "review",
        resourceId: reviewId,
        afterData: {
          ruleId: rule.id,
          ruleName: rule.name,
          ruleAction: rule.action,
          model: gen.model,
          safetyBlocked: blocked,
          autoPublishAt: autoPublishAt?.toISOString() ?? null,
        },
      },
    });
    return { replyId: reply.id, raceLost: false };
  });

  if (persisted.raceLost) {
    logger.warn(
      {
        organizationId,
        reviewId: ctx.review.id,
        ruleId: rule.id,
        event: "auto_reply.race_lost",
      },
      "another writer created the reply between match and persist",
    );
    return { ran: false, reason: "reply_already_exists" };
  }

  if (blocked && rule.action === "auto_publish_after_delay") {
    logger.warn(
      {
        organizationId,
        reviewId: ctx.review.id,
        ruleId: rule.id,
        event: "auto_reply.safety_blocked_autopublish",
      },
      "rule wanted to auto-publish but safety classifier blocked — downgraded to manual approve",
    );
  }

  // Ledger entry — this is what fills the Autopilot "Activity" feed. Before
  // this, `recordAutopilotAction` was called from exactly ONE place
  // (lib/phone/voice-review.ts), so with Voice→Review removed the feed could
  // never populate at all and always read "0 recent actions".
  //
  // A low-star draft is logged under its own loop so "Needs you" can surface
  // the replies a human still has to approve.
  const isLowStar = typeof ctx.review.rating === "number" && ctx.review.rating < 5;
  await recordAutopilotAction({
    orgId: organizationId,
    loop: isLowStar ? "low_star_draft" : "auto_reply",
    action: willAutoPublish ? "published" : "drafted",
    resourceType: "review",
    resourceId: ctx.review.id,
    // A draft is work waiting on a person; an auto-publish is finished.
    requiresHuman: !willAutoPublish,
    detail: {
      rating: ctx.review.rating,
      ruleId: rule.id,
      decision,
      safetyBlocked: blocked,
      autoPublishAt: autoPublishAt?.toISOString() ?? null,
    },
  });

  logger.info(
    {
      organizationId,
      reviewId: ctx.review.id,
      ruleId: rule.id,
      action: rule.action,
      autoPublishAt: autoPublishAt?.toISOString() ?? null,
      safetyBlocked: blocked,
      model: gen.model,
      event: "auto_reply.drafted",
    },
    "auto-reply rule drafted a reply",
  );

  return {
    ran: true,
    ruleId: rule.id,
    replyId: persisted.replyId,
    finalStatus: "pending_review",
    autoPublishAt,
    safetyBlocked: blocked,
  };
}

/**
 * Per-rule tone override. The rule's `replyTone` enum maps to a small set
 * of tone keywords appended to the establishment's brand voice. We don't
 * REPLACE the brand voice — that would clobber persona/banned-words. We
 * just nudge `tone` so a host can say "use this listing's brand voice but
 * be EXTRA concise for ≤2★ reviews".
 *
 * Map (kept small on purpose — more options = more decision fatigue):
 *   - "concise"  → ["concise", "brief", "warm"]
 *   - "warm"     → ["warm", "professional"]   (= default brand voice fallback)
 *   - "detailed" → ["thorough", "empathetic", "professional"]
 */
function applyToneOverride(bv: BrandVoiceJson, toneKey: string): BrandVoiceJson {
  const overrides: Record<string, string[]> = {
    concise: ["concise", "brief", "warm"],
    warm: ["warm", "professional"],
    detailed: ["thorough", "empathetic", "professional"],
  };
  const tones = overrides[toneKey];
  if (!tones) return bv;
  return {
    ...(bv ?? {}),
    tone: tones,
  };
}

/**
 * The publish-due sweep. Called by the `auto-reply-publish` cron (every 5
 * minutes). Column-driven: it drains every reply whose durable
 * `scheduledPublishAt` has elapsed, regardless of HOW it got scheduled
 * (executor auto-publish OR a human-approved-then-scheduled reply from
 * `publishReply(..., postNow=false)`). Both converge here uniformly.
 *
 * Safety: the `auto_reply_blocked:` prefix is still EXCLUDED so a
 * safety-flagged draft never auto-posts (it can only go live via explicit
 * human approval). We confirm the reply is still `pending_review` and unposted
 * inside `publishReplyFromCron`.
 *
 * Pre-migration fallback: until the live DB gains `scheduled_publish_at`, the
 * column select throws Postgres 42703; we catch it and fall back to the legacy
 * derived-window drain (`createdAt + rule.delayMinutes`). Remove the fallback
 * once the migration has run.
 *
 * Exported separately so the cron handler just calls `publishDueAutoReplies()`.
 */
export async function publishDueAutoReplies(): Promise<{ promoted: number; skipped: number }> {
  try {
    return await drainByScheduledColumn();
  } catch (err) {
    if (isUndefinedColumn(err)) {
      logger.warn(
        { event: "auto_reply.cron.column_missing_fallback" },
        "scheduled_publish_at column not present yet; using derived-window drain",
      );
      return await drainByDerivedWindow();
    }
    throw err;
  }
}

/**
 * Column-driven drain. Selects replies whose randomized/fixed
 * `scheduledPublishAt` is due and hands each to the standard publish flow.
 */
async function drainByScheduledColumn(): Promise<{ promoted: number; skipped: number }> {
  const now = new Date();
  const candidates = await prisma.reviewReply.findMany({
    where: {
      status: "pending_review",
      publishedAt: null,
      scheduledPublishAt: { not: null, lte: now },
      // Exclude safety-blocked auto-drafts (prefix the executor set). Human
      // drafts (generatedBy = a model id), clean auto-drafts, and any NULL-
      // generatedBy scheduled reply all pass. The OR keeps NULLs included
      // (a bare `NOT startsWith` would drop them via SQL three-valued logic).
      OR: [{ generatedBy: null }, { generatedBy: { not: { startsWith: "auto_reply_blocked:" } } }],
    },
    select: { id: true, organizationId: true, reviewId: true },
    take: 500,
  });

  let promoted = 0;
  let skipped = 0;
  for (const c of candidates) {
    try {
      const { publishReplyFromCron } = await import("@/lib/reviews/actions-cron");
      const ok = await publishReplyFromCron(c.organizationId, c.reviewId);
      if (ok) promoted++;
      else skipped++;
    } catch (err) {
      skipped++;
      logger.error(
        {
          err: err instanceof Error ? err.message : String(err),
          replyId: c.id,
          event: "auto_reply.cron.publish_failed",
        },
        "auto-publish cron failed for one reply",
      );
    }
  }

  logger.info(
    { promoted, skipped, candidates: candidates.length, event: "auto_reply.cron.batch" },
    "auto-publish cron batch complete (column drain)",
  );
  return { promoted, skipped };
}

/**
 * Legacy derived-window drain (pre-migration fallback ONLY). Re-derives the
 * due time from `createdAt + rule.delayMinutes` via a per-row rule lookup.
 * Kept verbatim from the original implementation so behavior is unchanged for
 * orgs still on the un-migrated DB. Randomized-window rules (sentinel
 * delayMinutes) can't be expressed here, so they post immediately under the
 * fallback — acceptable for the brief migration window.
 */
async function drainByDerivedWindow(): Promise<{ promoted: number; skipped: number }> {
  const cutoffEarliest = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const cutoffLatest = new Date(Date.now());

  const candidates = await prisma.reviewReply.findMany({
    where: {
      status: "pending_review",
      generatedBy: { startsWith: "auto_reply:" },
      createdAt: { gte: cutoffEarliest, lte: cutoffLatest },
      publishedAt: null,
    },
    select: { id: true, organizationId: true, reviewId: true, generatedBy: true, createdAt: true },
    take: 500,
  });

  let promoted = 0;
  let skipped = 0;
  for (const c of candidates) {
    const ruleId = c.generatedBy?.replace(/^auto_reply:/, "") ?? null;
    if (!ruleId) {
      skipped++;
      continue;
    }
    const rule = await prisma.autoReplyRule.findUnique({
      where: { id: ruleId },
      select: { action: true, delayMinutes: true, organizationId: true, enabled: true },
    });
    if (!rule || !rule.enabled || rule.action !== "auto_publish_after_delay") {
      skipped++;
      continue;
    }
    if (rule.organizationId !== c.organizationId) {
      skipped++;
      continue;
    }
    // Sentinel (randomized) rules have no fixed offset; treat as due-now.
    const offsetMs = Math.max(0, rule.delayMinutes) * 60_000;
    const dueAt = new Date(c.createdAt.getTime() + offsetMs);
    if (dueAt > new Date()) {
      skipped++;
      continue;
    }
    try {
      const { publishReplyFromCron } = await import("@/lib/reviews/actions-cron");
      const ok = await publishReplyFromCron(c.organizationId, c.reviewId);
      if (ok) promoted++;
      else skipped++;
    } catch (err) {
      skipped++;
      logger.error(
        {
          err: err instanceof Error ? err.message : String(err),
          replyId: c.id,
          event: "auto_reply.cron.publish_failed",
        },
        "auto-publish cron failed for one reply (derived-window fallback)",
      );
    }
  }

  logger.info(
    { promoted, skipped, candidates: candidates.length, event: "auto_reply.cron.batch_fallback" },
    "auto-publish cron batch complete (derived-window fallback)",
  );
  return { promoted, skipped };
}

/**
 * Insert a ReviewReply, including `scheduledPublishAt` when set. Pre-migration
 * safety: if the column doesn't exist yet (42703), retry without it so the
 * executor never crashes the ingest path against an un-migrated DB.
 */
async function createReplyWithSchedule(
  tx: Prisma.TransactionClient,
  baseData: Prisma.ReviewReplyUncheckedCreateInput,
  scheduledPublishAt: Date | null,
): Promise<{ id: string }> {
  try {
    return await tx.reviewReply.create({
      data: { ...baseData, scheduledPublishAt },
      select: { id: true },
    });
  } catch (err) {
    if (isUndefinedColumn(err)) {
      logger.warn(
        { event: "auto_reply.persist.column_missing" },
        "scheduled_publish_at column not present yet; persisting reply without it",
      );
      return tx.reviewReply.create({ data: baseData, select: { id: true } });
    }
    throw err;
  }
}

/** Postgres `undefined_column` (42703) — the un-migrated `scheduled_publish_at`. */
function isUndefinedColumn(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "42703";
}
