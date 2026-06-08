import { auth } from "@/lib/auth/config";
import { logger } from "@/lib/logger";
import { isUploadAllowed, uploadToBlob, type UploadContext } from "@/lib/uploads/blob";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/uploads/social  (Module 10 — Social Studio)
 *
 * Media upload endpoint shared by:
 *   - the composer's drag-and-drop media zone   (context "social_post_media")
 *   - the Content Library uploader               (context "content_library")
 *
 * Authed via the app session cookie. Multipart form-data:
 *   file:    the binary
 *   context: "social_post_media" | "content_library"  (defaults to social_post_media)
 *
 * Validation + size caps live in `lib/uploads/blob.ts` (`isUploadAllowed`);
 * when no Blob token is set (local dev) `uploadToBlob` returns a `data:` URL so
 * the UI keeps working without a CDN.
 *
 * Returns `{ url, pathname, kind, mimeType, sizeBytes }`. The caller persists a
 * `ContentLibraryAsset` (or attaches the URL to the composer) — this endpoint
 * only puts the bytes and hands back the public URL.
 */

// Only the two image/video contexts may be reached from this endpoint — never
// the logo contexts (those have their own callers + tighter caps).
const ALLOWED_CONTEXTS: ReadonlySet<string> = new Set<UploadContext>([
  "social_post_media",
  "content_library",
]);

// Defensive ceiling so an oversized multipart body can't be buffered into
// memory before `isUploadAllowed` runs (it re-checks against the per-context
// cap, but this bounds the worst case for either context = 50 MB).
const MAX_BYTES = 50 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  const userId = session?.user?.id;
  if (!session || !orgId || !userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_form_data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }

  const rawContext = (form.get("context") as string) || "social_post_media";
  if (!ALLOWED_CONTEXTS.has(rawContext)) {
    return NextResponse.json({ error: "invalid_context" }, { status: 400 });
  }
  const context = rawContext as UploadContext;

  const mimeType = file.type || "application/octet-stream";
  const sizeBytes = file.size;

  if (sizeBytes <= 0) {
    return NextResponse.json({ error: "empty_file" }, { status: 400 });
  }
  if (sizeBytes > MAX_BYTES) {
    return NextResponse.json({ error: "file_too_large" }, { status: 413 });
  }

  // Pre-flight the per-context rules (type + cap) before reading bytes into a
  // Buffer so a disallowed type fails cheaply.
  const pre = isUploadAllowed({ context, mimeType, sizeBytes });
  if (!pre.ok) {
    return NextResponse.json({ error: pre.reason ?? "not_allowed" }, { status: 415 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { url, pathname } = await uploadToBlob({
      orgId,
      context,
      buffer,
      mimeType,
      filename: file.name || "upload",
    });

    const kind = mimeType.startsWith("video/") ? "video" : "image";
    return NextResponse.json({ url, pathname, kind, mimeType, sizeBytes });
  } catch (err) {
    logger.warn({
      orgId,
      context,
      error: err instanceof Error ? err.message : String(err),
      event: "uploads.social.failed",
    });
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }
}
