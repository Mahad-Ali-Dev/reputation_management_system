import { createHash, randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

/**
 * Self-hosted file storage — writes to a directory on the VPS instead of a
 * cloud bucket.
 *
 * WHY: this app runs on a plain VPS with its own disk. Reaching for Vercel Blob
 * meant an external account, an extra credential and a network hop purely to
 * store a logo. Set `UPLOAD_DIR` and files stay on the box.
 *
 * WHERE TO POINT IT: somewhere OUTSIDE the deploy checkout — `/var/lib/repulabs/uploads`,
 * not `/opt/repulabs/uploads`. A deploy that ever cleans the working tree would
 * take the uploads with it, and user media must outlive any single release.
 *
 * SERVING: files are served back by `app/api/media/[...path]`, not by Next's
 * `public/` (which is baked at build time and can't see runtime writes). The
 * returned URL is absolute, because Facebook and LinkedIn fetch it from their
 * own servers when publishing a post — a relative path would be unreachable.
 */

/** Configured root, or null when local storage isn't in use. */
export function localUploadRoot(): string | null {
  const dir = process.env.UPLOAD_DIR?.trim();
  return dir ? resolve(dir) : null;
}

export function isLocalUploadEnabled(): boolean {
  return localUploadRoot() !== null;
}

/** Keep a filename to characters that are safe in a path and a URL. */
function safeName(filename: string): string {
  const cleaned = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
  return cleaned || "file";
}

/**
 * Resolve a stored pathname against the root, refusing anything that escapes it.
 *
 * The pathname reaches this from a URL, so `../../etc/passwd` is the obvious
 * attack. Comparing the RESOLVED path against the root handles the encodings and
 * symlink-ish tricks that manual `..` stripping misses. Returns null on refusal.
 */
export function resolveWithinRoot(root: string, pathname: string): string | null {
  const full = resolve(join(root, pathname));
  // The trailing separator matters: without it `/data/uploads-evil` passes a
  // naive `startsWith("/data/uploads")`.
  if (full !== root && !full.startsWith(root + sep)) return null;
  return full;
}

/**
 * Write a buffer under `{orgId}/{context}/{random}-{filename}` and return its
 * public URL + the pathname used to delete it later.
 */
export async function saveLocalUpload(args: {
  root: string;
  orgId: string;
  context: string;
  buffer: Buffer;
  filename: string;
}): Promise<{ url: string; pathname: string }> {
  // Random prefix so two uploads of "logo.png" can't collide or overwrite.
  const unique = `${randomBytes(8).toString("hex")}-${safeName(args.filename)}`;
  const pathname = `${args.orgId}/${args.context}/${unique}`;

  const full = resolveWithinRoot(args.root, pathname);
  // orgId and context are server-supplied, so this is a guard against future
  // callers rather than the current ones.
  if (!full) throw new Error("upload_path_escapes_root");

  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, args.buffer);

  return { url: `${publicBase()}/api/media/${pathname}`, pathname };
}

export async function deleteLocalUpload(root: string, pathname: string): Promise<void> {
  const full = resolveWithinRoot(root, pathname);
  if (!full) return;
  await unlink(full).catch(() => {});
}

/** Absolute origin for stored files — must be publicly reachable. */
function publicBase(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

/** Weak ETag from the pathname — stored files are immutable (random prefix). */
export function etagFor(pathname: string): string {
  return `"${createHash("sha1").update(pathname).digest("hex").slice(0, 16)}"`;
}

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  mov: "video/quicktime",
  pdf: "application/pdf",
};

/**
 * Content type from the extension, defaulting to a NON-renderable type.
 *
 * `application/octet-stream` rather than a guess: an unknown file served as
 * something a browser will execute or render inline is how an upload endpoint
 * turns into stored XSS.
 */
export function contentTypeFor(pathname: string): string {
  const ext = pathname.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}
