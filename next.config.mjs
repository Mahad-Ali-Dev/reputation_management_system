/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // archiver@7 is CJS (`module.exports = factory`). Next 15's webpack stumbles
  // when trying to ESM-interop it, so opt out of bundling and let Node's
  // `require()` load it at runtime. Add any other CJS-only Node-native
  // package that misbehaves under bundling to this list.
  //
  // Critical: do NOT upgrade archiver to v8. v8 is a pure-ESM rewrite that
  // replaces the factory with `new ZipArchive(...)`, ships zero TS types,
  // and breaks every call site in this codebase.
  serverExternalPackages: ["archiver"],
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  // Force route handlers for /api/webhooks/* to use Node runtime (Stripe SDK + crypto)
  // Pages can stay on edge by default.
  async headers() {
    // Tight defaults — Next.js needs 'unsafe-inline' for streaming RSC payloads
    // and 'unsafe-eval' for dev mode. In production this CSP allows scripts only
    // from self + the explicit external CDNs we actually use.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://api.stripe.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https:",
      "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
      "connect-src 'self' https://api.stripe.com https://api.anthropic.com https://*.googleapis.com",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join("; ");

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "geolocation=(), camera=(), microphone=(self), payment=(self)",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
      {
        // QR redirect endpoint should be embeddable (e.g. in app webviews)
        source: "/r/:slug",
        headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
    ];
  },
};

export default nextConfig;
