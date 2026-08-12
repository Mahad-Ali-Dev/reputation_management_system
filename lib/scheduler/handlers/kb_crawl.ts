import { crawlSite } from "@/lib/ai/crawl";
import { ingestDocument } from "@/lib/ai/ingest";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import type { ScheduledHandlerJob } from "./index";

/**
 * Background website crawl + index for the AI Knowledge Base.
 *
 * WHY A JOB: `ingestAiDocumentFromUrl` is a synchronous server action — the
 * browser sits on a spinner for the whole crawl+embed, a refresh loses it, and
 * a slow site can exceed the request timeout. Running it here means the owner
 * can close the tab, and the UI can poll real per-stage progress instead of
 * guessing.
 *
 * NO NEW TABLE: progress lives on the AiDocument row that the action already
 * creates (`status`: indexing → indexed | failed) plus this job's own status.
 * That keeps prod migration-free — see /api/ai/kb-crawl-status for the read.
 *
 * Crawls up to 20 same-origin pages (depth 2) so services/pricing/policy pages
 * are indexed, not just the landing page.
 *
 * Stages reported to the UI:
 *   queued → crawling → indexing → done | failed
 */

export type KbCrawlPayload = {
  documentId: string;
  url: string;
  establishmentId: string | null;
};

function isPayload(p: Record<string, unknown>): p is KbCrawlPayload & Record<string, unknown> {
  return typeof p.documentId === "string" && typeof p.url === "string";
}

/** Mark the document failed with a short reason the UI can show verbatim. */
async function markFailed(orgId: string, documentId: string, reason: string): Promise<void> {
  await withTenant(orgId, (tx) =>
    tx.aiDocument.update({
      where: { id: documentId },
      data: { status: "failed", content: reason.slice(0, 500) },
    }),
  ).catch(() => {});
}

export async function handleKbCrawl(
  job: ScheduledHandlerJob,
): Promise<{ ok: boolean; detail?: string }> {
  if (!isPayload(job.payload)) {
    return { ok: false, detail: "bad_payload" };
  }
  const { documentId, url, establishmentId } = job.payload;
  const orgId = job.orgId;

  // ---- Stage: crawling ----
  // MULTI-PAGE on purpose. Crawling only the given URL indexed a homepage, and a
  // homepage doesn't contain refund policy, booking or payment info — so the
  // assistant honestly answered "I'm not sure" to exactly the questions the UI
  // suggests asking. `crawlSite` is a same-origin BFS that reuses crawlUrl per
  // hop (so every SSRF / robots / size / redirect guard still applies) and is
  // hard-capped on depth and pages for cost + politeness.
  const crawled = await crawlSite(url, { maxDepth: 2, maxPages: 20 });
  if ("error" in crawled) {
    const reason = `Couldn't read that site (${crawled.error}). Check the URL is public and try again.`;
    await markFailed(orgId, documentId, reason);
    logger.warn({ event: "kb.crawl.failed", orgId, documentId, error: crawled.error });
    // Permanent as far as the user is concerned — don't burn retries on a 404.
    return { ok: true, detail: `crawl_failed:${crawled.error}` };
  }

  const pages = crawled.result.pagesCrawled;
  const text = crawled.result.text?.trim() ?? "";
  if (text.length < 40) {
    await markFailed(
      orgId,
      documentId,
      "We couldn't find readable text on that site — check the URL opens publicly in a browser.",
    );
    return { ok: true, detail: "crawl_empty" };
  }

  // ---- Stage: indexing (chunk + embed) ----
  await withTenant(orgId, (tx) =>
    tx.aiDocument.update({
      where: { id: documentId },
      data: { content: text, status: "indexing" },
    }),
  );

  try {
    const { chunks } = await ingestDocument({
      documentId,
      organizationId: orgId,
      establishmentId,
      content: text,
    });
    logger.info({ event: "kb.crawl.indexed", orgId, documentId, chunks, pages });
    return { ok: true, detail: `indexed:${chunks} pages:${pages}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Embeddings need VOYAGE_API_KEY — the single most common cause here, and
    // worth saying plainly rather than surfacing a raw provider error.
    const reason = msg.includes("VOYAGE_API_KEY")
      ? "Indexing isn't configured on this server yet (missing embeddings key). Ask your admin."
      : "We read the site but couldn't index it. Try again shortly.";
    await markFailed(orgId, documentId, reason);
    logger.error({ event: "kb.crawl.index_failed", orgId, documentId, error: msg });
    return { ok: true, detail: "index_failed" };
  }
}
