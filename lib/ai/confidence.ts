/**
 * Shared confidence + knowledge-gap router (Module 05 — the highest-leverage piece).
 *
 * Every AI generation site (chatbot, review reply, inbox, etc.) calls
 * `recordConfidence(...)` after producing an answer. When the model's
 * confidence in that answer is below CONFIDENCE_GAP_THRESHOLD, the question is
 * routed into the per-tenant `knowledge_gaps` queue so the owner can teach the
 * AI the missing fact (see the Learning Monitor tab).
 *
 * Sites that don't return a real model confidence (e.g. review replies) use
 * `estimateReplyConfidence(text)` — a cheap hedging/uncertainty heuristic — so
 * they can still feed the same queue without a second model call.
 *
 * FAIL-SOFT: `knowledge_gaps` is created by a manual migration the founder runs
 * later (Wave-2 guardrail). Until then the table doesn't exist on Postgres. All
 * reads/writes here swallow Postgres "undefined_table" (42P01) /
 * "undefined_column" (42703) and treat the queue as empty so a gap-write never
 * 500s a chat turn or a reply generation.
 */

import { Prisma } from "@prisma/client";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";

/** Below this confidence, a generation is treated as a knowledge gap. */
export const CONFIDENCE_GAP_THRESHOLD = 0.7;

/** A duplicate question seen within this window increments hitCount instead of inserting. */
const DEDUP_WINDOW_DAYS = 30;

export type GapSource = "widget" | "review_reply" | "inbox" | "chat" | "owner_test";

/**
 * True for Postgres errors that mean "this table/column doesn't exist yet"
 * (the un-migrated KnowledgeGap window). Treated as soft-empty everywhere.
 */
export function isMissingRelationError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P2021 (table does not exist) / P2022 (column does not exist) are Prisma's
    // mapped codes; raw 42P01/42703 surface as P2010 with a meta.code.
    if (err.code === "P2021" || err.code === "P2022") return true;
    const pgCode = (err.meta as { code?: string } | undefined)?.code;
    if (pgCode === "42P01" || pgCode === "42703") return true;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("42P01") ||
    msg.includes("42703") ||
    msg.includes("does not exist") ||
    msg.includes("knowledge_gaps")
  );
}

/**
 * Normalize a question for dedup: lowercase, collapse whitespace, strip most
 * punctuation, trim, and cap length. Two phrasings of the same question should
 * collapse to the same key so hitCount aggregates instead of flooding.
 */
export function normalizeQuestion(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

/**
 * Heuristic confidence for generation sites that return no model score
 * (e.g. review replies). Conservative — only clearly hedging / empty / "I don't
 * know" answers fall below the 0.7 gap threshold; specific answers score high.
 */
export function estimateReplyConfidence(text: string): number {
  const t = (text ?? "").trim();
  if (t.length === 0) return 0;
  if (t.length < 15) return 0.5;

  const lower = t.toLowerCase();

  // STRONG uncertainty signals — the model is telling us it can't answer. Each
  // is a heavy penalty; one alone is enough to fall into the gap queue.
  const strong = [
    "i don't know",
    "i do not know",
    "i'm not sure",
    "i am not sure",
    "not certain",
    "no information",
    "don't have that",
    "do not have that",
    "don't have information",
    "unable to answer",
    "can't help with that",
    "cannot help with that",
    "unsure",
    "i'm not able to",
  ];
  // WEAK / courtesy signals — normal in good (esp. negative-review) replies.
  // Lightly penalized so a polite "I'm sorry … we'll follow up" stays confident.
  const weak = ["i'm sorry", "i am sorry", "follow up", "follow-up", "get back to you", "reach out", "contact us", "apologi"];

  let strongHits = 0;
  for (const h of strong) if (lower.includes(h)) strongHits += 1;
  let weakHits = 0;
  for (const h of weak) if (lower.includes(h)) weakHits += 1;

  // Start high, subtract heavily for strong uncertainty, lightly for courtesy.
  let score = 0.85 - strongHits * 0.3 - weakHits * 0.08;
  // Long, specific replies with no strong uncertainty get a small bump.
  if (t.length > 200 && strongHits === 0) score = Math.min(1, score + 0.05);
  return Math.max(0, Math.min(1, score));
}

/**
 * Write (or increment) a knowledge gap. Dedups by normalized question within
 * the last DEDUP_WINDOW_DAYS: an existing OPEN row with the same questionNorm
 * has its hitCount bumped instead of a new insert.
 *
 * Tenant-scoped via withTenant (RLS). Fail-soft on the un-migrated table.
 */
export async function recordKnowledgeGap(args: {
  orgId: string;
  question: string;
  source: GapSource;
  purpose?: string | null;
  confidence?: number | null;
  aiMessageId?: string | null;
  establishmentId?: string | null;
}): Promise<{ recorded: boolean; deduped: boolean }> {
  const question = (args.question ?? "").trim().slice(0, 2000);
  if (!question) return { recorded: false, deduped: false };
  const questionNorm = normalizeQuestion(question);
  if (!questionNorm) return { recorded: false, deduped: false };

  const since = new Date(Date.now() - DEDUP_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  // Decimal(3,2) — clamp to [0,1] so we never overflow the column.
  const confidence =
    args.confidence == null
      ? null
      : Math.max(0, Math.min(0.99, Number(args.confidence))).toFixed(2);

  try {
    return await withTenant(args.orgId, async (tx) => {
      const existing = await tx.knowledgeGap.findFirst({
        where: {
          organizationId: args.orgId,
          questionNorm,
          status: "open",
          createdAt: { gte: since },
        },
        select: { id: true },
      });

      if (existing) {
        await tx.knowledgeGap.update({
          where: { id: existing.id },
          data: { hitCount: { increment: 1 } },
        });
        return { recorded: true, deduped: true };
      }

      await tx.knowledgeGap.create({
        data: {
          organizationId: args.orgId,
          establishmentId: args.establishmentId ?? null,
          question,
          questionNorm,
          source: args.source,
          purpose: args.purpose ?? null,
          confidence,
          aiMessageId: args.aiMessageId ?? null,
        },
      });
      return { recorded: true, deduped: false };
    });
  } catch (err) {
    if (isMissingRelationError(err)) {
      logger.warn(
        { event: "kb.gap.table_missing", orgId: args.orgId },
        "knowledge_gaps not migrated yet — skipping gap write (fail-soft)",
      );
      return { recorded: false, deduped: false };
    }
    // Any other error is logged but never propagated — a gap write must never
    // break the calling generation.
    logger.error(
      { event: "kb.gap.write_failed", orgId: args.orgId, error: err instanceof Error ? err.message : String(err) },
      "failed to record knowledge gap",
    );
    return { recorded: false, deduped: false };
  }
}

/**
 * The single entry point every generation site calls after producing an answer.
 * Routes low-confidence (< CONFIDENCE_GAP_THRESHOLD) generations into the gap
 * queue; high-confidence ones are a no-op. Always non-throwing.
 */
export async function recordConfidence(args: {
  orgId: string;
  purpose: string;
  question: string;
  answer: string;
  confidence: number;
  aiMessageId?: string | null;
  establishmentId?: string | null;
  source: GapSource;
}): Promise<void> {
  try {
    if (!Number.isFinite(args.confidence)) return;
    if (args.confidence >= CONFIDENCE_GAP_THRESHOLD) return;
    await recordKnowledgeGap({
      orgId: args.orgId,
      question: args.question,
      source: args.source,
      purpose: args.purpose,
      confidence: args.confidence,
      aiMessageId: args.aiMessageId ?? null,
      establishmentId: args.establishmentId ?? null,
    });
  } catch (err) {
    // Defensive — recordKnowledgeGap already swallows, but never let this throw.
    logger.error(
      { event: "kb.confidence.route_failed", orgId: args.orgId, error: err instanceof Error ? err.message : String(err) },
    );
  }
}
