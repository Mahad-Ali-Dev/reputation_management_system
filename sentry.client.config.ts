import * as Sentry from "@sentry/nextjs";

/**
 * Client-side Sentry init.
 *
 * Captures unhandled errors + tracing for user-facing routes.
 * No-op if SENTRY_DSN isn't set (so local dev doesn't ping Sentry).
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    // Trace 10% of requests in production; 100% in preview/dev for full visibility.
    // Production is detected via NEXT_PUBLIC_VERCEL_ENV (Vercel) or NODE_ENV
    // (Hostinger / self-hosted).
    tracesSampleRate:
      process.env.NEXT_PUBLIC_VERCEL_ENV === "production" || process.env.NODE_ENV === "production"
        ? 0.1
        : 1.0,
    // Replay only when a session has an error (cheaper than full session replay)
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0,
    // Strip query strings + hashes from URLs to avoid logging tokens in URLs
    beforeSend(event) {
      if (event.request?.url) {
        try {
          const u = new URL(event.request.url);
          u.search = "";
          u.hash = "";
          event.request.url = u.toString();
        } catch {}
      }
      return event;
    },
  });
}
