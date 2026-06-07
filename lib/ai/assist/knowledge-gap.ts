import { Prisma } from "@prisma/client";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import type { AiAssistPurpose } from "./types";

/**
 * KnowledgeGap write (00_foundation §A4.6) — the AiAssist learning loop.
 *
 * When the best option's confidence falls below the threshold, AiAssist records
 * a KnowledgeGap so the KB-learning monitor (Step 5) and inbox handoff (Step 9)
 * can surface "the AI was unsure about X". Writes are tenant-scoped (`withTenant`)
 * and DEDUPED on a normalized question so repeated unsure asks bump `hitCount`
 * rather than spawning duplicate rows.
 *
 * ── Schema note (important) ──
 * The foundation spec's prose sketched `{ query, context, confidence }`, but the
 * de-duplication decision in `_schema-delta.md §A` adopted the richer
 * **05_ai_kb field set** as the single owned table. So this code binds to the
 * REAL columns: `question`, `questionNorm` (dedupe key), `source` (required),
 * `purpose?`, `confidence Decimal(3,2)`, `aiMessageId?`, `hitCount`. There is no
 * `context` column — the assembled-context summary the caller passes is folded
 * into the logged AiMessage (which `aiMessageId` already points at), so no
 * secrets are duplicated into `knowledge_gaps`.
 *
 * Fail-soft: the `knowledge_gaps` table does not exist in the live DB until the
 * founder runs the master migration. Postgres 42P01 (undefined_table) / 42703
 * (undefined_column) are treated as "not configured" — logged, returns
 * `{ id: null }`, never a 500.
 */

/** Map an AiAssist purpose to the KnowledgeGap.source bucket. */
function sourceForPurpose(purpose: AiAssistPurpose): string {
  switch (purpose) {
    case "review_reply":
    case "dispute_argument":
      return "review_reply";
    case "inbox_reply":
    case "social_caption":
      return "inbox";
    case "kb_answer":
      return "chat";
    default:
      // review_request, survey_insight, seo_recommendation, ai_autopilot — the
      // owner did an internal "test" generation that came back unsure.
      return "owner_test";
  }
}

/**
 * Normalize a question for dedupe: lowercase, collapse whitespace, strip most
 * punctuation, trim, and cap length so the index key stays bounded.
 */
export function normalizeQuestion(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

/**
 * Upsert a KnowledgeGap for a low-confidence result. Dedupes on
 * `(organizationId, questionNorm)`: increments `hitCount` + keeps the lowest
 * seen confidence when the gap already exists, else inserts a fresh `open` row.
 *
 * Returns the row id, or `null` when the table is not yet migrated (fail-soft).
 */
export async function writeKnowledgeGap(args: {
  orgId: string;
  /** The user/customer ask the AI was unsure about. */
  query: string;
  /**
   * Serialized assembled-context summary (no secrets). Accepted for API
   * compatibility with the spec; not persisted as its own column (see header).
   */
  context?: string;
  confidence: number;
  purpose?: AiAssistPurpose;
  establishmentId?: string | null;
  /** The logged AiMessage that produced the unsure answer, if any. */
  aiMessageId?: string | null;
}): Promise<{ id: string | null }> {
  const { orgId, query, confidence, purpose, establishmentId, aiMessageId } = args;
  const questionNorm = normalizeQuestion(query);
  if (!questionNorm) return { id: null };

  // Confidence column is Decimal(3,2) → clamp + round to 2 dp.
  const conf = new Prisma.Decimal(Math.max(0, Math.min(1, confidence)).toFixed(2));
  const source = purpose ? sourceForPurpose(purpose) : "owner_test";

  try {
    return await withTenant(orgId, async (tx) => {
      // Dedupe within the tenant on the normalized question. (No DB unique
      // constraint exists on questionNorm, so do a find-then-write; the index
      // `(organizationId, questionNorm)` keeps the lookup cheap.)
      const existing = await tx.knowledgeGap.findFirst({
        where: { organizationId: orgId, questionNorm, status: "open" },
        select: { id: true, confidence: true },
        orderBy: { createdAt: "desc" },
      });

      if (existing) {
        // Keep the *lowest* confidence seen so the gap reflects worst-case doubt.
        // A null existing confidence is replaced by the new value.
        const keepLower = existing.confidence?.lessThan(conf) ? existing.confidence : conf;
        const updated = await tx.knowledgeGap.update({
          where: { id: existing.id },
          data: {
            hitCount: { increment: 1 },
            confidence: keepLower,
            ...(aiMessageId ? { aiMessageId } : {}),
          },
          select: { id: true },
        });
        logger.info(
          { orgId, gapId: updated.id, questionNorm, event: "ai.assist.gap.incremented" },
          "knowledge gap hit count incremented",
        );
        return { id: updated.id };
      }

      const created = await tx.knowledgeGap.create({
        data: {
          organizationId: orgId,
          establishmentId: establishmentId ?? null,
          question: query.slice(0, 1000),
          questionNorm,
          source,
          purpose: purpose ?? null,
          confidence: conf,
          aiMessageId: aiMessageId ?? null,
          hitCount: 1,
          status: "open",
        },
        select: { id: true },
      });
      logger.info(
        { orgId, gapId: created.id, questionNorm, confidence: conf.toString(), event: "ai.assist.gap.written" },
        "knowledge gap written (low confidence)",
      );
      return { id: created.id };
    });
  } catch (err) {
    if (isMissingRelation(err)) {
      logger.warn({ orgId, event: "ai.assist.gap.skipped_unmigrated" });
      return { id: null };
    }
    // Never let a learning-loop write break a generation.
    logger.warn({
      orgId,
      error: err instanceof Error ? err.message : String(err),
      event: "ai.assist.gap.write_failed",
    });
    return { id: null };
  }
}

/** Postgres 42P01 (undefined_table) / 42703 (undefined_column) → not migrated yet. */
function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "42P01" || code === "42703";
}
