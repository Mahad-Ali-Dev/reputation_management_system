import type { NextRequest } from "next/server";

/**
 * Build a public-facing URL for `path`, suitable for `NextResponse.redirect`.
 *
 * Why this exists: `new URL(path, req.url)` produces URLs based on Next.js's
 * internal binding address — behind Nginx that's `http://localhost:3000`, not
 * the public origin. A redirect built from `req.url` then sends the browser
 * to `http://localhost:3000/...`, which doesn't resolve on phones / external
 * networks. This was caught when a QR-scanned URL for an unactivated device
 * 302'd to `http://localhost:3000/not-activated`.
 *
 * Resolution order:
 *   1. `NEXT_PUBLIC_APP_URL` env var (most reliable — explicit configuration).
 *   2. `x-forwarded-host` + `x-forwarded-proto` (set by Nginx via
 *      `proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme;`).
 *   3. `host` header on the incoming request (assume https in prod).
 *   4. Hard-coded production fallback (last resort, should never hit).
 *
 * Always returns a URL using https in production unless the headers explicitly
 * say http.
 */
export function publicUrl(path: string, req?: NextRequest): URL {
  const envBase = process.env.NEXT_PUBLIC_APP_URL;
  if (envBase) {
    return new URL(path, envBase);
  }

  if (req) {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? null;
    if (host) {
      const proto =
        req.headers.get("x-forwarded-proto") ??
        (process.env.NODE_ENV === "production" ? "https" : "http");
      return new URL(path, `${proto}://${host}`);
    }
  }

  return new URL(path, "https://repulabs.com");
}
