import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { logger } from "@/lib/logger";
import { voyageEmbed } from "./voyage";

/**
 * Document ingestion pipeline:
 *   text → chunker → Voyage embeddings → ai_embeddings rows (pgvector)
 *
 * Chunker (v2, full header-aware sentence-window):
 *   - Split on ANY markdown header (# / ## / ### / ####) — not just ## — so a
 *     page's H1 title and H3 sub-sections each anchor their own section. The
 *     crawler emits all four levels (see crawl.ts:htmlToText), so v1's H2-only
 *     split was silently merging titled sections into one giant chunk.
 *   - Each chunk carries the NEAREST preceding heading as {section}, so a deeper
 *     heading inside a section refines the label rather than being lost.
 *   - Within an over-long section, a sentence-aware sliding window of
 *     ~CHUNK_TARGET_CHARS with CHUNK_OVERLAP_CHARS of overlap keeps context
 *     across the cut; overlap snaps back to a sentence start so a chunk never
 *     begins mid-word.
 *   - {section, position} metadata is kept for citation rendering + retrieval.
 */

const CHUNK_TARGET_CHARS = 500;
const CHUNK_OVERLAP_CHARS = 80;
const CHUNK_MAX_CHARS = 800;

// A markdown ATX heading line: 1–4 leading '#', a space, then the title.
const HEADING_RE = /^(#{1,4})\s+(.+?)\s*$/;

type Chunk = {
  text: string;
  position: number;
  metadata: { section?: string };
};

/**
 * Split the corpus into {title, body} sections on every markdown heading level.
 * Lines before the first heading form an untitled lead section so a page with
 * intro copy above its first header doesn't lose that text.
 */
function splitSections(normalized: string): Array<{ title?: string; body: string }> {
  const lines = normalized.split("\n");
  const sections: Array<{ title?: string; body: string[] }> = [];
  let current: { title?: string; body: string[] } = { body: [] };

  for (const line of lines) {
    const m = line.match(HEADING_RE);
    if (m) {
      // Close the in-progress section (if it has any content) and open a new one.
      if (current.title !== undefined || current.body.some((l) => l.trim())) {
        sections.push(current);
      }
      current = { title: m[2]?.trim(), body: [] };
    } else {
      current.body.push(line);
    }
  }
  if (current.title !== undefined || current.body.some((l) => l.trim())) {
    sections.push(current);
  }

  return sections.map((s) => ({
    title: s.title,
    // Re-attach the heading line so the chunk text reads naturally + keeps the
    // header words in the embedded text (they're strong retrieval signal).
    body: (s.title ? `${s.title}\n` : "") + s.body.join("\n").trim(),
  }));
}

export function chunkText(content: string): Chunk[] {
  // Normalize whitespace + line endings
  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const sections = splitSections(normalized);
  const chunks: Chunk[] = [];
  let pos = 0;

  for (const section of sections) {
    const sectionTitle = section.title || undefined;
    const body = section.body.trim();
    if (!body) continue;

    if (body.length <= CHUNK_MAX_CHARS) {
      chunks.push({
        text: body,
        position: pos++,
        metadata: sectionTitle ? { section: sectionTitle } : {},
      });
      continue;
    }

    // Sentence-aware sliding window
    let i = 0;
    while (i < body.length) {
      const end = Math.min(i + CHUNK_TARGET_CHARS, body.length);
      // Try to break at sentence boundary
      const slice = body.slice(i, end);
      const lastPeriod = Math.max(
        slice.lastIndexOf(". "),
        slice.lastIndexOf("? "),
        slice.lastIndexOf("! "),
        slice.lastIndexOf(".\n"),
      );
      const cutoff = lastPeriod > CHUNK_TARGET_CHARS / 2 ? i + lastPeriod + 1 : end;
      const text = body.slice(i, cutoff).trim();
      if (text.length > 0) {
        chunks.push({
          text,
          position: pos++,
          metadata: sectionTitle ? { section: sectionTitle } : {},
        });
      }
      if (cutoff >= body.length) break;
      // Overlap back by CHUNK_OVERLAP_CHARS, then snap forward to the next
      // sentence/word boundary so the overlapped chunk never starts mid-word.
      let nextStart = cutoff - CHUNK_OVERLAP_CHARS;
      if (nextStart <= i) {
        // Section had no usable sentence break in the window — advance hard to
        // guarantee forward progress (prevents an infinite loop).
        nextStart = cutoff;
      } else {
        const overlap = body.slice(nextStart, cutoff);
        const space = overlap.search(/\s/);
        if (space > 0) nextStart += space + 1;
      }
      i = nextStart;
    }
  }

  return chunks;
}

/**
 * Ingest a document: chunk → embed → write ai_embeddings rows.
 * Idempotent on content_hash — if the document hasn't changed, no re-embed.
 */
export async function ingestDocument(args: {
  documentId: string;
  organizationId: string;
  establishmentId: string | null;
  content: string;
}): Promise<{ chunks: number; reused: boolean }> {
  const contentHash = createHash("sha256").update(args.content).digest("hex");

  // Check if doc already indexed at this hash
  const doc = await prisma.aiDocument.findUnique({
    where: { id: args.documentId },
    select: { contentHash: true, status: true },
  });
  if (doc && doc.contentHash === contentHash && doc.status === "indexed") {
    return { chunks: 0, reused: true };
  }

  // Mark indexing
  await prisma.aiDocument.update({
    where: { id: args.documentId },
    data: { status: "indexing", contentHash },
  });

  // Chunk
  const chunks = chunkText(args.content);
  if (chunks.length === 0) {
    await prisma.aiDocument.update({
      where: { id: args.documentId },
      data: { status: "failed" },
    });
    throw new Error("ingest: no chunks produced (empty content)");
  }

  // Embed in batches of 100
  const texts = chunks.map((c) => c.text);
  const batches: string[][] = [];
  for (let i = 0; i < texts.length; i += 100) {
    batches.push(texts.slice(i, i + 100));
  }
  const embeddings: number[][] = [];
  for (const batch of batches) {
    const result = await voyageEmbed({ input: batch, inputType: "document" });
    embeddings.push(...result);
  }

  // Wipe old embeddings + insert new (transactional)
  //
  // MULTI-ROW INSERT, NOT ONE PER CHUNK. This loop used to issue a separate
  // round-trip per chunk inside a transaction left on Prisma's DEFAULT 5s
  // timeout. Against Neon (~10-30ms per round-trip) a one-page document's ~15
  // chunks finished comfortably, so it looked fine — but a 20-page site crawl
  // produces 300-400 chunks, which blows the 5s budget and Postgres kills the
  // transaction mid-write. The whole index then fails with a message that named
  // nothing. Batching collapses those hundreds of round-trips into a handful.
  const INSERT_BATCH = 100; // 8 binds/row → 800 params, far under PG's 65535
  await prisma.$transaction(
    async (tx) => {
      await tx.aiEmbedding.deleteMany({ where: { documentId: args.documentId } });

      // Raw SQL because Prisma doesn't support the pgvector column type natively.
      for (let start = 0; start < chunks.length; start += INSERT_BATCH) {
        const slice = chunks.slice(start, start + INSERT_BATCH);
        const tuples: string[] = [];
        const params: unknown[] = [];
        for (let j = 0; j < slice.length; j++) {
          const chunk = slice[j]!;
          const vec = embeddings[start + j]!;
          const b = params.length;
          tuples.push(
            `(gen_random_uuid(), $${b + 1}::uuid, $${b + 2}::uuid, $${b + 3}::uuid, $${b + 4}, $${b + 5}::vector, $${b + 6}, $${b + 7}, $${b + 8}::jsonb)`,
          );
          params.push(
            args.documentId,
            args.organizationId,
            args.establishmentId,
            chunk.text,
            // Postgres vector literal: `[1.0,2.0,…]`
            `[${vec.join(",")}]`,
            contentHash,
            chunk.position,
            JSON.stringify(chunk.metadata),
          );
        }
        await tx.$executeRawUnsafe(
          `INSERT INTO ai_embeddings (id, document_id, organization_id, establishment_id, chunk_text, embedding, content_hash, position, metadata)
           VALUES ${tuples.join(", ")}`,
          ...params,
        );
      }

      await tx.aiDocument.update({
        where: { id: args.documentId },
        data: { status: "indexed", lastIndexedAt: new Date() },
      });
    },
    // Belt-and-braces: batching alone brings a 400-chunk write back under a
    // second, but a big site on a slow link shouldn't hit a silent 5s cliff.
    { timeout: 120_000, maxWait: 20_000 },
  );

  logger.info(
    { documentId: args.documentId, chunks: chunks.length, event: "ai.document.indexed" },
    "document ingested + embedded",
  );

  return { chunks: chunks.length, reused: false };
}

/**
 * Retrieval: query embedding → top-K nearest chunks for this org+establishment.
 * Always passes RLS tenant context (called from withTenant) but additional explicit filter
 * for defense-in-depth.
 */
export async function retrieveChunks(args: {
  organizationId: string;
  establishmentId: string | null;
  query: string;
  topK?: number;
}): Promise<Array<{ chunkText: string; documentId: string; position: number; metadata: unknown }>> {
  const k = args.topK ?? 5;

  const [queryVec] = await voyageEmbed({ input: args.query, inputType: "query" });
  if (!queryVec) return [];
  const vecLiteral = `[${queryVec.join(",")}]`;

  // Direct prisma raw — withTenant context should be set by caller for RLS.
  // Filter ALSO by establishment for cross-location isolation (AI-3 CR).
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      chunk_text: string;
      document_id: string;
      position: number;
      metadata: unknown;
      distance: number;
    }>
  >(
    `SELECT chunk_text, document_id, position, metadata, embedding <=> $1::vector AS distance
     FROM ai_embeddings
     WHERE organization_id = $2::uuid
       AND ($3::uuid IS NULL OR establishment_id = $3::uuid)
     ORDER BY embedding <=> $1::vector
     LIMIT $4`,
    vecLiteral,
    args.organizationId,
    args.establishmentId,
    k,
  );

  return rows.map((r) => ({
    chunkText: r.chunk_text,
    documentId: r.document_id,
    position: r.position,
    metadata: r.metadata,
  }));
}
