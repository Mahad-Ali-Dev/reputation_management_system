import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import {
  contentTypeFor,
  etagFor,
  localUploadRoot,
  resolveWithinRoot,
} from "@/lib/uploads/local-store";
import { NextResponse } from "next/server";

/**
 * Serves files written by the self-hosted upload store (`UPLOAD_DIR`).
 *
 * Next's `public/` can't do this — it's baked at build time and never sees
 * runtime writes — so uploaded media needs a route.
 *
 * PUBLIC BY DESIGN. Facebook and LinkedIn fetch post images from their own
 * servers with no session, so these URLs must work unauthenticated, exactly like
 * the cloud-bucket URLs they replace. Names carry 8 random bytes, so a path is
 * unguessable, but treat this as public storage: never put anything here that
 * shouldn't be world-readable.
 */

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const root = localUploadRoot();
  if (!root) return new NextResponse("Not found", { status: 404 });

  const { path } = await ctx.params;
  const pathname = (path ?? []).join("/");
  if (!pathname) return new NextResponse("Not found", { status: 404 });

  // Refuse anything resolving outside the root (`../` traversal).
  const full = resolveWithinRoot(root, pathname);
  if (!full) return new NextResponse("Not found", { status: 404 });

  let size: number;
  try {
    const info = await stat(full);
    if (!info.isFile()) return new NextResponse("Not found", { status: 404 });
    size = info.size;
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  // Stored files are immutable (random prefix per upload), so a matching ETag
  // can always be answered with a 304.
  const etag = etagFor(pathname);
  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }

  const stream = Readable.toWeb(createReadStream(full)) as ReadableStream;
  return new NextResponse(stream, {
    headers: {
      "Content-Type": contentTypeFor(pathname),
      "Content-Length": String(size),
      ETag: etag,
      "Cache-Control": "public, max-age=31536000, immutable",
      // Belt-and-braces against a stored file being sniffed into something
      // executable — the extension allowlist already refuses to label unknown
      // types as anything renderable.
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; media-src 'self'",
    },
  });
}
