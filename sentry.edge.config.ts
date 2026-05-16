import * as Sentry from "@sentry/nextjs";

/**
 * Edge runtime Sentry init.
 *
 * Used by middleware + edge route handlers. Lighter init — no replay, no full
 * tracing (edge runtime has limited Node APIs).
 */
const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    tracesSampleRate: 0,
  });
}
