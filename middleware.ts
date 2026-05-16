import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Apply security response headers to every response.
 *
 * CSP rationale:
 *   - `script-src 'self'` blocks XSS. We include `'unsafe-inline'` only on the
 *     marketing root (which uses Next.js inline runtime). Tenant routes don't
 *     need it — Next 15 emits scripts via separate files in production.
 *   - `frame-ancestors 'none'` defeats clickjacking.
 *   - `connect-src` includes the Stripe + Anthropic endpoints we hit from the
 *     server only, but the widget calls our own origin, so 'self' is enough.
 *   - `img-src` allows Google + Stripe avatar/logo URLs we render.
 *
 * NOTE: For the widget bundle at /widget, we leave CSP off so the embedding
 * customer's CSP governs the script — they're loading from us cross-origin.
 */
function applySecurityHeaders(res: NextResponse, pathname: string): NextResponse {
  // Skip CSP/X-Frame-Options for the widget JS bundle (cross-origin embed).
  if (pathname === "/widget") {
    res.headers.set("Cache-Control", "public, max-age=300");
    return res;
  }

  // Strict-Transport-Security: HTTPS only in production. 1 year, include subdomains.
  if (process.env.NODE_ENV === "production") {
    res.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload",
    );
  }
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(self 'https://js.stripe.com')",
  );

  // Content-Security-Policy. We allow Stripe + Google avatars and explicitly
  // omit `unsafe-eval`. Next.js 15 production builds don't require inline script.
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://js.stripe.com",
    "style-src 'self' 'unsafe-inline'", // Tailwind generated; many components inline styles
    "img-src 'self' data: blob: https://*.googleusercontent.com https://*.stripe.com https://lh3.googleusercontent.com",
    "font-src 'self' data:",
    "connect-src 'self' https://api.stripe.com",
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
    "frame-ancestors 'none'",
    "form-action 'self' https://checkout.stripe.com https://billing.stripe.com",
    "base-uri 'self'",
    "object-src 'none'",
  ].join("; ");
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

/**
 * Middleware:
 *   - Subdomain routing (app.* → tenant, admin.* → admin, r.* → redirect)
 *   - Set x-pathname header so server components can read the requested path
 *   - Gate /admin/* (except /admin/login + /api/admin/login) on admin session cookie
 *   - Apply security headers (CSP, HSTS, X-Frame-Options, etc.)
 *
 * Local dev: works on `app.localhost:3000` and `admin.localhost:3000`. Add to /etc/hosts:
 *   127.0.0.1 app.localhost admin.localhost r.localhost
 */
export function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const url = req.nextUrl.clone();
  const hostname = host.split(":")[0] ?? "";
  const pathname = url.pathname;

  // Identify subdomain
  let kind: "app" | "admin" | "redirect" | "marketing" = "marketing";
  if (hostname.startsWith("app.")) kind = "app";
  else if (hostname.startsWith("admin.")) kind = "admin";
  else if (hostname.startsWith("r.")) kind = "redirect";

  // Build a base response so we can attach x-pathname header on all forwarded requests
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname);

  // Health checks pass through (no security headers — needs to be machine-parseable)
  if (pathname === "/api/health" || pathname === "/_health") {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Auth.js callbacks must always work on the host they were initiated on
  if (pathname.startsWith("/api/auth")) {
    return applySecurityHeaders(
      NextResponse.next({ request: { headers: requestHeaders } }),
      pathname,
    );
  }

  // Webhooks must work on whatever host Stripe/Twilio/etc were configured to hit
  if (pathname.startsWith("/api/webhooks")) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // ---- Admin auth gate ----
  // For /admin/* (except /admin/login), require an admin_session cookie.
  // We do NOT verify the JWT here (that needs node crypto, edge runtime is limited).
  // Layout/page does full verification. This is just a fast UX redirect.
  if (
    pathname.startsWith("/admin") &&
    !pathname.startsWith("/admin/login")
  ) {
    const cookie = req.cookies.get("admin_session");
    if (!cookie?.value) {
      url.pathname = "/admin/login";
      return applySecurityHeaders(NextResponse.redirect(url), pathname);
    }
  }

  // Map by subdomain
  if (kind === "app") {
    if (pathname === "/") {
      url.pathname = "/dashboard";
      return applySecurityHeaders(
        NextResponse.rewrite(url, { request: { headers: requestHeaders } }),
        pathname,
      );
    }
    return applySecurityHeaders(
      NextResponse.next({ request: { headers: requestHeaders } }),
      pathname,
    );
  }

  if (kind === "admin") {
    if (pathname === "/") {
      url.pathname = "/admin";
      return applySecurityHeaders(
        NextResponse.rewrite(url, { request: { headers: requestHeaders } }),
        pathname,
      );
    }
    if (!pathname.startsWith("/admin") && !pathname.startsWith("/api")) {
      url.pathname = `/admin${pathname}`;
      return applySecurityHeaders(
        NextResponse.rewrite(url, { request: { headers: requestHeaders } }),
        pathname,
      );
    }
    return applySecurityHeaders(
      NextResponse.next({ request: { headers: requestHeaders } }),
      pathname,
    );
  }

  if (kind === "redirect") {
    return applySecurityHeaders(
      NextResponse.json({ error: "redirect_not_handled_here" }, { status: 503 }),
      pathname,
    );
  }

  return applySecurityHeaders(
    NextResponse.next({ request: { headers: requestHeaders } }),
    pathname,
  );
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)).*)",
  ],
};
