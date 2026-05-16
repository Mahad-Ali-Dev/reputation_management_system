# Scale playbook — 10M+ active users

This document is the production-readiness checklist for repulabs. It's
ordered by **impact per hour of work** so you can stop at any point and
still have a meaningfully more scalable app.

The default Vercel + Neon setup is fine up to ~10K MAU. Past that, each
section below removes a specific bottleneck. By the time you've done all of
them, the app handles 10M+ MAU without code changes — only infrastructure
scaling.

---

## Status (May 2026)

✅ **Done**

| Item | Where |
|---|---|
| Per-request memoized auth (`getOrgContext`) on every authenticated page | `lib/auth/org-context.ts` + 40+ page files |
| Single-transaction tenant batching in withTenant | `lib/db/with-tenant.ts` |
| `unstable_cache` helper with per-org cache keys + tags | `lib/cache.ts` |
| Provider registry cached cross-tenant (5 min TTL) | `app/connections/page.tsx` |
| UUID validation on dynamic [id] routes | `app/reviews/[id]/page.tsx` |
| Lazy Sentry import (no dev-mode crashes) | `instrumentation.ts` |
| Security headers (CSP, HSTS, X-Frame-Options) | `next.config.mjs`, `middleware.ts` |
| Prisma Accelerate extension installed (opt-in via env) | `package.json`, `lib/db/client.ts` |
| Schema has composite `(organizationId, sort_key DESC)` indexes on every hot table | `prisma/schema.prisma` |

🔄 **Pending — code changes**

| Item | Impact | Difficulty |
|---|---|---|
| Suspense streaming on heavy pages (Dashboard) | 5–10× faster TTFB | Medium — 1–2h per page |
| Move analytics queries to a job-precomputed snapshot table | 100× faster dashboard load | High — new BullMQ job + table + cron |
| `orgCached` wrappers on establishment list, plan, reviews summary | 10× fewer DB hits on hot paths | Low — 30 min |
| Materialized view for `establishment_stats` (rating aggregates) | Eliminates `Review.groupBy` cost | Medium — migration + cron refresh |

🔧 **Pending — infrastructure**

| Item | Impact | Cost |
|---|---|---|
| Switch `DATABASE_URL` to Prisma Accelerate | Connection pooling + edge cache. Sub-10ms cached reads. | $15–$60/mo |
| Cloudflare CDN in front of Vercel | 99% of marketing/static-page traffic never reaches origin | Free tier ok |
| Neon read replica | Route analytics queries away from primary | Included in Pro |
| Object storage (R2/S3) for user uploads | Reduce DB blob storage cost | $0.015/GB/mo |
| Upstash QStash for outbound jobs (already in deps) | Decouple sync work from request lifecycle | Free up to 500/day |

---

## 1. Connection pooling — DO THIS FIRST

**Problem**: every Vercel function invocation opens a fresh Postgres TCP+TLS
connection. At 10K req/sec, you exhaust Neon's connection limit (~1000) in
seconds. Postgres falls over.

**Fix**: pool connections at the edge.

### Option A — Prisma Accelerate (recommended)

The cleanest option. Already installed as a dependency.

1. Sign up at https://console.prisma.io
2. Add your Neon `DATABASE_URL` to the Accelerate dashboard. Copy the
   `prisma://accelerate.prisma-data.net/?api_key=...` URL it gives you.
3. In your `.env.local` / Vercel project settings, set:
   ```
   DATABASE_URL="prisma://accelerate.prisma-data.net/?api_key=..."
   DIRECT_URL="postgres://neon-original-url..."   # Prisma uses this for migrations
   ```
4. In `prisma/schema.prisma`, add `directUrl` to the datasource block:
   ```prisma
   datasource db {
     provider  = "postgresql"
     url       = env("DATABASE_URL")
     directUrl = env("DIRECT_URL")
   }
   ```
5. Enable the Accelerate extension in `lib/db/client.ts`:
   ```ts
   import { withAccelerate } from "@prisma/extension-accelerate";
   // ...
   function makeClient() {
     return new PrismaClient({ ... }).$extends(withAccelerate());
   }
   ```
6. Re-deploy. Each Vercel function now talks to Accelerate, which pools
   thousands of clients onto a handful of Postgres connections.

**Bonus**: per-query edge caching. On read-heavy queries:
```ts
prisma.organization.findUnique({
  where: { id: orgId },
  cacheStrategy: { swr: 60, ttl: 30 },
});
```
This caches the result at the Accelerate edge for 30s, serves stale for up
to 60s while it refreshes. Cuts DB hits to near-zero on hot orgs.

### Option B — Neon Pooler (PgBouncer transaction mode)

Cheaper but loses prepared statements (slightly slower queries) and no edge
cache.

1. Neon dashboard → connection details → toggle **Pooled connection**.
2. Set `DATABASE_URL` to the pooled URL. Add `?pgbouncer=true&connection_limit=1`.
3. Set `DIRECT_URL` to the direct (unpooled) URL — Prisma needs it for migrations.

---

## 2. Per-org caching — `lib/cache.ts`

I've built `lib/cache.ts` with two helpers: `orgCached` and `globalCached`.

**Pattern: cache a per-org query**

```ts
// lib/establishments/cached.ts
import { orgCached } from "@/lib/cache";
import { withTenant } from "@/lib/db/with-tenant";

export const listOrgEstablishmentsCached = orgCached(
  "establishments",
  (orgId) =>
    withTenant(orgId, (tx) =>
      tx.establishment.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, address: true },
      }),
    ),
  { swr: 60 },
);
```

Then in your server action that mutates establishments:

```ts
import { bustOrgCache } from "@/lib/cache";

export async function createEstablishment(...) {
  // ... do the create
  bustOrgCache(orgId, "establishments");
}
```

**Where to apply this next** (highest ROI first):

| Resource | Read frequency | Write frequency | Apply? |
|---|---|---|---|
| Establishment list | Every page (sidebar+dashboard) | Rare (manual) | ✅ Yes |
| Org plan + billing info | Every page (subscription card) | Rare (stripe webhook) | ✅ Yes |
| Review stats (counts, avg) | Dashboard, /reviews | Real-time (Google webhook) | ⚠️ Cache 30s |
| Provider registry status | Connections page only | Admin-only | ✅ Yes (done) |
| Survey campaigns | /surveys page | Manual edit | ✅ Yes |
| Today's review queue | Dashboard | Real-time | ❌ Don't cache — must be fresh |

---

## 3. Suspense streaming

**Problem**: the dashboard waits for ~20 queries before sending ANY HTML.
Even with caching, TTFB is 200–500ms.

**Fix**: split the page into async components, each in its own `<Suspense>`
boundary. The shell renders immediately; each card streams when its data
arrives.

### Pattern

Current:
```tsx
export default async function DashboardPage() {
  const data = await fetchEverything();  // blocks 500ms
  return <Layout><KpiStrip data={data}/>...</Layout>;
}
```

After:
```tsx
export default async function DashboardPage() {
  return (
    <Layout>
      <Suspense fallback={<KpiStripSkeleton/>}>
        <KpiStrip />
      </Suspense>
      <Suspense fallback={<ChartSkeleton/>}>
        <ReviewsChart />
      </Suspense>
      ...
    </Layout>
  );
}

async function KpiStrip() {
  const data = await fetchKpis();  // independent
  return <div>...</div>;
}
```

The browser receives the shell in 30ms and progressively fills in. Even on
slow networks, the user sees structure immediately.

### Apply to

1. **Dashboard** — biggest impact, most cards
2. **Establishments detail page** — header + tabs + cards each independent
3. **Reviews list** — list + filters independent

---

## 4. Background-precomputed analytics

The dashboard's 12-week stacked chart query scans 12 weeks of reviews on
every load. At 10K orgs × 50 dashboard views/day × 12-week scan = 6M scans
per day. Expensive even with indexes.

**Fix**: pre-compute nightly.

1. Add a `dashboard_snapshots` table:
   ```prisma
   model DashboardSnapshot {
     id             String   @id @default(uuid()) @db.Uuid
     organizationId String   @map("organization_id") @db.Uuid
     periodStart    DateTime @map("period_start")
     periodEnd      DateTime @map("period_end")
     payload        Json     // serialized chart/sentiment/funnel data
     computedAt     DateTime @default(now()) @map("computed_at")
     @@unique([organizationId, periodStart])
     @@index([organizationId, computedAt(sort: Desc)])
   }
   ```
2. Add a BullMQ job (`lib/jobs/compute-dashboard.ts`) that runs nightly per
   org, queries the same data the dashboard needs, and upserts a snapshot.
3. Dashboard reads the latest snapshot in <10ms instead of running the
   queries fresh.

---

## 5. Read replicas

When read load dominates:

1. Provision a Neon/Aurora read replica.
2. Add `DATABASE_URL_READONLY` env var.
3. In `lib/db/client.ts`, export a second `prismaRead` client pointed at the
   replica.
4. Update analytics queries (dashboard charts, sentiment aggregates,
   `groupBy` queries) to use `prismaRead`.
5. Keep `prisma` for writes and tenant operations (where read-your-writes
   matters).

---

## 6. CDN / edge

For marketing pages and `/r/[slug]` device redirects:

1. Put Cloudflare in front of your Vercel/Fly deployment.
2. Set cache-control headers on static routes:
   ```ts
   // app/page.tsx (landing)
   export const revalidate = 3600;  // 1 hour ISR
   ```
3. For `/r/[slug]`, the redirect endpoint can run on Vercel Edge Runtime
   (already supported by Next.js 15). Add:
   ```ts
   export const runtime = "edge";
   ```

---

## 7. Observability

You can't scale what you can't measure.

| Tool | Purpose | Cost |
|---|---|---|
| Sentry (already configured) | Server errors, performance traces | Free up to 5K events |
| Vercel Analytics | Real User Monitoring (RUM) | Free w/ Pro |
| Better Stack / Axiom | Log aggregation | $25/mo |
| Pino (already in deps) | Structured logs to stdout | Free |

Key metrics to alert on:
- **p95 page load >2s** — performance regression
- **DB connection count >70%** — connection pooling not working
- **Error rate >0.1%** — runtime breakage
- **5xx rate >0.5%** — backend issue

---

## 8. Cost-tracked AI calls

The Anthropic SDK calls in `lib/ai/*` and `app/api/voice/*` are the most
expensive part of the app per request. Make sure:

1. Every call goes through `chargeAndCheck()` (per `docs/AI_STRATEGY.md`)
2. Prompts use prompt caching (`cache_control: { type: "ephemeral" }`)
3. Haiku is the default; Sonnet only for ≤3⭐ replies + phone receptionist
4. Set per-org daily limits (already in schema as `dailyAiCostUsdMicros`)

---

## Order of operations for "scale to 10M MAU"

Don't try to do everything at once. Follow this sequence:

1. **Today / this week**:
   - ☑️ Per-request auth caching (done)
   - ☑️ Per-org cache helpers (done)
   - ⬜ Wire `orgCached` around establishment + plan queries (30 min)
   - ⬜ Sign up for Prisma Accelerate, swap `DATABASE_URL` (1 hour)

2. **Next 2 weeks** (when DAU > 100):
   - ⬜ Suspense-stream the dashboard
   - ⬜ Move dashboard chart query into a snapshot table + nightly job
   - ⬜ Put Cloudflare in front

3. **Before 10K MAU**:
   - ⬜ Read replica + split clients
   - ⬜ Audit slow queries with `EXPLAIN ANALYZE`
   - ⬜ Add materialized view for `establishment_stats`

4. **Before 100K MAU**:
   - ⬜ Database sharding strategy (probably by region — EU vs US)
   - ⬜ Move BullMQ workers to dedicated containers
   - ⬜ Pre-warm Lambda/Vercel function pools during predictable peaks

5. **Before 1M MAU**:
   - ⬜ Hire a DBA. Seriously.

---

## Quick wins that don't fit elsewhere

- **Bun/Edge runtime for /r/[slug]** — the device redirect endpoint is
  invoked on every QR scan. If you have heavy traffic, deploy it to the
  edge. Sub-50ms response globally.
- **Lazy-load heavy components** — the dashboard's `<StackedBars>` SVG is
  decent-sized. Use `next/dynamic` to code-split it.
- **Image optimization** — use `next/image` for all user-uploaded photos.
  Vercel auto-optimizes + CDN-caches.
- **Disable `force-dynamic` where not needed** — many of my page files have
  `export const dynamic = "force-dynamic"`. That's fine for pages with
  cookies (auth), but if a page doesn't need it, remove it so Next.js can
  pre-render at build time.
