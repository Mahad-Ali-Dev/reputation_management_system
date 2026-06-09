"use server";

import { createHash, randomBytes } from "node:crypto";
import { crawlUrl } from "@/lib/ai/crawl";
import { ingestDocument } from "@/lib/ai/ingest";
import { extractPdfText } from "@/lib/ai/pdf-extract";
import { requireRole } from "@/lib/auth/rbac";
import { assertEntitled } from "@/lib/billing/entitlements";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { assertRateLimit } from "@/lib/ratelimit";
import { revalidatePath } from "next/cache";
import { z } from "zod";

/** 8 MB cap on uploaded PDFs (text extraction happens server-side). */
const MAX_PDF_BYTES = 8 * 1024 * 1024;

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
 * Upload (or replace) a knowledge-base document for the chatbot.
 * Accepts manual paste (the `content` field) OR a `.pdf` file (text-extracted
 * server-side via lib/ai/pdf-extract). Both feed the same chunk→embed pipeline.
 */
export async function uploadAiDocument(form: FormData): Promise<void> {
  const { orgId, userId } = await requireRole("manager");
  // Indexing is a paid AI feature — match the URL-crawl path's gating.
  await assertEntitled(orgId);

  const fileEntry = form.get("file");
  const hasPdf = fileEntry instanceof File && fileEntry.size > 0 && isPdf(fileEntry);

  let title: string;
  let content: string;
  let establishmentId: string | undefined;
  let sourceType: "manual" | "pdf";

  if (hasPdf) {
    const file = fileEntry as File;
    if (file.size > MAX_PDF_BYTES) {
      throw new Error(`PDF too large (max ${Math.round(MAX_PDF_BYTES / 1024 / 1024)} MB).`);
    }
    const meta = DocMetaSchema.safeParse({
      title: (form.get("title") as string) || undefined,
      establishmentId: form.get("establishmentId") || undefined,
    });
    if (!meta.success) {
      throw new Error(`Validation: ${meta.error.issues.map((i) => i.message).join("; ")}`);
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const extracted = await extractPdfText(buf);
    if (extracted.trim().length < 20) {
      throw new Error(
        "We couldn't extract readable text from that PDF (it may be scanned/image-only). Paste the text instead.",
      );
    }
    title = (meta.data.title ?? file.name.replace(/\.pdf$/i, "")).slice(0, 120) || "PDF document";
    content = extracted;
    establishmentId = meta.data.establishmentId;
    sourceType = "pdf";
  } else {
    const parsed = DocSchema.safeParse({
      title: form.get("title"),
      content: form.get("content"),
      establishmentId: form.get("establishmentId") || undefined,
    });
    if (!parsed.success) {
      throw new Error(`Validation: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
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
    throw err;
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
export async function ingestAiDocumentFromUrl(form: FormData): Promise<void> {
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
    throw new Error(`Validation: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }
  const { url, title, establishmentId } = parsed.data;

  const crawl = await crawlUrl(url);
  if ("error" in crawl) {
    throw new Error(
      `URL crawl failed: ${crawl.error}${crawl.details ? ` (${crawl.details})` : ""}`,
    );
  }
  const { result } = crawl;

  if (result.text.length < 20) {
    throw new Error("Crawled page had no usable text after stripping HTML.");
  }
  if (result.text.length > 200_000) {
    throw new Error("Crawled page is too large (>200K chars). Use a smaller URL.");
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
    throw err;
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
