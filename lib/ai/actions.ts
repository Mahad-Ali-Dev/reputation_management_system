"use server";

import { createHash, randomBytes } from "node:crypto";
import { crawlUrl } from "@/lib/ai/crawl";
import { ingestDocument } from "@/lib/ai/ingest";
import { extractPdfText } from "@/lib/ai/pdf-extract";
import { ForbiddenError, requireRole } from "@/lib/auth/rbac";
import { PlanInactiveError, assertEntitled } from "@/lib/billing/entitlements";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { assertRateLimit } from "@/lib/ratelimit";
import { schedule } from "@/lib/scheduler";
import { revalidatePath } from "next/cache";
import { z } from "zod";

/** 8 MB cap on uploaded PDFs (text extraction happens server-side). */
const MAX_PDF_BYTES = 8 * 1024 * 1024;

/**
 * Result contract for the KB ingest actions. They used to throw on every
 * failure (size, validation, entitlement, ingest), which — submitted from a
 * bare `<form action>` — crashed the whole /ai page with a digest in
 * production (bug 009 in the June 2026 assessment). The forms now render
 * these inline via `useActionState`.
 */
export type AiIngestResult = { ok: true; message?: string } | { ok: false; error: string };

/** Next.js control-flow errors (redirect/notFound) must propagate. */
function isNextControlFlowError(err: unknown): boolean {
  const digest = (err as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_");
}

function mapIngestError(err: unknown, event: string): AiIngestResult {
  if (err instanceof PlanInactiveError) {
    return { ok: false, error: "Knowledge-base indexing is a paid feature — upgrade to use it." };
  }
  if (err instanceof ForbiddenError) {
    return { ok: false, error: "Only managers and admins can change the knowledge base." };
  }
  const code = (err as { code?: string } | null)?.code;
  if (code === "P2021" || code === "P2022" || code === "42P01" || code === "42703") {
    return {
      ok: false,
      error:
        "The knowledge base isn't provisioned yet — ask your admin to apply the latest database migration.",
    };
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.startsWith("rate_limit")) {
    return { ok: false, error: "Too many imports in a short window — wait a minute and retry." };
  }
  logger.error({ event, error: msg });
  return { ok: false, error: "Something went wrong saving that document. Try again." };
}

const DocSchema = z.object({
  title: z.string().min(1).max(120),
  content: z.string().min(20).max(200_000),
  establishmentId: z.string().uuid().optional(),
});

const DocMetaSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  establishmentId: z.string().uuid().optional(),
});

function isPdf(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

/**
 * Plain-text uploads the KB can ingest by reading the bytes as UTF-8. The file
 * picker's `accept` (.txt/.md) is only a hint, so we re-check here and reject
 * anything else rather than ingest binary garbage as "text".
 */
function isTextFile(file: File): boolean {
  return (
    file.type.startsWith("text/") ||
    file.type === "application/json" ||
    /\.(txt|md|markdown|csv|json|log|text)$/i.test(file.name)
  );
}

/**
 * Upload (or replace) a knowledge-base document for the chatbot.
 * Accepts manual paste (the `content` field) OR a `.pdf` file (text-extracted
 * server-side via lib/ai/pdf-extract). Both feed the same chunk→embed pipeline.
 */
export async function uploadAiDocument(form: FormData): Promise<AiIngestResult> {
  try {
    const { orgId, userId } = await requireRole("manager");
    // Indexing is a paid AI feature — match the URL-crawl path's gating.
    await assertEntitled(orgId);

    const fileEntry = form.get("file");
    const hasFile = fileEntry instanceof File && fileEntry.size > 0;
    const hasPdf = hasFile && isPdf(fileEntry as File);

    let title: string;
    let content: string;
    let establishmentId: string | undefined;
    let sourceType: "manual" | "pdf";

    if (hasPdf) {
      const file = fileEntry as File;
      if (file.size > MAX_PDF_BYTES) {
        return {
          ok: false,
          error: `PDF too large (max ${Math.round(MAX_PDF_BYTES / 1024 / 1024)} MB).`,
        };
      }
      const meta = DocMetaSchema.safeParse({
        title: (form.get("title") as string) || undefined,
        establishmentId: form.get("establishmentId") || undefined,
      });
      if (!meta.success) {
        return {
          ok: false,
          error: `Validation: ${meta.error.issues.map((i) => i.message).join("; ")}`,
        };
      }
      const buf = Buffer.from(await file.arrayBuffer());
      const extracted = await extractPdfText(buf);
      if (extracted.trim().length < 20) {
        return {
          ok: false,
          error:
            "We couldn't extract readable text from that PDF (it may be scanned/image-only). Paste the text instead.",
        };
      }
      title = (meta.data.title ?? file.name.replace(/\.pdf$/i, "")).slice(0, 120) || "PDF document";
      content = extracted;
      establishmentId = meta.data.establishmentId;
      sourceType = "pdf";
    } else if (hasFile) {
      // Non-PDF file: the form accepts .txt/.md and promises "a file takes
      // priority over pasted content", so read the bytes as UTF-8 text. Before
      // this, any non-PDF file fell through to the textarea branch below and was
      // silently ignored (upload appeared to do nothing).
      const file = fileEntry as File;
      if (!isTextFile(file)) {
        return {
          ok: false,
          error: "Unsupported file type. Upload a PDF, .txt or .md file — or paste the text below.",
        };
      }
      if (file.size > MAX_PDF_BYTES) {
        return {
          ok: false,
          error: `File too large (max ${Math.round(MAX_PDF_BYTES / 1024 / 1024)} MB).`,
        };
      }
      const meta = DocMetaSchema.safeParse({
        title: (form.get("title") as string) || undefined,
        establishmentId: form.get("establishmentId") || undefined,
      });
      if (!meta.success) {
        return {
          ok: false,
          error: `Validation: ${meta.error.issues.map((i) => i.message).join("; ")}`,
        };
      }
      const raw = (await file.text()).trim();
      if (raw.length < 20) {
        return {
          ok: false,
          error: "That file has too little readable text to index (needs at least ~20 characters).",
        };
      }
      title =
        (meta.data.title ?? file.name.replace(/\.[^.]+$/, "")).slice(0, 120) || "Uploaded document";
      content = raw.slice(0, 200_000);
      establishmentId = meta.data.establishmentId;
      sourceType = "manual";
    } else {
      const parsed = DocSchema.safeParse({
        title: form.get("title"),
        content: form.get("content"),
        establishmentId: form.get("establishmentId") || undefined,
      });
      if (!parsed.success) {
        return {
          ok: false,
          error: `Check the form: ${parsed.error.issues.map((i) => `${i.path.join(".")} — ${i.message}`).join("; ")}`,
        };
      }
      title = parsed.data.title;
      content = parsed.data.content;
      establishmentId = parsed.data.establishmentId;
      sourceType = "manual";
    }

    const contentHash = createHash("sha256").update(content).digest("hex");

    // Create the doc (or replace existing one for the same establishment+title)
    const doc = await withTenant(orgId, async (tx) => {
      const existing = await tx.aiDocument.findFirst({
        where: {
          organizationId: orgId,
          establishmentId: establishmentId ?? null,
          title,
        },
      });
      if (existing) {
        return tx.aiDocument.update({
          where: { id: existing.id },
          data: { content, contentHash, sourceType, status: "indexing" },
        });
      }
      return tx.aiDocument.create({
        data: {
          organizationId: orgId,
          establishmentId: establishmentId ?? null,
          title,
          content,
          contentHash,
          sourceType,
          status: "indexing",
        },
      });
    });

    // Run ingestion (chunk + embed + insert). This is synchronous in v1; queue it Day 10+.
    try {
      await ingestDocument({
        documentId: doc.id,
        organizationId: orgId,
        establishmentId: establishmentId ?? null,
        content,
      });
    } catch (err) {
      logger.error(
        { docId: doc.id, error: String(err), event: "ai.ingest.failed" },
        "AI document ingestion failed",
      );
      revalidatePath("/ai");
      return {
        ok: false,
        error:
          "The document was saved but indexing failed, so it isn't searchable yet. Check the AI/embedding keys and re-upload to retry.",
      };
    }

    await withTenant(orgId, async (tx) => {
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorType: "user",
          actorId: userId,
          action: "ai.document.uploaded",
          resourceType: "ai_document",
          resourceId: doc.id,
          afterData: { title, length: content.length },
        },
      });
    });

    revalidatePath("/ai");
    return { ok: true, message: `"${title}" indexed.` };
  } catch (err) {
    if (isNextControlFlowError(err)) throw err;
    return mapIngestError(err, "ai.upload.failed");
  }
}

const UrlIngestSchema = z.object({
  url: z.string().url().max(2048),
  title: z.string().min(1).max(120),
  establishmentId: z.string().uuid().optional(),
});

/**
 * Crawl a URL, extract text, then run the same chunk → embed pipeline as manual uploads.
 * SSRF protections live in lib/ai/crawl.ts (private-IP blocks, size cap, robots.txt).
 */
export async function ingestAiDocumentFromUrl(form: FormData): Promise<AiIngestResult> {
  try {
    const { orgId, userId } = await requireRole("manager");
    // URL crawl + embedding is a paid AI feature.
    await assertEntitled(orgId);

    // Rate limit before any external fetch
    await assertRateLimit("url_crawl", orgId);

    const parsed = UrlIngestSchema.safeParse({
      url: form.get("url"),
      title: form.get("title"),
      establishmentId: form.get("establishmentId") || undefined,
    });
    if (!parsed.success) {
      return {
        ok: false,
        error: `Validation: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
      };
    }
    const { url, title, establishmentId } = parsed.data;

    const crawl = await crawlUrl(url);
    if ("error" in crawl) {
      return {
        ok: false,
        error: `URL crawl failed: ${crawl.error}${crawl.details ? ` (${crawl.details})` : ""}`,
      };
    }
    const { result } = crawl;

    if (result.text.length < 20) {
      return { ok: false, error: "Crawled page had no usable text after stripping HTML." };
    }
    if (result.text.length > 200_000) {
      return { ok: false, error: "Crawled page is too large (>200K chars). Use a smaller URL." };
    }

    const contentHash = createHash("sha256").update(result.text).digest("hex");

    const doc = await withTenant(orgId, async (tx) => {
      const existing = await tx.aiDocument.findFirst({
        where: {
          organizationId: orgId,
          establishmentId: establishmentId ?? null,
          title,
        },
      });
      if (existing) {
        return tx.aiDocument.update({
          where: { id: existing.id },
          data: {
            content: result.text,
            contentHash,
            sourceType: "url",
            sourceUri: result.finalUrl,
            sourceMetadata: {
              fetchedAt: result.fetchedAt.toISOString(),
              contentType: result.contentType,
              bytes: result.bytes,
            },
            status: "indexing",
          },
        });
      }
      return tx.aiDocument.create({
        data: {
          organizationId: orgId,
          establishmentId: establishmentId ?? null,
          title,
          content: result.text,
          contentHash,
          sourceType: "url",
          sourceUri: result.finalUrl,
          sourceMetadata: {
            fetchedAt: result.fetchedAt.toISOString(),
            contentType: result.contentType,
            bytes: result.bytes,
          },
          status: "indexing",
        },
      });
    });

    try {
      await ingestDocument({
        documentId: doc.id,
        organizationId: orgId,
        establishmentId: establishmentId ?? null,
        content: result.text,
      });
    } catch (err) {
      logger.error(
        { docId: doc.id, error: String(err), event: "ai.url_ingest.failed" },
        "URL ingestion failed",
      );
      revalidatePath("/ai");
      return {
        ok: false,
        error:
          "The page was crawled but indexing failed, so it isn't searchable yet. Check the AI/embedding keys and retry.",
      };
    }

    await withTenant(orgId, async (tx) => {
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorType: "user",
          actorId: userId,
          action: "ai.document.url_ingested",
          resourceType: "ai_document",
          resourceId: doc.id,
          afterData: { title, url: result.finalUrl, bytes: result.bytes },
        },
      });
    });

    revalidatePath("/ai");
    return { ok: true, message: `"${title}" crawled and indexed.` };
  } catch (err) {
    if (isNextControlFlowError(err)) throw err;
    return mapIngestError(err, "ai.url_ingest.failed");
  }
}

export async function deleteAiDocument(documentId: string): Promise<void> {
  const { orgId, userId } = await requireRole("manager");
  await withTenant(orgId, async (tx) => {
    await tx.aiDocument.delete({ where: { id: documentId } });
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "ai.document.deleted",
        resourceType: "ai_document",
        resourceId: documentId,
      },
    });
  });
  revalidatePath("/ai");
}

/**
 * Create a widget key for the chatbot embed.
 * Each org can have multiple keys (e.g., one per public-facing site).
 */
const WidgetSchema = z.object({
  establishmentId: z.string().uuid().optional(),
  originAllowlist: z.string().max(2000).optional(), // comma-separated origins
});

export async function createWidgetKey(form: FormData): Promise<void> {
  const { orgId, userId } = await requireRole("manager");

  const parsed = WidgetSchema.safeParse({
    establishmentId: form.get("establishmentId") || undefined,
    originAllowlist: form.get("originAllowlist") || undefined,
  });
  if (!parsed.success) {
    throw new Error("invalid_input");
  }

  const origins = (parsed.data.originAllowlist ?? "")
    .split(/[,\s]+/)
    .map((o) => o.trim())
    .filter((o) => o.length > 0 && /^https?:\/\//.test(o));

  const publicKey = `wk_${randomBytes(16).toString("base64url")}`;
  const hmacSecret = randomBytes(32).toString("base64url");

  await withTenant(orgId, async (tx) => {
    const created = await tx.widgetKey.create({
      data: {
        organizationId: orgId,
        establishmentId: parsed.data.establishmentId ?? null,
        publicKey,
        hmacSecret,
        originAllowlist: origins,
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "ai.widget_key.created",
        resourceType: "widget_key",
        resourceId: created.id,
        afterData: { origins },
      },
    });
  });

  revalidatePath("/ai");
}

export async function revokeWidgetKey(keyId: string): Promise<void> {
  const { orgId, userId } = await requireRole("manager");
  await withTenant(orgId, async (tx) => {
    await tx.widgetKey.update({
      where: { id: keyId },
      data: { status: "revoked" },
    });
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "ai.widget_key.revoked",
        resourceType: "widget_key",
        resourceId: keyId,
      },
    });
  });
  revalidatePath("/ai");
}

// ---------------------------------------------------------------------------
// Connect Website — background crawl
// ---------------------------------------------------------------------------

const ConnectSiteSchema = z.object({
  businessName: z.string().min(1).max(120),
  url: z.string().url().max(500),
  establishmentId: z.string().uuid().optional(),
});

export type ConnectSiteResult = { ok: true; documentId: string } | { ok: false; error: string };

/**
 * Start a website crawl in the BACKGROUND and return immediately with the
 * document id the UI polls (/api/ai/kb-crawl-status).
 *
 * Differs from `ingestAiDocumentFromUrl`, which crawls + embeds inline: that
 * blocks the request for the whole job, loses the work on a refresh, and can
 * exceed the request timeout on a slow site. Here we only create the row and
 * enqueue `kb_crawl`; the dispatcher does the work.
 */
export async function connectWebsite(form: FormData): Promise<ConnectSiteResult> {
  try {
    const { orgId } = await requireRole("manager");
    await assertEntitled(orgId);
    await assertRateLimit("url_crawl", orgId);

    const parsed = ConnectSiteSchema.safeParse({
      businessName: form.get("businessName"),
      url: form.get("url"),
      establishmentId: (form.get("establishmentId") as string) || undefined,
    });
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Check the business name and website URL.",
      };
    }
    const { businessName, url, establishmentId } = parsed.data;

    // Create the placeholder row the job fills in. `content` starts empty and
    // becomes either the page text or a user-facing failure reason.
    const doc = await withTenant(orgId, (tx) =>
      tx.aiDocument.create({
        data: {
          organizationId: orgId,
          establishmentId: establishmentId ?? null,
          title: businessName,
          sourceType: "url",
          sourceUri: url,
          content: "",
          contentHash: createHash("sha256").update(`${url}:pending`).digest("hex"),
          status: "indexing",
        },
        select: { id: true },
      }),
    );

    await schedule({
      orgId,
      kind: "kb_crawl",
      runAt: new Date(),
      payload: { documentId: doc.id, url, establishmentId: establishmentId ?? null },
      // One crawl per document — a double-submit reuses the queued job.
      dedupeKey: `kb_crawl:${doc.id}`,
    });

    revalidatePath("/ai");
    return { ok: true, documentId: doc.id };
  } catch (err) {
    if (isNextControlFlowError(err)) throw err;
    const mapped = mapIngestError(err, "ai.connect_website_failed");
    return { ok: false, error: mapped.ok ? "Couldn't start the crawl." : mapped.error };
  }
}
