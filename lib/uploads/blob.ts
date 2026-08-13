/**
 * File upload pipeline using Vercel Blob.
 *
 * Pattern:
 *   1. Client posts file → server action validates MIME type + size
 *   2. Server gets a signed upload URL via @vercel/blob
 *   3. Client uploads directly to Vercel CDN (zero proxy through us)
 *   4. URL stored in DB
 *
 * Allowed contexts (all enforced server-side):
 *   - "org_logo"           — 5 MB, image/png|jpeg|webp (SVG REMOVED — XSS risk)
 *   - "establishment_image" — 5 MB, image only
 *   - "social_post_media"   — 50 MB, image or video
 *   - "email_template_logo" — 2 MB, image only (SVG REMOVED — XSS risk)
 *   - "survey_template_logo" — 2 MB, image only (SVG REMOVED — XSS risk)
 *
 * SECURITY: SVG was previously allowed on logos. SVG is XML and can embed
 * <script> + JS event handlers; when served from our Blob CDN on the same
 * registrable domain (or just opened in a new tab), that script runs with
 * access to the user's session. Use PNG/JPEG/WebP. If a customer needs vector
 * crispness, recommend a high-DPI PNG export.
 *
 * If VERCEL_BLOB_READ_WRITE_TOKEN is not set (local dev without Blob), the
 * fallback returns a data: URL so the UI still works in development.
 */

import { logger } from "@/lib/logger";
import { del, put } from "@vercel/blob";
import { z } from "zod";

const UPLOAD_CONTEXTS = {
  org_logo: { maxBytes: 5 * 1024 * 1024, mimes: ["image/png", "image/jpeg", "image/webp"] },
  establishment_image: {
    maxBytes: 5 * 1024 * 1024,
    mimes: ["image/png", "image/jpeg", "image/webp"],
  },
  social_post_media: {
    maxBytes: 50 * 1024 * 1024,
    mimes: ["image/png", "image/jpeg", "image/webp", "video/mp4", "video/quicktime"],
  },
  // Content Library accepts the same image+video set as a social media upload.
  content_library: {
    maxBytes: 50 * 1024 * 1024,
    mimes: ["image/png", "image/jpeg", "image/webp", "video/mp4", "video/quicktime"],
  },
  // AI-generated creatives are images only, smaller cap.
  ai_creative: { maxBytes: 10 * 1024 * 1024, mimes: ["image/png", "image/jpeg", "image/webp"] },
  email_template_logo: {
    maxBytes: 2 * 1024 * 1024,
    mimes: ["image/png", "image/jpeg", "image/webp"],
  },
  survey_template_logo: {
    maxBytes: 2 * 1024 * 1024,
    mimes: ["image/png", "image/jpeg", "image/webp"],
  },
} as const;

export type UploadContext = keyof typeof UPLOAD_CONTEXTS;

export const UploadInputSchema = z.object({
  context: z.enum(Object.keys(UPLOAD_CONTEXTS) as [UploadContext, ...UploadContext[]]),
  mimeType: z.string().min(1).max(80),
  sizeBytes: z.number().int().positive(),
  filename: z.string().max(200).optional(),
});

export function isUploadAllowed(args: {
  context: UploadContext;
  mimeType: string;
  sizeBytes: number;
}): {
  ok: boolean;
  reason?: string;
} {
  const cfg = UPLOAD_CONTEXTS[args.context];
  if (!cfg) return { ok: false, reason: "unknown_context" };
  if (args.sizeBytes > cfg.maxBytes) {
    return { ok: false, reason: `file_too_large_max_${cfg.maxBytes}_bytes` };
  }
  if (!(cfg.mimes as readonly string[]).includes(args.mimeType.toLowerCase())) {
    return { ok: false, reason: `mime_type_not_allowed_for_${args.context}` };
  }
  return { ok: true };
}

/**
 * Verify a file's leading magic bytes are consistent with its DECLARED MIME type.
 * Defense against polyglot / mislabeled uploads (e.g. a script claiming image/png),
 * which Vercel Blob would otherwise store + serve with a trusted content-type.
 * Unknown declared types are already rejected by isUploadAllowed → default true.
 */
function magicBytesMatchMime(buffer: Buffer, declaredMime: string): boolean {
  if (buffer.byteLength < 12) return false;
  const b = buffer;
  const png = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  const jpeg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const webp =
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50;
  const ftyp = b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70; // mp4 / mov
  switch (declaredMime.toLowerCase()) {
    case "image/png":
      return png;
    case "image/jpeg":
      return jpeg;
    case "image/webp":
      return webp;
    case "video/mp4":
    case "video/quicktime":
      return ftyp;
    default:
      return true;
  }
}

/**
 * Upload a file (Buffer) to Vercel Blob and return the public URL.
 *
 * Path is namespaced by org + context to keep things organized + auditable:
 *   `{orgId}/{context}/{random-id}-{filename}`
 */
export async function uploadToBlob(args: {
  orgId: string;
  context: UploadContext;
  buffer: Buffer;
  mimeType: string;
  filename: string;
}): Promise<{ url: string; pathname: string }> {
  const validation = isUploadAllowed({
    context: args.context,
    mimeType: args.mimeType,
    sizeBytes: args.buffer.byteLength,
  });
  if (!validation.ok) throw new Error(validation.reason);

  // Content sniff: bytes must match the DECLARED type so a polyglot / mislabeled file
  // can't be stored + served with a trusted content-type.
  if (!magicBytesMatchMime(args.buffer, args.mimeType)) {
    throw new Error("file_content_does_not_match_declared_type");
  }

  // DEV-ONLY fallback: with no Blob token, hand back a data: URL so local work
  // doesn't need cloud storage.
  //
  // In production this is a trap, so it says so loudly. The upload appears to
  // succeed and the image renders in our own UI, but the URL is a multi-megabyte
  // base64 blob that (a) gets stored in the DB row, (b) can't be fetched by
  // Facebook/LinkedIn when publishing, and (c) is stripped by Gmail and Outlook
  // when it lands in an email `<img src>` — so a logo uploaded this way silently
  // disappears from every branded email we send.
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    if (process.env.NODE_ENV === "production") {
      warnNoBlobToken(args.context);
    }
    const dataUrl = `data:${args.mimeType};base64,${args.buffer.toString("base64")}`;
    return { url: dataUrl, pathname: `dev-fallback/${args.filename}` };
  }

  const safeName = args.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
  const pathname = `${args.orgId}/${args.context}/${safeName}`;

  const result = await put(pathname, args.buffer, {
    access: "public",
    contentType: args.mimeType,
    addRandomSuffix: true,
  });

  return { url: result.url, pathname: result.pathname };
}

/** Warn once per context per process — this fires on every upload otherwise. */
const _warnedContexts = new Set<string>();
function warnNoBlobToken(context: string): void {
  if (_warnedContexts.has(context)) return;
  _warnedContexts.add(context);
  logger.error(
    { context, event: "uploads.blob.missing_token" },
    "BLOB_READ_WRITE_TOKEN is not set — uploads are falling back to data: URLs, which cannot be published to social platforms or rendered in email",
  );
}

/**
 * Delete a file by its pathname (from `uploadToBlob`).
 * No-op if running in dev fallback (data: URLs aren't deletable).
 */
export async function deleteFromBlob(pathname: string): Promise<void> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return;
  if (pathname.startsWith("dev-fallback/")) return;
  await del(pathname);
}
