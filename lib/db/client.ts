import { PrismaClient } from "@prisma/client";

declare global {
  // biome-ignore lint/style/noVar: required for Next.js hot-reload singleton
  var __prisma: PrismaClient | undefined;
}

/**
 * Singleton Prisma client. Reused across hot reloads in dev to avoid
 * connection pool exhaustion.
 *
 * SCALING — production checklist:
 *   1. Set DATABASE_URL to a pooled connection. Two supported options:
 *
 *      a) Prisma Accelerate (recommended for Vercel/Fly serverless):
 *         DATABASE_URL="prisma://accelerate.prisma-data.net/?api_key=..."
 *         Sign up at https://console.prisma.io — gives you connection
 *         pooling, edge caching, and prepared-statement-safe proxying.
 *
 *         To enable caching on a per-query basis, swap this file's
 *         `new PrismaClient(...)` line to:
 *           import { withAccelerate } from "@prisma/extension-accelerate";
 *           new PrismaClient(...).$extends(withAccelerate())
 *         Then on hot reads:
 *           prisma.organization.findUnique({ where: {id}, cacheStrategy: { swr: 60, ttl: 60 } })
 *         (The package is already installed as a dep.)
 *
 *      b) PgBouncer / Neon Pooler in transaction mode:
 *         DATABASE_URL="postgres://...?pgbouncer=true&connection_limit=1"
 *         Faster than Accelerate but loses prepared statements and edge cache.
 *
 *   2. Audit hot paths for N+1 — see lib/db/with-tenant.ts for the canonical
 *      tenant-scoped pattern (single transaction, single SET LOCAL).
 *
 *   3. Read replicas: long-term, route analytics reads (dashboard charts,
 *      sentiment aggregates) to a read-only replica via a second Prisma
 *      client. Neon and Aurora both support this with separate connection
 *      strings.
 *
 * Tenant safety: this client does NOT set `app.current_org_id`. Use
 * `withTenant()` for tenant-scoped queries. Direct `prisma` is OK only for:
 *   - Auth.js adapter (User, Account, Session, VerificationToken — non-tenant)
 *   - System operations (cron, webhook ingestion before org is known)
 *   - Reads that explicitly filter by an auth-derived organizationId
 */

function makeClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["warn", "error"],
  });
}

export const prisma = globalThis.__prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
