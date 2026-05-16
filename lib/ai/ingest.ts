import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { logger } from "@/lib/logger";
import { voyageEmbed } from "./voyage";

/**
 * Document ingestion pipeline:
 *   text → chunker → Voyage embeddings → ai_embeddings rows (pgvector)
 *
 * Chunker (v1, header-aware sentence-window):
 *   - Split by ## headers → preserve sections
 *   - Within each section, sliding window of ~500 chars with 80-char overlap
 *   - Each chunk gets {section, position} metadata for citation rendering
 */

const CHUNK_TARGET_CHARS = 500;
const CHUNK_OVERLAP_CHARS = 80;
const CHUNK_MAX_CHARS = 800;

type Chunk = {
  text: string;
  position: number;
  metadata: { section?: string };
};

export function chunkText(content: string): Chunk[] {
  // Normalize whitespace + line endings
  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  // Split by markdown H2 (## ) or double newline
  const sections = normalized.split(/\n(?=##\s)/);
  const chunks: Chunk[] = [];
  let pos = 0;

  for (const section of sections) {
    const m = section.match(/^##\s+(.+?)\n/);
    const sectionTitle = m?.[1]?.trim() ?? undefined;
    const body = section.trim();
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
      const cutoff =
        lastPeriod > CHUNK_TARGET_CHARS / 2 ? i + lastPeriod + 1 : end;
      const text = body.slice(i, cutoff).trim();
      if (text.length > 0) {
        chunks.push({
          text,
          position: pos++,
          metadata: sectionTitle ? { section: sectionTitle } : {},
        });
      }
      if (cutoff >= body.length) break;
      i = cutoff - CHUNK_OVERLAP_CHARS;
      if (i < 0) i = cutoff;
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
  await prisma.$transaction(async (tx) => {
    await tx.aiEmbedding.deleteMany({ where: { documentId: args.documentId } });

    // Bulk insert via raw SQL (Prisma doesn't support vector column natively).
    // Each row: id, document_id, organization_id, establishment_id, chunk_text, embedding, content_hash, position, metadata
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      const vec = embeddings[i]!;
      // Format vector as Postgres `[1.0,2.0,...]` text literal
      const vecLiteral = `[${vec.join(",")}]`;
      const meta = JSON.stringify(chunk.metadata);
      await tx.$executeRawUnsafe(
        `INSERT INTO ai_embeddings (id, document_id, organization_id, establishment_id, chunk_text, embedding, content_hash, position, metadata)
         VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4, $5::vector, $6, $7, $8::jsonb)`,
        args.documentId,
        args.organizationId,
        args.establishmentId,
        chunk.text,
        vecLiteral,
        contentHash,
        chunk.position,
        meta,
      );
    }

    await tx.aiDocument.update({
      where: { id: args.documentId },
      data: { status: "indexed", lastIndexedAt: new Date() },
    });
  });

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
