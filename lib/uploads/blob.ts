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

import { put, del } from "@vercel/blob";
import { z } from "zod";

const UPLOAD_CONTEXTS = {
  org_logo:               { maxBytes: 5 * 1024 * 1024,  mimes: ["image/png", "image/jpeg", "image/webp"] },
  establishment_image:    { maxBytes: 5 * 1024 * 1024,  mimes: ["image/png", "image/jpeg", "image/webp"] },
  social_post_media:      { maxBytes: 50 * 1024 * 1024, mimes: ["image/png", "image/jpeg", "image/webp", "video/mp4", "video/quicktime"] },
  // Content Library accepts the same image+video set as a social media upload.
  content_library:        { maxBytes: 50 * 1024 * 1024, mimes: ["image/png", "image/jpeg", "image/webp", "video/mp4", "video/quicktime"] },
  // AI-generated creatives are images only, smaller cap.
  ai_creative:            { maxBytes: 10 * 1024 * 1024, mimes: ["image/png", "image/jpeg", "image/webp"] },
  email_template_logo:    { maxBytes: 2 * 1024 * 1024,  mimes: ["image/png", "image/jpeg", "image/webp"] },
  survey_template_logo:   { maxBytes: 2 * 1024 * 1024,  mimes: ["image/png", "image/jpeg", "image/webp"] },
} as const;

export type UploadContext = keyof typeof UPLOAD_CONTEXTS;

export const UploadInputSchema = z.object({
  context: z.enum(Object.keys(UPLOAD_CONTEXTS) as [UploadContext, ...UploadContext[]]),
  mimeType: z.string().min(1).max(80),
  sizeBytes: z.number().int().positive(),
  filename: z.string().max(200).optional(),
});

export function isUploadAllowed(args: { context: UploadContext; mimeType: string; sizeBytes: number }): {
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

  // Dev fallback: when no Blob token, return data: URL
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
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

/**
 * Delete a file by its pathname (from `uploadToBlob`).
 * No-op if running in dev fallback (data: URLs aren't deletable).
 */
export async function deleteFromBlob(pathname: string): Promise<void> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return;
  if (pathname.startsWith("dev-fallback/")) return;
  await del(pathname);
}
