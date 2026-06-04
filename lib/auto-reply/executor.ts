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
import { isOrgEntitled } from "@/lib/billing/entitlements";
import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { pickRule } from "./match";

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

  // Auto-publish gets disabled by ANY classifier flag. Drafts always stay
  // pending_review regardless — they go through the same approve gate as
  // human-triggered drafts.
  const willAutoPublish = rule.action === "auto_publish_after_delay" && !blocked;
  const autoPublishAt = willAutoPublish
    ? new Date(Date.now() + Math.max(0, rule.delayMinutes) * 60_000)
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
    const reply = await tx.reviewReply.create({
      data: {
        reviewId,
        organizationId,
        body: gen.body,
        // Always pending_review — even auto-publish flow lands here first.
        // The publish cron promotes to `published` after `autoPublishAt`.
        status: "pending_review",
        // Durably record a safety-classifier block with a prefix the publish
        // cron's `startsWith("auto_reply:")` filter EXCLUDES. Without this the
        // block was only logged, so the cron would still auto-publish a flagged
        // reply after the delay. A blocked draft can now go live ONLY via
        // manual human approval (which publishes by reviewId, prefix-agnostic).
        generatedBy: blocked ? `auto_reply_blocked:${rule.id}` : `auto_reply:${rule.id}`,
      },
    });
    // Bump rule audit counters in the same tx. Cheap, and useful for the
    // "this rule has fired 27 times this month" line in the UI.
    await tx.autoReplyRule.update({
      where: { id: rule.id },
      data: {
        fireCount: { increment: 1 },
        lastFiredAt: new Date(),
      },
    });
    // We don't have a `scheduled_publish_at` column on review_replies yet,
    // so for now the publish-cron infers the window from generatedBy + an
    // auto_reply_rules look-up. Wiring is in lib/auto-reply/publish-due.ts.
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
 * The publish-due sweep. Called by an hourly cron. Picks up any
 * auto-publish ReviewReply rows whose window has elapsed and publishes
 * them. We deliberately keep the lookup window narrow (last 7 days) so
 * a stale rule from a month ago can't get auto-published if the host
 * re-enables it.
 *
 * Exported separately so the cron handler doesn't need to know about
 * the rule machinery — it just calls `publishDueAutoReplies()`.
 */
export async function publishDueAutoReplies(): Promise<{ promoted: number; skipped: number }> {
  // Stage 1: get candidate replies. We hit the unscoped prisma client
  // because the cron runs across all tenants. Each downstream write is
  // gated by withTenant(orgId).
  const cutoffEarliest = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const cutoffLatest = new Date(Date.now()); // anything created up to now

  const candidates = await prisma.reviewReply.findMany({
    where: {
      status: "pending_review",
      generatedBy: { startsWith: "auto_reply:" },
      createdAt: { gte: cutoffEarliest, lte: cutoffLatest },
      publishedAt: null,
    },
    select: {
      id: true,
      organizationId: true,
      reviewId: true,
      generatedBy: true,
      createdAt: true,
    },
    take: 500,
  });

  let promoted = 0;
  let skipped = 0;
  for (const c of candidates) {
    // generatedBy format: "auto_reply:<rule_uuid>"
    const ruleId = c.generatedBy?.replace(/^auto_reply:/, "") ?? null;
    if (!ruleId) {
      skipped++;
      continue;
    }
    const rule = await prisma.autoReplyRule.findUnique({
      where: { id: ruleId },
      select: {
        action: true,
        delayMinutes: true,
        organizationId: true,
        enabled: true,
      },
    });
    if (!rule || !rule.enabled || rule.action !== "auto_publish_after_delay") {
      skipped++;
      continue;
    }
    // Defense-in-depth: only publish if rule still belongs to the org on
    // the reply. Prevents a rule's organizationId getting orphaned and the
    // publish leaking cross-tenant.
    if (rule.organizationId !== c.organizationId) {
      skipped++;
      continue;
    }
    const dueAt = new Date(c.createdAt.getTime() + rule.delayMinutes * 60_000);
    if (dueAt > new Date()) {
      skipped++;
      continue;
    }
    // It's due — hand off to the standard publish flow.
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
    "auto-publish cron batch complete",
  );
  return { promoted, skipped };
}
