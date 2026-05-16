/**
 * Next.js instrumentation hook.
 *
 * Runs once at server startup. Used to register Sentry's server + edge configs
 * (which can't be imported eagerly because they pull in node:* modules).
 *
 * Dev-mode notes: `@sentry/nextjs` ships an OpenTelemetry dependency that
 * uses dynamic `require()` calls, which Webpack flags as a "Critical
 * dependency" warning AND occasionally fails to resolve during HMR reloads
 * with MODULE_NOT_FOUND. We swallow those errors silently in dev — the only
 * cost is that local errors don't reach Sentry, which we don't want anyway.
 */

export async function register() {
  // Validate environment FIRST. In production a missing critical var triggers
  // process.exit(1) inside lib/env, so this fails the boot before any request
  // is served. In dev it logs loudly but continues.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertEnv } = await import("./lib/env");
    assertEnv();

    // ---- Graceful shutdown ----
    // systemd sends SIGTERM with a 20s TimeoutStopSec on `systemctl stop`.
    // Next.js stops accepting new connections automatically; we additionally
    // close Prisma's connection pool and flush the Pino logger so the last
    // few lines aren't lost when the process exits. Idempotent: a second
    // signal won't double-execute the handlers.
    let shuttingDown = false;
    const onShutdown = (signal: NodeJS.Signals) => async () => {
      if (shuttingDown) return;
      shuttingDown = true;
      try {
        const { prisma } = await import("./lib/db/client");
        const { logger } = await import("./lib/logger");
        logger.info({ signal, event: "shutdown.start" }, "graceful shutdown");
        await prisma.$disconnect().catch(() => {});
        // Pino default transport flushes synchronously; for the worker transport
        // (dev only) we await a final tick to let it drain.
        await new Promise((r) => setImmediate(r));
      } catch {
        // ignore — shutdown must not throw
      } finally {
        process.exit(0);
      }
    };
    // Use process.once so handlers don't accumulate across HMR reloads.
    process.once("SIGTERM", onShutdown("SIGTERM"));
    process.once("SIGINT", onShutdown("SIGINT"));
  }

  if (process.env.NODE_ENV !== "production" && !process.env.SENTRY_DSN) {
    return;
  }
  try {
    if (process.env.NEXT_RUNTIME === "nodejs") {
      await import("./sentry.server.config");
    }
    if (process.env.NEXT_RUNTIME === "edge") {
      await import("./sentry.edge.config");
    }
  } catch {
    // Don't crash the server on Sentry init failure.
  }
}

export async function onRequestError(
  err: unknown,
  request: { path: string; method: string; headers: { [key: string]: string } },
  context: {
    routerKind: "Pages Router" | "App Router";
    routePath: string;
    routeType: "render" | "route" | "action" | "middleware";
  },
) {
  // Skip Sentry entirely in dev — the dynamic import races with Webpack HMR
  // and floods the console with MODULE_NOT_FOUND noise.
  if (process.env.NODE_ENV !== "production" && !process.env.SENTRY_DSN) {
    return;
  }
  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureRequestError(err, request, context);
  } catch {
    // Sentry import failed — don't crash the request.
  }
}
