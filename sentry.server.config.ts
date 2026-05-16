import * as Sentry from "@sentry/nextjs";

/**
 * Server-side Sentry init.
 *
 * Captures errors in server actions, API routes, and React Server Components.
 * Coordinated with our existing Pino logger via `lib/logger.ts` — Pino remains
 * the structured-log source of truth; Sentry captures unhandled exceptions
 * for human triage.
 */
const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
const isProd = process.env.NODE_ENV === "production";
if (dsn) {
  Sentry.init({
    dsn,
    // Use VERCEL_ENV when present (Vercel deploys), otherwise NODE_ENV
    // (Hostinger / AWS / self-hosted).
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    tracesSampleRate: isProd ? 0.05 : 1.0,
    // Don't capture as breadcrumbs every Pino log — too noisy
    integrations: (defaults) => defaults.filter((i) => i.name !== "Console"),
    // Drop auth-relevant fields server-side just like Pino redaction does
    beforeSend(event) {
      const headers = event.request?.headers;
      if (headers) {
        delete headers.authorization;
        delete headers.cookie;
        delete headers["x-stripe-signature"];
        delete headers["x-twilio-signature"];
        delete headers["upstash-signature"];
      }
      return event;
    },
  });
}
