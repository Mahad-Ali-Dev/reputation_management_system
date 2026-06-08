import type { Prisma } from "@prisma/client";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { classifyContent } from "./classify";
import {
  type ModerationConfig,
  type ModerationDecision,
  evaluateRules,
  getModerationConfig,
  isMissingRelation,
  loadKeywordRules,
} from "./rules";

/**
 * Moderation QUEUE (Module 09 — Inbox, Wave 3c-A).
 *
 * The `ModerationItem` model is the moderation queue. This module:
 *   - `evaluateInbound(...)` — the engine entrypoint: classify + apply rules,
 *     and when the decision is hide/flag, enqueue a `ModerationItem` (and, for an
 *     auto-hide keyword match, flip the SOURCE SocialComment's status to "hidden"
 *     + bump CommentBlacklist.hiddenCount). FB/IG/webchat ONLY — never google.
 *   - `listModerationQueue(...)` — read the queue for the panel.
 *   - `resolveModerationItem(...)` — approve / hide / reply a queued item.
 *
 * EVERYTHING fail-softs on a not-yet-migrated `moderation_items` table (42P01)
 * so deploying this code before the founder runs the SQL migration can never
 * 500 the inbox — the queue simply reads/writes as empty.
 */

/** Sources the queue accepts. `google` is deliberately absent (contract). */
export const MODERATION_SOURCES = ["facebook", "instagram", "webchat"] as const;
export type ModerationSource = (typeof MODERATION_SOURCES)[number];

export type ModerationSourceType = "comment" | "dm" | "chat_message";

export type EvaluateInboundInput = {
  orgId: string;
  source: ModerationSource;
  sourceType: ModerationSourceType;
  /** PK of the source row (SocialComment.id / InboxMessage.id). */
  sourceId: string;
  externalId?: string | null;
  authorName?: string | null;
  body: string;
};

export type EvaluateInboundResult = {
  /** "skipped" when source not allow-listed or body empty / rules allow. */
  outcome: "enqueued" | "skipped";
  decision: ModerationDecision;
  confidence: number;
  /** The created ModerationItem id, when one was enqueued. */
  itemId: string | null;
  /** True when the source row was auto-hidden. */
  sourceHidden: boolean;
};

/** Map a queue source → the SocialComment.platform value used in the source row. */
function platformForSource(source: ModerationSource): string | null {
  if (source === "facebook") return "facebook";
  if (source === "instagram") return "instagram";
  return null; // webchat has no SocialComment row
}

/**
 * Engine entrypoint. Classifies the content, applies rules, and persists a
 * queue item + (for keyword/profanity auto-hide) hides the source. Pre-loaded
 * `config`/`blacklist` may be passed to batch (the rescan cron loads once per
 * org); otherwise they're loaded here.
 *
 * NEVER throws on a missing table — returns `{ outcome: "skipped" }`.
 */
export async function evaluateInbound(
  input: EvaluateInboundInput,
  preloaded?: { config: ModerationConfig; blacklist: { keyword: string; matchMode: string }[] },
): Promise<EvaluateInboundResult> {
  const skip = (decision: ModerationDecision, confidence = 0): EvaluateInboundResult => ({
    outcome: "skipped",
    decision,
    confidence,
    itemId: null,
    sourceHidden: false,
  });

  // Google-exclusion contract: refuse anything not on the allow-list.
  if (!MODERATION_SOURCES.includes(input.source)) {
    logger.warn({
      orgId: input.orgId,
      source: input.source,
      event: "moderation.evaluate.source_rejected",
    });
    return skip({ action: "allow", reason: "none", matchedKeyword: null });
  }
  if (!input.body?.trim()) {
    return skip({ action: "allow", reason: "none", matchedKeyword: null });
  }

  const config = preloaded?.config ?? (await getModerationConfig(input.orgId));
  const blacklist = preloaded?.blacklist ?? (await loadKeywordRules(input.orgId));

  // Score once. classifyContent is env-safe + never throws.
  const classified = await classifyContent({ orgId: input.orgId, body: input.body });
  const decision = evaluateRules(config, blacklist, input.body, classified.confidence);

  if (decision.action === "allow") return skip(decision, classified.confidence);

  const reason = decision.reason === "none" ? "negativity" : decision.reason;
  const suggestedAction = decision.action === "hide" ? "hide" : "review";

  try {
    const { itemId, sourceHidden } = await withTenant(input.orgId, async (tx) => {
      const created = await tx.moderationItem.create({
        data: {
          organizationId: input.orgId,
          source: input.source,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          externalId: input.externalId ?? null,
          authorName: input.authorName ?? null,
          body: input.body.slice(0, 4000),
          reason,
          matchedKeyword: decision.matchedKeyword,
          aiConfidence: toDecimal(classified.confidence),
          suggestedAction,
          status: "pending",
        },
        select: { id: true },
      });

      let hid = false;
      // Auto-hide path: ONLY for explicit keyword/profanity matches (action hide).
      if (decision.action === "hide") {
        const platform = platformForSource(input.source);
        if (platform && input.sourceType === "comment") {
          await tx.socialComment
            .update({ where: { id: input.sourceId }, data: { status: "hidden" } })
            .then(() => {
              hid = true;
            })
            .catch(() => {
              /* source row may not exist (webchat / already gone) — ignore */
            });
        }
        // Bump the keyword's hidden counter when a user keyword matched.
        if (decision.reason === "keyword" && decision.matchedKeyword) {
          await tx.commentBlacklist
            .updateMany({
              where: { keyword: decision.matchedKeyword.toLowerCase(), isActive: true },
              data: { hiddenCount: { increment: 1 } },
            })
            .catch(() => undefined);
        }
      }

      return { itemId: created.id, sourceHidden: hid };
    });

    logger.info({
      orgId: input.orgId,
      event: "moderation.evaluate.enqueued",
      reason,
      action: decision.action,
      confidence: classified.confidence,
    });

    return { outcome: "enqueued", decision, confidence: classified.confidence, itemId, sourceHidden };
  } catch (err) {
    if (isMissingRelation(err)) {
      // moderation_items not migrated yet — degrade to no-op.
      return skip(decision, classified.confidence);
    }
    logger.warn({
      orgId: input.orgId,
      event: "moderation.evaluate.enqueue_failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return skip(decision, classified.confidence);
  }
}

export type QueueItem = {
  id: string;
  source: string;
  sourceType: string;
  sourceId: string;
  authorName: string | null;
  body: string;
  reason: string;
  matchedKeyword: string | null;
  aiConfidence: number | null;
  suggestedAction: string;
  status: string;
  createdAt: Date;
};

/** Read the moderation queue. Fail-soft → [] when not migrated. */
export async function listModerationQueue(args: {
  orgId: string;
  status?: string;
  take?: number;
}): Promise<QueueItem[]> {
  const { orgId, status, take = 100 } = args;
  try {
    const rows = await withTenant(orgId, async (tx) =>
      tx.moderationItem.findMany({
        where: status && status !== "all" ? { status } : {},
        orderBy: { createdAt: "desc" },
        take,
      }),
    );
    return rows.map(serializeItem);
  } catch (err) {
    if (isMissingRelation(err)) return [];
    logger.warn({
      orgId,
      event: "moderation.queue.list_failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/** Status counts for the queue filter chips. Fail-soft → {}. */
export async function moderationQueueCounts(orgId: string): Promise<Record<string, number>> {
  try {
    const grouped = await withTenant(orgId, async (tx) =>
      tx.moderationItem.groupBy({ by: ["status"], _count: true }),
    );
    const out: Record<string, number> = {};
    for (const g of grouped) out[g.status] = g._count;
    return out;
  } catch (err) {
    if (!isMissingRelation(err)) {
      logger.warn({ orgId, event: "moderation.queue.counts_failed" });
    }
    return {};
  }
}

export type ResolveAction = "approve" | "hide" | "reply";

/**
 * Resolve a queued item.
 *   - approve → status "approved"; if the source was auto-hidden, UN-hide it
 *     (restore the SocialComment to needs_reply / live).
 *   - hide    → status "hidden"; hide the source SocialComment (status "hidden").
 *   - reply   → status "replied" (the actual reply is drafted in Comments/
 *               Conversations; this just clears the item from the queue).
 *
 * `userId` is recorded as resolvedByUserId. Tenant-scoped + fail-soft.
 */
export async function resolveModerationItem(args: {
  orgId: string;
  itemId: string;
  action: ResolveAction;
  userId?: string | null;
}): Promise<{ ok: boolean }> {
  const { orgId, itemId, action, userId } = args;
  const statusMap: Record<ResolveAction, string> = {
    approve: "approved",
    hide: "hidden",
    reply: "replied",
  };
  try {
    await withTenant(orgId, async (tx) => {
      const item = await tx.moderationItem.findUnique({ where: { id: itemId } });
      if (!item) return;

      await tx.moderationItem.update({
        where: { id: itemId },
        data: {
          status: statusMap[action],
          resolvedByUserId: userId ?? null,
          resolvedAt: new Date(),
        },
      });

      // Mirror the decision onto the source SocialComment when there is one.
      const isComment = item.sourceType === "comment";
      const hasSource = item.source === "facebook" || item.source === "instagram";
      if (isComment && hasSource) {
        if (action === "hide") {
          await tx.socialComment
            .update({ where: { id: item.sourceId }, data: { status: "hidden" } })
            .catch(() => undefined);
        } else if (action === "approve") {
          // Un-hide → back to needs_reply (the safe, actionable default).
          await tx.socialComment
            .update({ where: { id: item.sourceId }, data: { status: "needs_reply" } })
            .catch(() => undefined);
        }
      }
    });
    return { ok: true };
  } catch (err) {
    if (isMissingRelation(err)) return { ok: false };
    logger.warn({
      orgId,
      event: "moderation.queue.resolve_failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false };
  }
}

/** Bulk resolve — used by the panel's "approve all" / "hide all" actions. */
export async function bulkResolveModerationItems(args: {
  orgId: string;
  itemIds: string[];
  action: ResolveAction;
  userId?: string | null;
}): Promise<{ resolved: number }> {
  let resolved = 0;
  for (const itemId of args.itemIds) {
    const res = await resolveModerationItem({
      orgId: args.orgId,
      itemId,
      action: args.action,
      userId: args.userId,
    });
    if (res.ok) resolved++;
  }
  return { resolved };
}

function serializeItem(row: {
  id: string;
  source: string;
  sourceType: string;
  sourceId: string;
  authorName: string | null;
  body: string;
  reason: string;
  matchedKeyword: string | null;
  aiConfidence: Prisma.Decimal | null;
  suggestedAction: string;
  status: string;
  createdAt: Date;
}): QueueItem {
  return {
    id: row.id,
    source: row.source,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    authorName: row.authorName,
    body: row.body,
    reason: row.reason,
    matchedKeyword: row.matchedKeyword,
    aiConfidence: row.aiConfidence == null ? null : Number(row.aiConfidence),
    suggestedAction: row.suggestedAction,
    status: row.status,
    createdAt: row.createdAt,
  };
}

/** Decimal(3,2)-safe — Prisma accepts number|string|Decimal; pass a string. */
function toDecimal(n: number): string {
  return Math.max(0, Math.min(1, n)).toFixed(2);
}
