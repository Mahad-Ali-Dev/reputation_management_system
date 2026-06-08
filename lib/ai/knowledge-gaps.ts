import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { assertEntitled } from "@/lib/billing/entitlements";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { isMissingRelationError } from "./confidence";

/**
 * Knowledge-gap queries + the "Teach AI" action behind the Learning Monitor tab.
 *
 * `listKnowledgeGaps` / `learningStats` are READ helpers the server page calls;
 * `teachKnowledgeGap` / `dismissKnowledgeGap` are the owner-facing server
 * actions (marked with an inline "use server" directive so this module can ALSO
 * export the read helpers + pure `applyTaughtFact` + types — a top-level
 * "use server" file may only export async actions).
 *
 * Every gap read/write fails soft on the un-migrated `knowledge_gaps` table
 * (Wave-2 guardrail): reads return empty / zeroed stats, the teach action marks
 * the profile but no-ops the gap update — never a 500.
 */

/** Max chars we let `customPrompt` grow to before overflowing into taughtFacts. */
const CUSTOM_PROMPT_CAP = 3000;
/** Leave headroom so we never write a customPrompt that fails the 3000 zod cap. */
const CUSTOM_PROMPT_SOFT_CAP = 2800;

async function requireOrg() {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  const userId = session?.user?.id;
  if (!session || !orgId || !userId) redirect("/login");
  return { orgId, userId };
}

export type KnowledgeGapRow = {
  id: string;
  question: string;
  source: string;
  purpose: string | null;
  confidence: number | null;
  hitCount: number;
  status: string;
  answerText: string | null;
  answeredAt: Date | null;
  createdAt: Date;
};

/**
 * List gaps for an org, newest-pressing first (hitCount desc, then recency).
 * Fail-soft → [] when the table isn't migrated.
 */
export async function listKnowledgeGaps(
  orgId: string,
  opts?: { status?: "open" | "answered" | "dismissed"; limit?: number },
): Promise<KnowledgeGapRow[]> {
  const status = opts?.status ?? "open";
  const limit = Math.min(opts?.limit ?? 50, 200);
  try {
    const rows = await withTenant(orgId, async (tx) =>
      tx.knowledgeGap.findMany({
        where: { organizationId: orgId, status },
        orderBy: [{ hitCount: "desc" }, { createdAt: "desc" }],
        take: limit,
        select: {
          id: true,
          question: true,
          source: true,
          purpose: true,
          confidence: true,
          hitCount: true,
          status: true,
          answerText: true,
          answeredAt: true,
          createdAt: true,
        },
      }),
    );
    return rows.map((r) => ({
      ...r,
      confidence: r.confidence == null ? null : Number(r.confidence),
    }));
  } catch (err) {
    if (isMissingRelationError(err)) return [];
    logger.error(
      { event: "kb.gaps.list_failed", orgId, error: err instanceof Error ? err.message : String(err) },
    );
    return [];
  }
}

export type LearningStats = {
  open: number;
  answered: number;
  dismissed: number;
  total: number;
  /** % of all (open+answered) gaps that have been answered. The Learning Monitor bar. */
  answeredPct: number;
  /** Gaps surfaced in the last 7 days (open + answered + dismissed). */
  last7d: number;
  /** Gaps answered in the last 7 days. */
  answered7d: number;
  /** Sum of hitCount across open gaps — how many low-confidence answers are waiting. */
  openHits: number;
};

/**
 * The numbers behind the Learning Monitor bars. Returns REAL counts (fixes the
 * "bars stuck at 0%" bug). Fail-soft → all zeros when the table isn't migrated.
 */
export async function learningStats(orgId: string): Promise<LearningStats> {
  const empty: LearningStats = {
    open: 0,
    answered: 0,
    dismissed: 0,
    total: 0,
    answeredPct: 0,
    last7d: 0,
    answered7d: 0,
    openHits: 0,
  };
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  try {
    return await withTenant(orgId, async (tx) => {
      const [open, answered, dismissed, last7d, answered7d, openAgg] = await Promise.all([
        tx.knowledgeGap.count({ where: { organizationId: orgId, status: "open" } }),
        tx.knowledgeGap.count({ where: { organizationId: orgId, status: "answered" } }),
        tx.knowledgeGap.count({ where: { organizationId: orgId, status: "dismissed" } }),
        tx.knowledgeGap.count({ where: { organizationId: orgId, createdAt: { gte: since } } }),
        tx.knowledgeGap.count({
          where: { organizationId: orgId, status: "answered", answeredAt: { gte: since } },
        }),
        tx.knowledgeGap.aggregate({
          where: { organizationId: orgId, status: "open" },
          _sum: { hitCount: true },
        }),
      ]);
      const answerable = open + answered;
      const answeredPct = answerable === 0 ? 0 : Math.round((answered / answerable) * 100);
      return {
        open,
        answered,
        dismissed,
        total: open + answered + dismissed,
        answeredPct,
        last7d,
        answered7d,
        openHits: openAgg._sum.hitCount ?? 0,
      };
    });
  } catch (err) {
    if (isMissingRelationError(err)) return empty;
    logger.error(
      { event: "kb.stats.failed", orgId, error: err instanceof Error ? err.message : String(err) },
    );
    return empty;
  }
}

/**
 * Compose the updated customPrompt / taughtFacts after teaching a Q→A.
 * Pure so it's unit-testable: appends to customPrompt while under the soft cap,
 * otherwise pushes the fact into the taughtFacts overflow array.
 */
export function applyTaughtFact(args: {
  question: string;
  answer: string;
  customPrompt: string | null;
  taughtFacts: unknown;
}): { customPrompt: string | null; taughtFacts: { q: string; a: string; at: string }[] } {
  const q = args.question.trim().slice(0, 500);
  const a = args.answer.trim().slice(0, 1000);
  const facts: { q: string; a: string; at: string }[] = Array.isArray(args.taughtFacts)
    ? (args.taughtFacts as { q: string; a: string; at: string }[]).filter(
        (f) => f && typeof f.q === "string" && typeof f.a === "string",
      )
    : [];

  const line = `Q: ${q}\nA: ${a}`;
  const existing = args.customPrompt ?? "";
  const header = existing.includes("Taught answers (owner-provided):")
    ? ""
    : `${existing.length > 0 ? "\n\n" : ""}Taught answers (owner-provided):`;
  const candidate = `${existing}${header}\n${line}`;

  if (candidate.length <= CUSTOM_PROMPT_SOFT_CAP) {
    return { customPrompt: candidate.slice(0, CUSTOM_PROMPT_CAP), taughtFacts: facts };
  }
  // Near the cap — keep customPrompt as-is and overflow into taughtFacts.
  facts.push({ q, a, at: new Date().toISOString() });
  return { customPrompt: args.customPrompt ?? null, taughtFacts: facts.slice(-200) };
}

const TeachSchema = z.object({
  gapId: z.string().uuid(),
  answer: z.string().min(1).max(1000),
});

/**
 * Owner answers a knowledge gap. Marks the gap answered, then appends the Q→A
 * to the AI's custom-instructions context (with taughtFacts overflow). Audited.
 * Fail-soft: if the gap table isn't migrated, the update no-ops but never 500s.
 */
export async function teachKnowledgeGap(form: FormData): Promise<void> {
  const { orgId, userId } = await requireOrg();
  await assertEntitled(orgId);

  const parsed = TeachSchema.safeParse({
    gapId: form.get("gapId"),
    answer: form.get("answer"),
  });
  if (!parsed.success) {
    throw new Error(`Validation: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }
  const { gapId, answer } = parsed.data;

  try {
    await withTenant(orgId, async (tx) => {
      // RLS + org-scope ensure a foreign gapId returns 0 rows (findFirst → null).
      const gap = await tx.knowledgeGap.findFirst({
        where: { id: gapId, organizationId: orgId },
        select: { id: true, question: true, status: true },
      });
      if (!gap) {
        logger.warn({ event: "kb.teach.gap_not_found", orgId, gapId });
        return;
      }

      await tx.knowledgeGap.update({
        where: { id: gap.id },
        data: {
          status: "answered",
          answerText: answer,
          answeredAt: new Date(),
          answeredBy: userId,
        },
      });

      // Fold the taught Q→A into the profile's context for all future calls.
      const profile = await tx.aiTrainingProfile.findUnique({
        where: { organizationId: orgId },
        select: { customPrompt: true, taughtFacts: true },
      });
      const next = applyTaughtFact({
        question: gap.question,
        answer,
        customPrompt: profile?.customPrompt ?? null,
        taughtFacts: profile?.taughtFacts ?? null,
      });

      if (profile) {
        await tx.aiTrainingProfile.update({
          where: { organizationId: orgId },
          data: { customPrompt: next.customPrompt, taughtFacts: next.taughtFacts },
        });
      } else {
        await tx.aiTrainingProfile.create({
          data: {
            organizationId: orgId,
            customPrompt: next.customPrompt,
            taughtFacts: next.taughtFacts,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorType: "user",
          actorId: userId,
          action: "ai.kb.taught",
          resourceType: "knowledge_gap",
          resourceId: gap.id,
          afterData: { question: gap.question.slice(0, 200), answerLength: answer.length },
        },
      });
    });
  } catch (err) {
    if (isMissingRelationError(err)) {
      logger.warn(
        { event: "kb.teach.table_missing", orgId, gapId },
        "knowledge_gaps not migrated yet — teach no-op (fail-soft)",
      );
      revalidatePath("/ai/training");
      return;
    }
    throw err;
  }

  revalidatePath("/ai/training");
}

/**
 * Owner dismisses a gap (not worth answering). Fail-soft like teach.
 */
export async function dismissKnowledgeGap(form: FormData): Promise<void> {
  const { orgId, userId } = await requireOrg();
  const gapId = String(form.get("gapId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(gapId)) throw new Error("invalid_gap_id");

  try {
    await withTenant(orgId, async (tx) => {
      const gap = await tx.knowledgeGap.findFirst({
        where: { id: gapId, organizationId: orgId },
        select: { id: true },
      });
      if (!gap) return;
      await tx.knowledgeGap.update({
        where: { id: gap.id },
        data: { status: "dismissed", answeredBy: userId, answeredAt: new Date() },
      });
    });
  } catch (err) {
    if (!isMissingRelationError(err)) throw err;
  }

  revalidatePath("/ai/training");
}
