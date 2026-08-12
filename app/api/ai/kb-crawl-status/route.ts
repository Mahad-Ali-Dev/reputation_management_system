import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/ai/kb-crawl-status?documentId=<uuid>
 *
 * Progress for the "Connect website" flow. The crawl runs as a `kb_crawl`
 * scheduled job (lib/scheduler/handlers/kb_crawl.ts); this reports which stage
 * it's on so the UI can show a real checklist instead of an indeterminate
 * spinner.
 *
 * Deliberately derives stage from EXISTING columns — the AiDocument row plus
 * its embedding count — rather than a new progress table, so this needed no
 * migration against a production database holding live customer data.
 *
 * Stages: queued → crawling → indexing → done | failed
 */

export type KbCrawlStage = "queued" | "crawling" | "indexing" | "done" | "failed";

export async function GET(req: NextRequest) {
  const documentId = req.nextUrl.searchParams.get("documentId");
  if (!documentId || !/^[0-9a-f-]{36}$/i.test(documentId)) {
    return NextResponse.json({ error: "bad_document_id" }, { status: 400 });
  }

  let orgId: string;
  try {
    ({ orgId } = await getOrgContext());
  } catch {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const doc = await withTenant(orgId, (tx) =>
    tx.aiDocument.findFirst({
      where: { id: documentId },
      select: {
        id: true,
        title: true,
        status: true,
        content: true,
        lastIndexedAt: true,
        _count: { select: { embeddings: true } },
      },
    }),
  ).catch(() => null);

  if (!doc) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // `content` doubles as the failure reason when status is "failed" (the job
  // writes a user-facing sentence there), so it can be shown verbatim.
  const chunks = doc._count.embeddings;
  let stage: KbCrawlStage;
  if (doc.status === "failed") stage = "failed";
  else if (doc.status === "indexed") stage = "done";
  else if (chunks > 0) stage = "indexing";
  else if (doc.content && doc.content.length > 40) stage = "indexing";
  else stage = "crawling";

  return NextResponse.json({
    documentId: doc.id,
    title: doc.title,
    stage,
    chunks,
    // Only meaningful on failure; the UI shows it as the reason.
    message: doc.status === "failed" ? doc.content : null,
    finishedAt: doc.lastIndexedAt?.toISOString() ?? null,
  });
}
