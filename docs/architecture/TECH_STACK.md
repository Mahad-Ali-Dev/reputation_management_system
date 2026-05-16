# Tech Stack — RepuBoost

> Pragmatic choices favoring TypeScript end-to-end, fastest path to production, and easy hiring.

---

## 1. At a Glance

| Layer | Choice | Why |
|---|---|---|
| **Language** | TypeScript 5.6+ | Full-stack, strong typing, hires well |
| **Frontend** | Next.js 15 (App Router) + React 19 | SSR, server actions, file-based routing, single codebase for tenant + admin |
| **UI** | Tailwind CSS 4 + shadcn/ui + Radix primitives | Copy-paste components, no lock-in |
| **State (server)** | TanStack Query | Standard for async server state |
| **State (client)** | Zustand | Lightweight; Redux is overkill |
| **Forms** | React Hook Form + Zod | Schema reuse with API |
| **Backend** | Next.js Route Handlers (+ Hono for edge/external API) | Co-located, fast |
| **ORM** | Prisma 6 | Type-safe, great DX, RLS-compatible |
| **Database** | PostgreSQL 16 (AWS RDS Aurora Serverless v2) | Default safe choice; RLS for multi-tenancy; pgvector for RAG |
| **Cache / Queue / Sessions** | Redis 7 (ElastiCache) | One service, three jobs |
| **Job Queue** | BullMQ | Mature, runs on the same Redis |
| **Object Storage** | S3 (or Cloudflare R2 for cost) | Logos, exports, hardware label PDFs |
| **Analytics warehouse** | ClickHouse Cloud | Cheap, fast aggregates, retains 25mo |
| **Auth** | Auth.js v5 + custom org-scoping | Battle-tested; easy to extend |
| **Payments** | Stripe (Subscriptions + Checkout + Customer Portal) | Standard |
| **AI** | Anthropic Claude API (Sonnet 4.6 + Haiku 4.5 + Opus 4.7) | Best for safety-critical replies; aggressive prompt caching |
| **Embeddings** | Voyage AI (`voyage-3`) — 1024 dim | Best quality/$ as of 2026 |
| **Email** | Resend (transactional) + SendGrid (marketing/bulk review requests) | Resend has best DX; SendGrid still cheapest at scale |
| **SMS** | Twilio (with MessageBird as backup) | Universal, good APIs |
| **Voice (P2)** | Twilio Voice + Anthropic streaming | Real-time AI receptionist |
| **Observability** | Sentry (errors) + Axiom (logs) + Grafana Cloud (metrics + traces) | Single $99/mo plan covers most |
| **Edge / CDN** | Cloudflare (CDN + Workers + WAF + R2 + KV) | Best price/feature; short-link service runs here |
| **CI/CD** | GitHub Actions → Vercel (web) + Fly.io (workers) + Render (admin) | Or all-Vercel if budget allows |
| **IaC** | Terraform (AWS) + Pulumi (TS) for app config | TS for app stack, HCL for AWS |
| **Containers** | Docker for workers (Fly.io machines) | Simple |
| **Testing** | Vitest (unit) + Playwright (e2e) + Pact (contract for webhooks) | Modern, fast |
| **Linting** | Biome 1.9 + ESLint (for plugins not yet in Biome) | Speed |
| **Docs** | Markdown in `/docs`, Storybook for UI | Keep close to code |
| **Feature flags** | OpenFeature + own table (already in DB) | No extra vendor |

---

## 2. Why Next.js + Modular Monolith

**Pros**
- One repo, one deploy, one dev environment for tenant + admin + marketing + chatbot
- Server actions = easy form handling without writing API + fetcher
- Streaming UI for AI replies / chatbot
- Server components reduce client bundle
- Mature ecosystem, easy hiring

**Cons & mitigations**
- Vercel lock-in concern → routes are framework-agnostic; can move to Fly/Render in a week if needed
- Worker scaling is separate from web → solved by Fly.io workers reading the same DB+Redis
- Server actions hide HTTP layer → for non-trivial mutations, prefer route handlers + typed client (better testability, better for SDK)

---

## 3. Why Anthropic Claude

| Use Case | Model | Why |
|---|---|---|
| Review reply (≤ 3 stars) | Sonnet 4.6 | Tone, safety, brand-voice fidelity |
| Review reply (≥ 4 stars) | Haiku 4.5 | 80% cheaper, good enough for thank-you |
| Caption generation | Haiku 4.5 | Volume + creativity ok |
| Sentiment / topic extraction | Haiku 4.5 | Cheap classification |
| Chatbot first response | Haiku 4.5 | Latency + cost |
| Chatbot complex queries (RAG hits) | Sonnet 4.6 | Reasoning over docs |
| Phone receptionist | Sonnet 4.6 (streaming) | Latency + handling |
| Revenue prediction explanation | Opus 4.7 | Rare; high-reasoning |

**Prompt caching strategy** (huge cost lever):
- Per-tenant: cache `[system_prompt, brand_voice_doc, common_examples]` (>1024 tokens)
- 5-min ephemeral cache for high-traffic tenants
- Per-establishment cache reset only on brand voice update

Expected cost: ~$2-4/tenant/month at typical volume.

---

## 4. Why PostgreSQL (not Mongo / DynamoDB)

- ACID transactions matter for billing + multi-step updates (e.g., publish review reply + update audit + decrement quota)
- RLS gives us defense-in-depth multi-tenancy
- pgvector is good enough for our RAG scale (we don't need a separate vector DB until 100M+ chunks)
- Aurora Serverless v2 auto-scales 0.5 → 16 ACUs; pay for what we use
- One DB to operate

**Why not DynamoDB**: too restrictive for ad-hoc analytics + complex joins we'll need (review × device × campaign).

**Why not MongoDB**: no compelling reason given our schemas are well-defined.

---

## 5. Frontend Component System

```
src/components/
├── ui/                      # shadcn primitives (Button, Card, Dialog...)
├── forms/                   # Form wrappers + field components
├── data/                    # DataTable, Pagination, Filters
├── charts/                  # Recharts wrappers + theme
├── tenant/                  # Tenant-app specific composites
├── admin/                   # Admin-app specific composites
└── marketing/               # Marketing site
```

- **Design tokens**: CSS variables, light/dark mode, brand colors
- **Icons**: lucide-react
- **Charts**: Recharts (good enough), upgrade to ECharts if needed
- **Tables**: TanStack Table v8
- **Date/time**: date-fns + temporal polyfill
- **Drag & drop**: dnd-kit (for survey builder, social calendar)

---

## 6. Backend Architecture Patterns

| Pattern | Where |
|---|---|
| **Service classes** | One per module — encapsulate business logic, tested in isolation |
| **Repository** | Wraps Prisma — centralizes RLS context-setting |
| **Domain events** | Outbox table → BullMQ for async workflows |
| **CQRS-lite** | Reads from materialized views (CH for analytics; PG views for inbox) |
| **Dependency injection** | tsyringe (lightweight) — for testability |
| **Validation** | Zod on every API boundary; share schema with frontend |

---

## 7. Quality & Reliability

| Practice | Tool |
|---|---|
| Type safety | TS strict mode, `noUncheckedIndexedAccess`, Zod runtime |
| Code coverage | Vitest, target ≥ 70% on services, ≥ 90% on billing module |
| E2E coverage | Playwright nightly across critical flows (signup, review request, post publish, checkout) |
| Contract testing | Pact for tenant webhooks |
| Load testing | k6 nightly against staging |
| Synthetic monitoring | Checkly hits 12 key endpoints every 60s |
| Visual regression | Chromatic (Storybook) on PRs |
| Security scanning | Snyk + Dependabot + Trivy on Docker images |
| SAST | Semgrep on PRs |
| Secret scanning | gitleaks pre-commit + GitHub secret scanning |

---

## 8. Pre-built / Bought vs Built

| Function | Decision | Rationale |
|---|---|---|
| Auth | **Use Auth.js** | Don't roll your own |
| Subscription billing | **Use Stripe** | Same |
| Transactional email | **Use Resend** | Same |
| Customer portal | **Use Stripe Portal** | Free, ships fast |
| Multi-tenant infra | **Build (RLS)** | Off-the-shelf doesn't fit |
| Inbox engine | **Build** | Core differentiator; existing tools (Front, Help Scout) don't expose tenant abstraction |
| Survey builder | **Build minimal, no Typeform clone** | Limited scope; Survey JS lib if pressed |
| Social posting | **Build (no Buffer dependency)** | Margin on this is significant |
| AI chatbot widget | **Build** | Tightly integrated with brand voice |
| Job scheduler | **Use BullMQ** | Don't reinvent |
| File uploads | **Use S3 multipart + uppy** | Mature |
| PDF generation (reports) | **Use Puppeteer in worker** | Quality > simplicity |
| Geocoding | **Google Maps API** | Best data |

---

## 9. Repository Layout (monorepo via Turborepo)

```
repuboost/
├── apps/
│   ├── web/                 # Next.js app (tenant + admin + marketing)
│   ├── workers/             # Background workers (Node + BullMQ)
│   ├── edge/                # Cloudflare Workers (short-link, beacon)
│   └── widget/              # Embeddable chatbot bundle
├── packages/
│   ├── db/                  # Prisma schema + migrations + RLS helpers
│   ├── ui/                  # Shared design system
│   ├── types/               # Shared TypeScript types
│   ├── ai/                  # Claude wrapper, prompt registry, caching
│   ├── integrations/        # GBP, Meta, LinkedIn, X, Twilio, SendGrid clients
│   ├── billing/             # Stripe wrapper + plan logic
│   └── eslint-config/       # Shared ESLint
├── infra/
│   ├── terraform/           # AWS + Cloudflare
│   └── pulumi/              # App-level (Vercel projects, env vars)
├── docs/                    # this folder
└── turbo.json
```

---

## 10. Why these choices NOW vs later

- **Don't pick Kubernetes yet**. Vercel + Fly.io carry us to $1M ARR. K8s adds 1 FTE of ops cost.
- **Don't build microservices yet**. Talked through in ADR-001.
- **Don't pick a vector DB**. pgvector works to ~10M embeddings, which is years away.
- **Don't pick GraphQL**. REST + Zod gives us 95% of the benefit with 30% of the complexity.
- **Don't pick gRPC** internal. Modular monolith calls TS functions, not RPC.
- **Don't build mobile apps**. Responsive web covers 95% of value. Revisit when paying customers ask.

---

## 11. Hiring Implications

This stack hires well in 2026:
- TS / React / Next.js — saturated talent pool
- Postgres — universal
- Prisma — well-known
- Stripe — universal
- Anthropic SDK — growing fast

**Niche skills needed**:
- 1 senior infra/platform engineer (Postgres + RLS + AWS) — critical
- 1 ML/AI engineer (Claude prompt engineering + RAG eval) — important
- Hardware/fulfillment ops contractor (not engineer) — handles physical product
