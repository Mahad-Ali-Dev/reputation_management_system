/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Build output dir. Defaults to ".next"; override via NEXT_DIST_DIR so multiple
  // concurrent `next dev` instances (e.g. parallel screenshot/verification jobs)
  // each get an ISOLATED build dir and can't corrupt each other's manifests.
  // No effect on normal dev/prod (env unset → ".next").
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Force-inline these env vars into EVERY bundle (server + client + RSC) via
  // webpack DefinePlugin. Next.js's `env` field alone didn't reliably reach
  // next-auth's internal module which has a literal `S(process.env.NEXTAUTH_URL)`
  // call that needs to be replaced at build time.
  //
  // Falls back to "https://repulabs.com" if build env doesn't have the value,
  // so prod builds always end up with the correct production URL baked in.
  webpack: (config, { webpack }) => {
    const authBaseUrl =
      process.env.NEXTAUTH_URL ||
      process.env.AUTH_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://repulabs.com";
    config.plugins.push(
      new webpack.DefinePlugin({
        "process.env.NEXTAUTH_URL": JSON.stringify(authBaseUrl),
        "process.env.AUTH_URL": JSON.stringify(authBaseUrl),
        "process.env.NEXTAUTH_URL_INTERNAL": JSON.stringify(authBaseUrl),
      }),
    );
    return config;
  },
  // archiver@7 is CJS (`module.exports = factory`). Next 15's webpack stumbles
  // when trying to ESM-interop it, so opt out of bundling and let Node's
  // `require()` load it at runtime. Add any other CJS-only Node-native
  // package that misbehaves under bundling to this list.
  //
  // Critical: do NOT upgrade archiver to v8. v8 is a pure-ESM rewrite that
  // replaces the factory with `new ZipArchive(...)`, ships zero TS types,
  // and breaks every call site in this codebase.
  // `unpdf` bundles a pdf.js worker that webpack mis-traces; opt it out so Next
  // ships it as a runtime require (KB PDF extraction — lib/ai/pdf-extract.ts).
  serverExternalPackages: ["archiver", "unpdf"],
  experimental: {
    serverActions: {
      // Must comfortably exceed the 8 MB KB-PDF cap (lib/ai/actions.ts) —
      // at 2mb the framework 413'd big uploads BEFORE the action could return
      // its friendly "PDF too large" error, crashing the /ai page (bug 009).
      bodySizeLimit: "10mb",
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
      // Google sign-in is a <form action={serverAction}> POST that answers with a
      // redirect to accounts.google.com. WebKit and Firefox enforce form-action
      // against the REDIRECT target; Chrome only checks the form's initial
      // target. So 'self' alone let Google login work in Chrome while Safari
      // blocked the navigation silently. Listing the authorization endpoint
      // fixes Safari without loosening anything else -- the OAuth "connect an
      // account" flows are plain <a href> GETs, which form-action never covers.
      "form-action 'self' https://accounts.google.com",
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
