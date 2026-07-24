import type { NextRequest } from "next/server";

/**
 * The public origin to build post-OAuth redirects from.
 *
 * THE BUG THIS FIXES: behind nginx, `NextRequest.url` carries the
 * proxy-internal host (`localhost:3000`), because Next sees the Host header of
 * the upstream connection, not the original request. So
 * `new URL("/connections", req.url)` sends a customer to
 * `https://localhost:3000/connections` right after a SUCCESSFUL OAuth connect —
 * the connection is saved, but the browser lands on "site can't be reached".
 *
 * Resolution order:
 *   1. NEXT_PUBLIC_APP_URL — the configured public origin (set in prod, and set
 *      to http://localhost:3000 in local dev, so both are correct).
 *   2. X-Forwarded-Host / -Proto — the real host nginx forwards.
 *   3. req.url — correct only when nothing is proxied (bare local dev).
 *
 * Use as the base for every post-callback redirect:
 *   NextResponse.redirect(new URL("/connections?connected=x", oauthBase(req)))
 */
/**
 * The configured public origin with any trailing slash(es) removed — the ONE
 * correct base for building an OAuth `redirect_uri`.
 *
 * Why this matters: `redirect_uri` must match byte-for-byte across three places
 * — the authorize request, the token-exchange (callback) request, and the URI
 * registered in the provider's console. If `NEXT_PUBLIC_APP_URL` is set with a
 * trailing slash (e.g. `https://repulabs.com/`), the naive
 * `` `${url}/api/connections/...` `` produced a DOUBLE slash
 * (`https://repulabs.com//api/...`) that no registered URI matches, so Google
 * answered with "Access blocked / redirect_uri_mismatch". Always build callback
 * URLs from this helper.
 */
export function publicAppOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

/** The exact registered callback URL for a given connection provider. */
export function oauthCallbackUrl(provider: string): string {
  return `${publicAppOrigin()}/api/connections/${provider}/callback`;
}

export function oauthBase(req: NextRequest | Request): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl) return envUrl.replace(/\/+$/, "");

  const fwHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const fwProto = req.headers.get("x-forwarded-proto") ?? "https";
  if (fwHost) return `${fwProto}://${fwHost}`;

  try {
    return new URL(req.url).origin;
  } catch {
    return "http://localhost:3000";
  }
}
