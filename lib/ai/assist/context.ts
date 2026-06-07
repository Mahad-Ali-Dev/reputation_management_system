import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { retrieveChunks } from "@/lib/ai/ingest";
import { rerankCandidates, type RerankCandidate } from "@/lib/ai/rerank";
import type { AiAssistInput } from "./types";

/**
 * Context assembly (00_foundation §A4.2 step 4 / §A4.4).
 *
 * Builds the grounding the generator needs, reusing proven internals:
 *   - KB: `retrieveChunks` (pgvector) → `rerankCandidates` (Haiku reranker)
 *   - persona/style: the org's `AiTrainingProfile` row → directives block
 *   - domain rows: caller-supplied, fenced as DATA (`<untrusted_*>`)
 *
 * Everything tenant-scoped runs inside ONE `withTenant` so RLS applies to the
 * pgvector query and the profile read. KB retrieval is best-effort: any failure
 * (including a not-yet-migrated/empty index) degrades to "no KB", never throws.
 */

const TOP_K = 4;
const CANDIDATE_K = 8;

/** Sentinel rationales the reranker returns when it did NOT meaningfully rank. */
const WEAK_RERANK_RATIONALES = new Set([
  "below_topk_no_rerank_needed",
  "rerank_call_failed_fallback_to_vector_order",
  "no_tool_use_fallback",
]);

export type AssembledContext = {
  /** Reranked KB snippets, best-first. */
  kbChunks: Array<{ chunkId: string; text: string; documentId: string }>;
  /** UUIDs of the documents the chunks came from (AiMessage.retrievedChunkIds). */
  usedChunkIds: string[];
  /** Persona / style directives derived from AiTrainingProfile (system text). */
  personaDirectives: string;
  /** Establishment display name, when resolvable (used in the prompt header). */
  establishmentName: string | null;
  /** Whether the reranker produced a confident, on-topic rationale. */
  rerankRationaleStrong: boolean;
  /** Rendered, injection-fenced block of caller domain rows + primary text. */
  domainBlock: string;
  /** Cost of the rerank call (micros), summed into the result. */
  costMicros: number;
};

/** Strip URLs from untrusted text (SEO/phishing relay defense — as in generate-reply). */
function stripUrls(s: string): string {
  return s.replace(/\bhttps?:\/\/\S+/gi, "[link removed]");
}

/** Prevent close-tag attacks for a given fence tag. */
function escapeForXmlTag(s: string, tag: string): string {
  return s.split(`</${tag}>`).join("<").split(`<${tag}>`).join(">");
}

type TrainingProfileRow = {
  businessOverview: string | null;
  servicesProducts: string | null;
  pricingDetails: string | null;
  aiPersonalityStyle: string | null;
  customerInquiryStyle: string | null;
  complaintStyle: string | null;
  customPrompt: string | null;
  locations: string | null;
} | null;

/** Build the persona/style directives block from the training profile. */
function buildPersonaDirectives(profile: TrainingProfileRow, toneHint?: string): string {
  const lines: string[] = [];
  if (profile?.aiPersonalityStyle) lines.push(`Voice/personality: ${profile.aiPersonalityStyle}.`);
  if (profile?.businessOverview)
    lines.push(`About the business: ${profile.businessOverview.slice(0, 600)}`);
  if (profile?.servicesProducts)
    lines.push(`Services/products: ${profile.servicesProducts.slice(0, 400)}`);
  if (profile?.locations) lines.push(`Locations: ${profile.locations.slice(0, 200)}`);
  if (profile?.pricingDetails)
    lines.push(`Pricing notes: ${profile.pricingDetails.slice(0, 300)}`);
  if (profile?.customerInquiryStyle)
    lines.push(`Inquiry style: ${profile.customerInquiryStyle}.`);
  if (profile?.complaintStyle) lines.push(`Complaint style: ${profile.complaintStyle}.`);
  if (profile?.customPrompt)
    lines.push(`Owner guidance: ${profile.customPrompt.slice(0, 1200)}`);
  if (toneHint) lines.push(`Tone for THIS response: ${toneHint}.`);
  if (lines.length === 0) {
    return "Voice/personality: warm, professional, concise. No banned words.";
  }
  return lines.join("\n");
}

/**
 * Render caller-supplied domain rows + primary text as injection-fenced DATA.
 * `primaryText` becomes `<untrusted_primary>`, each row becomes its own
 * `<untrusted_row key="...">` block. All URLs stripped, all close-tags escaped.
 */
function buildDomainBlock(input: AiAssistInput): string {
  const domain = input.domain;
  if (!domain) return "";
  const parts: string[] = [];

  if (domain.primaryText) {
    const safe = escapeForXmlTag(stripUrls(domain.primaryText).slice(0, 4000), "untrusted_primary");
    parts.push(`<untrusted_primary>\n${safe}\n</untrusted_primary>`);
  }

  if (domain.rows) {
    for (const [key, value] of Object.entries(domain.rows)) {
      if (value === null || value === undefined) continue;
      const raw = typeof value === "string" ? value : safeStringify(value);
      const safeKey = key.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 40);
      const safeVal = escapeForXmlTag(stripUrls(raw).slice(0, 2000), "untrusted_row");
      parts.push(`<untrusted_row key="${safeKey}">\n${safeVal}\n</untrusted_row>`);
    }
  }

  if (input.avoidTexts?.length) {
    const avoid = input.avoidTexts
      .slice(0, 5)
      .map((t, i) => `  [${i + 1}] ${stripUrls(t).slice(0, 500)}`)
      .join("\n");
    parts.push(
      `<avoid_repeating>\nDo NOT repeat or lightly reword any of these previous drafts; produce materially different options:\n${avoid}\n</avoid_repeating>`,
    );
  }

  return parts.join("\n\n");
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Assemble the full context for a generation. Single tenant-scoped transaction
 * so RLS covers both the KB query and the profile read.
 */
export async function assembleContext(input: AiAssistInput): Promise<AssembledContext> {
  const establishmentId = input.domain?.establishmentId ?? null;

  const base: AssembledContext = {
    kbChunks: [],
    usedChunkIds: [],
    personaDirectives: "",
    establishmentName: null,
    rerankRationaleStrong: false,
    domainBlock: buildDomainBlock(input),
    costMicros: 0,
  };

  // ── tenant-scoped reads: KB retrieval + training profile + establishment name
  let profile: TrainingProfileRow = null;
  let establishmentName: string | null = null;
  let rawChunks: Awaited<ReturnType<typeof retrieveChunks>> = [];

  try {
    await withTenant(input.orgId, async (tx) => {
      // Training profile (org-singleton). Fail-soft if the row/columns are absent.
      try {
        profile = await tx.aiTrainingProfile.findUnique({
          where: { organizationId: input.orgId },
          select: {
            businessOverview: true,
            servicesProducts: true,
            pricingDetails: true,
            aiPersonalityStyle: true,
            customerInquiryStyle: true,
            complaintStyle: true,
            customPrompt: true,
            locations: true,
          },
        });
      } catch (err) {
        if (!isMissingRelation(err)) throw err;
      }

      if (establishmentId) {
        try {
          const est = await tx.establishment.findFirst({
            where: { id: establishmentId },
            select: { name: true },
          });
          establishmentName = est?.name ?? null;
        } catch (err) {
          if (!isMissingRelation(err)) throw err;
        }
      }

      // KB retrieval inside the tenant tx so RLS applies to the pgvector query.
      if (!input.skipKb) {
        rawChunks = await retrieveChunks({
          organizationId: input.orgId,
          establishmentId,
          query: input.query,
          topK: CANDIDATE_K,
        });
      }
    });
  } catch (err) {
    // Whole context read failed (transient DB, unmigrated KB, …): degrade to
    // generation-without-KB rather than blocking the user.
    logger.warn({
      orgId: input.orgId,
      error: err instanceof Error ? err.message : String(err),
      event: "ai.assist.context.read_failed",
    });
  }

  base.personaDirectives = buildPersonaDirectives(profile, input.toneHint);
  base.establishmentName = establishmentName;

  if (rawChunks.length === 0) return base;

  // Rerank (Haiku) outside the tx — it is a network call, not a DB read.
  const candidates: RerankCandidate[] = rawChunks.map((c, i) => ({
    chunkId: `chunk_${i}`,
    chunkText: c.chunkText,
    documentId: c.documentId,
    position: c.position,
    metadata: c.metadata,
  }));

  let reranked = candidates.slice(0, TOP_K);
  let rationaleStrong = false;
  let rerankCost = 0;
  try {
    const r = await rerankCandidates({ query: input.query, candidates, topK: TOP_K });
    reranked = r.reranked;
    rerankCost = r.costMicros;
    rationaleStrong =
      r.reranked.length > 0 && !WEAK_RERANK_RATIONALES.has(r.rationale);
  } catch (err) {
    logger.warn({
      orgId: input.orgId,
      error: err instanceof Error ? err.message : String(err),
      event: "ai.assist.context.rerank_failed",
    });
    // Keep the vector-order top-K already in `reranked`.
  }

  base.kbChunks = reranked.map((c) => ({
    chunkId: c.chunkId,
    text: c.chunkText,
    documentId: c.documentId,
  }));
  base.usedChunkIds = Array.from(new Set(reranked.map((c) => c.documentId)));
  base.rerankRationaleStrong = rationaleStrong;
  base.costMicros = rerankCost;
  return base;
}

/** Postgres 42P01 (undefined_table) / 42703 (undefined_column) → not migrated yet. */
function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "42P01" || code === "42703";
}
