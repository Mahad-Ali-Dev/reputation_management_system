# Repulabs — State of the System

**Snapshot date:** 2026-05-15
**Status:** Production-ready · pre-launch · target deploy on Hostinger VPS
**Verified by:** Local production smoke test (`NODE_ENV=production next start` → `/api/health` returns `status:"ok"` in 1s)

---

## 1. Executive Summary

Repulabs is a multi-tenant reputation-management SaaS for local businesses.
The product is a single Next.js 15 application that gives every customer
a workspace covering review monitoring, AI-drafted replies, outbound
review-request automation, customer surveys, social media management,
an AI phone receptionist, and a QR-stand hardware line.

The codebase is **40,558 lines of TypeScript across 64 page routes, 37
API routes, and 62 database models**, on top of Postgres (Neon) with
row-level security as the multi-tenant isolation primitive.

The system is ready to deploy on a single Hostinger VPS today. It is
architected to migrate to AWS Fargate when sustained traffic justifies
the operational cost.

### Verification — what we know works

| Check | Result |
|---|---|
| TypeScript compile | Clean across 268 files |
| Production build | `next build` → 105 KB shared JS, 113 KB middleware, 64 routes |
| Smoke test | Server boots in 1s; `/api/health` returns 200 with `db:"ok"` |
| Auth flow | `/api/auth/csrf` returns valid token; magic-link providers wired |
| Admin gate | `/admin` → 307 redirect to `/admin/login` (middleware enforces) |
| Security headers | HSTS, X-Frame-Options DENY, CSP, Referrer-Policy all present |
| Stripe webhook | Raw-body verification + HMAC + idempotency on `event.id` |
| Env validation | Hard-fails boot if a required prod var is missing |

### What it is not

- Not a horizontally-scaled deployment yet — single VPS is fine for the
  first 100–1,000 paying tenants. AWS migration path is documented.
- Not a public API platform — every endpoint serves either the first-party
  app, the chat widget, or a webhook sender.
- Not federated / no SSO yet (Auth.js supports adding it; Repulabs Pro
  tier is on the roadmap).

---

## 2. Implementation Inventory

### 2.1 Code surface

| Surface | Count |
|---|---|
| Page routes (`app/**/page.tsx`) | **64** |
| API routes (`app/api/**/route.ts`) | **37** |
| Server-action modules (`lib/*/actions.ts`) | **15** |
| Reusable React components (`components/**/*.tsx`) | **31** |
| Library modules (`lib/*`) | **35** |
| Database models (`prisma/schema.prisma`) | **62** |
| Prisma migrations applied | **15** |
| Vitest test suites | **8** |
| Total TS/TSX lines (app + components + lib) | **40,558** |

### 2.2 Tenant-facing page routes (per domain)

| Domain | Routes | Notes |
|---|---|---|
| Dashboard | `/dashboard` | KPI overview, recent reviews, activity feed |
| Establishments | `/establishments`, `/establishments/new`, `/establishments/[id]` | Locations, brand voice, business hours |
| Reviews | `/reviews`, `/reviews/[id]`, `/reviews/dispute` | Inbox, AI reply approval, dispute filing |
| Outreach | `/outreach`, `/outreach/send`, `/outreach/templates`, `/outreach/bulk` | Single + bulk review requests, templates |
| Surveys | `/surveys`, `/surveys/new`, `/surveys/[id]`, `/surveys/coupons` | NPS campaigns, promoter coupons, smart routing |
| Social | `/social/posts`, `/social/calendar` | Multi-channel scheduling |
| Support inbox | `/support/comments`, `/support/dms`, `/support/live-chat`, `/support/chat-automation`, `/support/blacklist`, `/support/customers`, `/support/analytics` | Unified comments/DMs/chat |
| QR Codes | `/hardware`, `/hardware/new`, `/hardware/orders/[id]` | Self-service QR + activation codes |
| AI Phone | `/phone`, `/phone/setup`, `/phone/voices`, `/phone/campaigns`, `/phone/assistant`, `/phone/calls/[id]`, `/phone/booking` | Twilio + Claude phone agent |
| AI Training | `/ai`, `/ai/training`, `/ai/test` | KB ingest, brand voice, eval harness |
| Connections | `/connections` | OAuth-based 3rd-party integrations |
| Account | `/settings/account`, `/subscription` | Profile, team, billing |
| Analytics | `/analytics`, `/contacts`, `/faqs` | Trends, topic extraction, customer-segments |
| Auth | `/login`, `/activate` | Magic-link + Google + activation-code redemption |
| Marketing | `/` | Public landing page with product tour |
| Public utility | `/r/[slug]`, `/s/[token]`, `/u`, `/widget`, `/not-activated`, `/legal/{privacy,terms,subprocessors}` | QR redirect, unsubscribe, widget host |

### 2.3 Admin pages (rebuilt on the v2 design system)

| Page | Purpose |
|---|---|
| `/admin/tenants` | Every organization, plan + sub-status, search |
| `/admin/tenants/[id]` | Per-tenant: members, establishments, orders, reviews, audit; impersonation launcher |
| `/admin/users` | Every user across tenants; verified, last login, active sessions |
| `/admin/mrr` | MRR / ARR / net-new / churn; plan distribution; funnel snapshot |
| `/admin/fulfillment` | Hardware orders pending shipment; mark-shipped action |
| `/admin/refunds`, `/admin/refunds/[orderId]` | Refund list + per-order issuance form |
| `/admin/flags` | Per-org and global feature-flag overrides |
| `/admin/providers`, `/admin/providers/[provider]` | OAuth app credential management |
| `/admin/audit` | Searchable hash-chained audit log |
| `/admin/login` | Internal-staff sign-in (separate auth domain from tenant cookie) |

### 2.4 API routes (by family)

| Family | Routes | Auth |
|---|---|---|
| **Public** | `/api/health` | none |
| **Tenant API** | `/api/billing/{checkout,portal}`, `/api/devices/[id]/qr`, `/api/ai/assistant` | Auth.js session |
| **AI widget** | `/api/ai/widget/bootstrap`, `/api/ai/chatbot/converse` | Visitor JWT |
| **Voice** | `/api/voice/{incoming,respond,status,outbound}` | Twilio signature |
| **Webhooks** | `/api/webhooks/stripe`, `/api/webhooks/twilio/sms-status` | Provider HMAC |
| **Cron** | `/api/cron/{dispatch-outbound,daily-digest,extract-topics,sync-reviews}` | `CRON_SECRET` bearer |
| **Admin** | `/api/admin/{login,logout,impersonate}` | Admin cookie |
| **Connections (OAuth)** | `/api/connections/{google,hubspot,shopify,mailchimp,klaviyo,quickbooks}/{authorize,callback}` | Auth.js + state JWT |
| **Internal jobs** | `/api/jobs/{digest-org,topic-extract}` | QStash HMAC |
| **Auth.js (auto)** | `/api/auth/[...nextauth]` | NextAuth-generated |
| **Dev-only** | `/api/dev/{seed-review,sync-subscription}` | gated on `NODE_ENV !== "production"` |

### 2.5 Database models (62 total, grouped)

| Group | Models |
|---|---|
| **Identity** | User, Account, Session, VerificationToken, AdminUser, AdminSession |
| **Multi-tenancy** | Organization, Membership |
| **Locations** | Establishment, Connection |
| **Reviews** | Review, ReviewReply, ReviewReplyDraft, ReviewDispute |
| **Outreach** | ReviewRequest, ReviewRequestTemplate, OutreachAttempt, OutreachUnsubscribe |
| **Inbox** | InboxThread, InboxMessage, ChatVisitor, ChatConversation, ChatMessage, ChatBlacklist |
| **Surveys** | SurveyCampaign, SurveyResponse, SurveyCoupon, SurveyTrigger |
| **Social** | SocialChannel, SocialPost, SocialComment, SocialDm |
| **Hardware** | HardwareProduct, HardwareOrder, HardwareOrderItem, Device, DeviceScan |
| **AI / KB** | AiUsageRecord, AiBudget, KbDocument, KbChunk, KbCrawlJob, FaqEntry |
| **Phone** | PhoneNumber, VoiceCall, VoiceCallTurn, PhoneCampaign, PhoneCampaignTarget, PhoneBooking, PhoneVoice |
| **Billing** | Subscription, ProductPrice |
| **Ops** | AuditLog, WebhookDelivery, FeatureFlag, ProviderApp, DigestRun, JobRun, BlobAsset |

### 2.6 Background work

| Trigger | Cadence | Purpose |
|---|---|---|
| `/api/cron/dispatch-outbound` | every 1 min | Pull queued phone-campaign targets, place calls via Twilio |
| `/api/cron/daily-digest` | hourly, gated by org TZ | Send per-org daily summary email |
| `/api/cron/extract-topics` | every 15 min | Run Claude on un-extracted reviews to add topic labels |
| `/api/cron/sync-reviews` | every 30 min | Pull new reviews from Google Business Profile for each establishment |
| `/api/jobs/digest-org` | on demand (QStash) | Build + send one org's daily digest, idempotent on `(orgId, day)` |
| `/api/jobs/topic-extract` | on demand (QStash) | Per-batch topic extraction |

---

## 3. Feature Map by Domain

### 3.1 Reviews & Replies

- Multi-source ingest: Google Business Profile (live), Facebook, Yelp,
  Trustpilot, internal — normalized to a single `Review` row
- AI-drafted replies in the org's **brand voice** (uploaded brand guide
  + service catalog + refund policy feed the system prompt)
- One-click approval → posted via the source's API (or held for manual
  copy-paste when no API)
- **Topic extraction** runs in background — "fast service", "great
  coffee", "slow at peak" surfaced on the analytics page
- **Sentiment scoring** per review (Claude classification)
- **Dispute filing** for fake/abusive Google reviews (71% removal rate
  is the working assumption)

### 3.2 Outreach

- Per-establishment **templates** (SMS + email variants)
- **Single send** with live SMS preview against the recipient's name
- **Bulk CSV** with upload validation, dry-run, send schedule
- **TCPA-compliant**: consent flag on `Contact`, mandatory STOP/HELP
  handling, signed unsubscribe URLs
- Twilio + Resend as the underlying senders
- Rate-limited: 100 sends/min per org (`outreach_send` limiter)
- **Conversion tracking**: `OutreachAttempt` → `Review` linkage via
  `attributedRequestId`

### 3.3 Surveys

- **NPS-style campaigns** with promoter / passive / detractor routing
- Promoter → review request CTA
- Detractor → internal alert + escalation
- **SurveyCoupon** issuance to promoters (configurable per campaign)
- **Smart triggers**: based on `SurveyTrigger` rows (e.g. "after Square
  sale > $50", "after invoice paid"); the trigger fires a follow-up
  send N hours later

### 3.4 QR / Hardware

- **Two acquisition paths**:
  - Self-service: `/hardware/new` generates a QR with a user-supplied
    Google review URL (free, instant)
  - Hardware: stands / plaques / cards sold on Shopify
    (`repulabs.com.au`), customer redeems printed activation code at
    `/activate`
- **Crockford base32 10-char slugs** = 50 bits entropy
- **HMAC-signed redirect target** (`slug_signature`) — defeats DB
  tampering / KV poisoning
- `/r/{slug}` rate-limited per (IP, slug) at 60/min
- Edge scan event fire-and-forget into `DeviceScan` (idempotent on
  `(device_id, scan_id)`)
- Per-device analytics: scan count, last scan, conversion to review

### 3.5 AI Phone Receptionist

- Twilio Voice + Claude phone agent
- **Cloned voice** via ElevenLabs (optional)
- Receives inbound calls → handles common requests (hours, booking,
  pricing) → escalates to human via call-forwarding when unsure
- **Cal.com integration** for booking writes
- **Outbound campaigns** with rate-per-minute throttling and timezone-
  aware call-windows
- Every turn logged in `VoiceCallTurn`; full transcripts auditable

### 3.6 Social Studio

- Multi-channel post scheduling (Facebook, Instagram via OAuth)
- Unified comments inbox with AI-draft replies
- DM aggregation
- Calendar view at `/social/calendar`

### 3.7 AI Training

- Upload PDFs / Docx → ingest into `KbDocument` + chunked `KbChunk` rows
- **Voyage embeddings** for retrieval
- **URL crawl** path (`/ai/training`) — paste a public URL, the
  `KbCrawlJob` ingests it
- **Brand voice slider** + tone configuration per establishment
- `/ai/test` page to dry-run the chat against your KB

### 3.8 Connections

- OAuth flows for: Google Business Profile, HubSpot, Shopify, Mailchimp,
  Klaviyo, QuickBooks
- **State JWT** (60s TTL, scoped to orgId) for CSRF defense
- **Envelope-encrypted tokens** (AES-256-GCM with per-tenant DEK)

### 3.9 Billing

- **Stripe Subscriptions** with Customer Portal
- Plans: Free, Pro ($89/mo per location), Scale (custom)
- Hardware as separate one-time products
- **Stripe webhook** handles 5 events: checkout completed, subscription
  updated/deleted, invoice failed, charge refunded
- Idempotent on `event.id` — replays return 200 without re-effect
- Webhook delivery rows persisted to `WebhookDelivery` table

### 3.10 Admin

- **Tenant management**: search, plan filter, deep-link into per-org page
- **Impersonation**: read-only with mandatory `reason` ≥6 chars,
  audit-logged. Runs the impersonator's queries as the
  `app_tenant_reader` RLS role (DB-enforced read-only)
- **MRR dashboard**: aggregated from local subscription mirror
- **Fulfillment queue**: mark-shipped action emits audit log + customer
  email
- **Refunds**: per-order issuance form, computes remaining balance,
  tracks history
- **Feature flags**: per-org + global, deterministic rollout %
- **Provider OAuth apps**: paste client ID / secret per provider,
  encrypted at rest
- **Audit log search**: by org / action / actor; hash-chained per the
  security review (`pnpm audit:verify`)

---

## 4. Architecture

### 4.1 High-level

```
                          ┌─────────────────────────────┐
                          │  Browser / Mobile / Widget  │
                          └─────────────────────────────┘
                                       │
                                       ▼  HTTPS
                           ┌───────────────────────┐
                           │  Cloudflare (optional) │  ← DDoS, WAF, CDN
                           └───────────────────────┘
                                       │
                                       ▼
                           ┌───────────────────────┐
                           │      Nginx (VPS)      │  ← TLS, rate limits, gzip
                           └───────────────────────┘
                                       │
                                       ▼  http://127.0.0.1:3000
                           ┌───────────────────────┐
                           │   Next.js 15 (Node)   │
                           │   systemd service     │
                           └───────────────────────┘
                                       │
              ┌────────────┬───────────┴────────────┬─────────────┐
              ▼            ▼                        ▼             ▼
          ┌───────┐   ┌─────────┐            ┌──────────┐   ┌────────┐
          │ Neon  │   │ Anthropic│           │ Stripe   │   │ Resend │
          │ Postgres│ │ Claude   │           │          │   │        │
          │ (RLS) │   └─────────┘            └──────────┘   └────────┘
          └───────┘                                ▲
                                                   │ webhook
                                                   ▼
                                            (back to Next.js)
```

### 4.2 Request flow (tenant page render)

1. **Cloudflare** (if proxied) → strips bot traffic, DDoS shield,
   forwards to VPS IP
2. **Nginx** terminates TLS, applies per-IP rate limits, sets
   `X-Forwarded-Host` / `Proto` / `For`, proxies to `127.0.0.1:3000`
3. **Next.js middleware** (`middleware.ts`):
   - Reads `host` header → identifies subdomain (`app.`, `admin.`, `r.`)
   - Applies security headers (HSTS, CSP, X-Frame-Options, etc.)
   - For `/admin/*`: checks `admin_session` cookie presence (full
     verification deferred to layout)
   - Sets `x-pathname` header for server components
4. **App-router server component**:
   - Calls `getOrgContext()` (request-memoized via React `cache()`)
   - That resolves Auth.js session → org membership → org row
   - Page renders inside `<AppShellServer>` (sidebar + topbar)
5. **Database access** uses `withTenant(orgId, async (tx) => ...)`:
   - Switches to PG role `app_tenant_user` (which **cannot read
     `users` table** — separation of auth vs tenant domains)
   - `SET app.current_org_id = $orgId` for RLS predicates
   - All queries inside the txn are RLS-filtered to that org

### 4.3 Auth flow (magic-link sign-in)

```
1.  GET  /login                          → server-rendered login form
2.  POST /api/auth/csrf                  → CSRF token cookie
3.  POST /api/auth/signin/resend         → Resend API → email sent
4.  User clicks link                     → ?token=...
5.  GET  /api/auth/callback/email        → token verified, session row written
6.  Browser cookie  next-auth.session-token  set, redirect to /dashboard
7.  Subsequent requests resolve via Auth.js → session.user.id → membership lookup → orgId
```

Auth.js v5 with `trustHost: true` (hardcoded in `lib/auth/config.ts`)
because we're always behind a reverse proxy.

### 4.4 Stripe webhook flow

```
Stripe POST /api/webhooks/stripe
   │
   ▼
Read header: Stripe-Signature
Read raw body via req.text() ── (DO NOT parse yet)
   │
   ▼
stripe.webhooks.constructEvent(rawBody, sig, WHSEC)
   │ — throws on bad sig → 400
   ▼
handleIdempotent("stripe", event.id, rawBody, async () => {
   │
   ▼  switch (event.type)
   ├── checkout.session.completed   → subscription active + provision devices
   ├── customer.subscription.updated → mirror plan + status
   ├── customer.subscription.deleted → org → suspended
   ├── invoice.payment_failed       → org → past_due, email owner
   └── charge.refunded              → audit log
})
   │
   ▼
200 { received: true }   (replays return { idempotent: true })
```

### 4.5 RLS multi-tenancy

Postgres provides hard row-isolation. The pattern:

1. Every multi-tenant table has `organization_id uuid NOT NULL`
2. Every such table has an RLS policy:
   ```sql
   CREATE POLICY tenant_isolation ON reviews
     FOR ALL TO app_tenant_user
     USING (organization_id = current_setting('app.current_org_id')::uuid);
   ```
3. The application connects as `app_tenant_user`. The DB itself enforces
   that you cannot read rows for an org other than the one currently
   set in the session variable.
4. The PostgreSQL session role `app_tenant_user` **does not have SELECT
   on `users`**. That's deliberate — auth-domain reads happen via a
   privileged direct-`prisma.user.findX` call, not inside the tenant
   transaction.
5. `withTenant(orgId, fn)` sets the variable and the role in one txn,
   runs `fn`, commits. Concurrency-safe because the setting is
   transaction-local.

### 4.6 Rate limiting

Defined in `lib/ratelimit/index.ts`. Backend chosen automatically:

- **Upstash Redis** if `UPSTASH_REDIS_REST_URL` is set (works across
  multiple app instances)
- **In-memory sliding window** otherwise (single-process; correct for
  single-VPS deployment)
- **Test environment** always passes (deterministic)

12 limiters defined. Examples:

| Limiter | Quota | Key |
|---|---|---|
| `ai_assistant` | 20 / 5 min | per (org, user) |
| `scan_redirect` | 60 / min | per (IP, slug) |
| `login_attempt` | 10 / 5 min | per email |
| `outreach_send` | 100 / min | per org |

Nginx adds a per-IP zone in front for belt-and-braces.

### 4.7 Encryption

- **Envelope encryption** for OAuth tokens (HubSpot, Google, Shopify,
  Mailchimp, Klaviyo, QuickBooks): per-tenant DEK encrypts the secret,
  KEK (`ENCRYPTION_MASTER_KEY`) encrypts the DEK
- **AES-256-GCM** with per-provider AAD so a stolen DEK can't be used
  for a different provider
- HMAC-SHA256 (`SLUG_HMAC_SECRET`) for QR slug signatures
- HMAC-SHA256 (`AUTH_SECRET` or optional `UNSUBSCRIBE_SECRET`) for
  email unsubscribe tokens

### 4.8 Observability

- **Structured logging**: Pino with 25+ redact paths (OAuth tokens,
  Stripe secrets, PII, webhook secrets, encryption material)
- **Error capture**: Sentry on server + client + edge (configured via
  `SENTRY_DSN`; no-op in dev without DSN)
- **Health**: `/api/health` with DB ping + env-key checks
- **Audit log**: Hash-chained, verifiable via `pnpm audit:verify`
- **Logs to journald** in production via systemd, retained by
  `SystemMaxUse` config; Nginx logs to `/var/log/nginx/repulabs.*`

---

## 5. Security Posture

### 5.1 Auth separation

| Domain | Cookie | Issued by |
|---|---|---|
| Tenant | `next-auth.session-token` | Auth.js v5 |
| Admin | `admin_session` | Custom (`lib/admin/session.ts`) |
| Widget visitor | `Authorization: Bearer <JWT>` | `/api/ai/widget/bootstrap` |

A compromised tenant cookie does not grant admin access. A compromised
admin cookie grants impersonation but read-only (DB-enforced).

### 5.2 Secret handling

- `lib/env.ts` Zod validator at boot — required-in-prod vars cause
  `process.exit(1)` if missing
- `lib/secrets.ts` `requireOrFallback()` — fails closed in prod, weak
  dev fallback in development only (logged once)
- No secrets in code; no `.env*` files committed (gitignore enforced)
- `.env.production` on VPS is mode 600, owned by `repulabs:repulabs`

### 5.3 Defenses

| Vector | Defense |
|---|---|
| XSS | CSP with `script-src 'self' 'unsafe-inline' https://js.stripe.com` (no `unsafe-eval` in prod) |
| Clickjacking | `X-Frame-Options: DENY` |
| Mixed content | HSTS `max-age=31536000; includeSubDomains; preload` |
| MIME confusion | `X-Content-Type-Options: nosniff` |
| Referrer leak | `Referrer-Policy: strict-origin-when-cross-origin` |
| Camera / mic abuse | `Permissions-Policy: camera=(), microphone=()` |
| CSRF on form posts | Next.js server actions are CSRF-protected by origin check |
| Brute force login | `login_attempt` rate limiter + fail2ban on SSH |
| SQL injection | Prisma parameterized everywhere; no raw template strings |
| Path traversal | None — file ops go through Vercel Blob (or S3) |
| Open redirect | All redirects validated against same-host |

### 5.4 Audit chain

`AuditLog` rows are hash-chained: each row's `chainHash =
SHA256(prev_chain_hash || row_payload)`. A tampered row breaks the
chain; `pnpm audit:verify` walks the chain and reports the first break.

---

## 6. Infrastructure & Deployment

### 6.1 Deployment target: Hostinger VPS (Ubuntu 22.04)

```
┌──────────────────────────────────────────────────────────┐
│  Hostinger VPS (KVM 2 or higher)                         │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Nginx (TLS 1.2/1.3, gzip, rate-limit zones)        │  │
│  └────────────────────────────────────────────────────┘  │
│           │                                              │
│           ▼ 127.0.0.1:3000                               │
│  ┌────────────────────────────────────────────────────┐  │
│  │ systemd: repulabs.service                          │  │
│  │   User: repulabs                                   │  │
│  │   Memory cap: 1.5 GB                               │  │
│  │   Restart on failure (max 3 in 30s)                │  │
│  │   ProtectSystem=strict, NoNewPrivileges, ...       │  │
│  │   ↓                                                │  │
│  │ pnpm exec next start -p 3000                       │  │
│  └────────────────────────────────────────────────────┘  │
│           │                                              │
│           ▼ (logs)                                       │
│  ┌────────────────────────────────────────────────────┐  │
│  │ journald (Pino JSON) + /var/log/nginx/repulabs.*   │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  certbot timer · fail2ban · ufw (22/80/443 only)         │
└──────────────────────────────────────────────────────────┘
            │                              │
            ▼                              ▼
    ┌──────────────┐               ┌──────────────┐
    │ Neon Postgres│               │ External APIs│
    │ (RLS + PITR) │               │ Anthropic    │
    └──────────────┘               │ Stripe       │
                                   │ Twilio       │
                                   │ Resend       │
                                   │ Google GBP   │
                                   └──────────────┘
```

### 6.2 Deploy artifacts shipped

| File | Purpose |
|---|---|
| `deploy/repulabs.service` | systemd unit with sandboxing (`ProtectSystem`, memory caps, restart limits) |
| `deploy/nginx.conf` | Reverse proxy with TLS, 3 rate-limit zones, Cloudflare real-IP support |
| `deploy/repulabs.logrotate` | 14-day Nginx log rotation |
| `scripts/deploy.sh` | git pull → install → migrate → build → restart → health-check with auto-rollback |
| `scripts/preflight.sh` | Local typecheck + lint + test + production build |
| `docs/DEPLOY_HOSTINGER.md` | End-to-end runbook (server hardening, certbot, monitoring) |
| `docs/SHIP_CHECKLIST.md` | 8-section pre-deploy gate run before every push |

### 6.3 Environment variables (production)

All vars validated at boot via `lib/env.ts`. Hard-fail-on-missing list:

| Var | Notes |
|---|---|
| `NODE_ENV=production` | Triggers strict validation |
| `NEXT_PUBLIC_APP_URL=https://repulabs.com` | Inlined into QR images |
| `AUTH_URL=https://repulabs.com` | Auth.js callback base |
| `AUTH_TRUST_HOST=true` | Required behind Nginx |
| `AUTH_SECRET` | 32-byte base64 |
| `DATABASE_URL` | Neon pooled |
| `DIRECT_URL` | Neon direct (migrations) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Live mode |
| `RESEND_API_KEY` | Verified sender |
| `ANTHROPIC_API_KEY` | |
| `ENCRYPTION_MASTER_KEY` | 32-byte base64 |
| `SLUG_HMAC_SECRET` | 32-byte base64 |
| `OAUTH_STATE_SECRET` | 32-byte base64 |
| `CRON_SECRET` | 32-byte base64 |

Optional but recommended: `SENTRY_DSN`, `UPSTASH_REDIS_REST_URL` /
`UPSTASH_REDIS_REST_TOKEN` (for Redis-backed rate limiting).

### 6.4 Scale path

| Phase | When | Action |
|---|---|---|
| Today → ~25k MAU | Now | Single Hostinger VPS, Cloudflare in front |
| 25k → 100k MAU | When VPS > 70% CPU sustained, or webhook drops appear | Migrate to AWS Fargate (1-2 tasks), keep Neon |
| 100k → 1M MAU | When p95 > 1.5s | Multi-AZ Fargate, RDS Proxy, S3 instead of Vercel Blob |
| 1M+ MAU | When | Aurora w/ read replicas, multi-region, CloudFront |

The `docs/AWS_DEPLOY.md` runbook lays out phase 2 onwards.

---

## 7. Verification Report — Smoke Test (2026-05-15)

A clean `next build` followed by `next start` in production mode was run
locally. Results:

```
Production build:
  ▲ Next.js 15.1.0
  ✓ Compiled successfully
  64 routes, 105 KB shared JS, 113 KB middleware
  BUILD_ID: written

Server boot:
  ▲ Next.js 15.1.0
  - Local: http://127.0.0.1:3100
  ✓ Starting...
  Ready in 1s

Health endpoint:
  $ curl -fsS http://127.0.0.1:3100/api/health
  {
    "status": "ok",
    "checks": {
      "db": "ok",
      "anthropic": "ok",
      "stripe": "ok",
      "voyage": "skipped",
      "resend": "ok"
    },
    "version": "0.1.0",
    "time": "2026-05-15T13:06:21.660Z",
    "latencyMs": 242
  }

Critical paths verified:
  GET /login              → 200, security headers present
  GET /admin              → 307 → /admin/login (cookie gate fires)
  GET /api/auth/csrf      → 200, fresh CSRF token returned

Env validator caught misconfig:
  When secrets were intentionally cleared:
    ✗ Environment validation failed (NODE_ENV=production):
      • CRON_SECRET: Required
      • ANTHROPIC_API_KEY: ANTHROPIC_API_KEY is required in production
  process.exit(1) — server refused to boot
```

---

## 8. Operational Playbook

### 8.1 Deploy a new version

```bash
# Local (before push):
pnpm preflight     # typecheck + lint + test + build

# On VPS:
ssh deploy@<vps-ip>
cd /var/www/repulabs
pnpm deploy        # auto: pull → install → migrate → build → restart → health-check
```

### 8.2 Roll back

```bash
cd /var/www/repulabs
cat .deploy-previous-sha
pnpm deploy --ref=<that-sha>
# Database migrations DO NOT auto-roll-back.
# If a migration broke things, restore via Neon → Branches → Restore.
```

### 8.3 Watch logs

```bash
sudo journalctl -u repulabs -f          # app logs (Pino JSON)
sudo tail -f /var/log/nginx/repulabs.access.log
sudo tail -f /var/log/nginx/repulabs.error.log
```

### 8.4 Check health remotely

```bash
curl -fsS https://repulabs.com/api/health | jq .
```

### 8.5 Create a new admin

```bash
pnpm admin:create  -- alice@repulabs.com super_admin
```

### 8.6 Verify the audit chain

```bash
pnpm audit:verify
# Walks the AuditLog hash chain. Exits 0 if intact; non-zero (with line
# number) at the first break.
```

---

## 9. Known Limitations & What's Next

### 9.1 Deferred (deliberately)

| Item | Why | When |
|---|---|---|
| Multi-region deployment | Not justified at zero users | At 100k+ MAU |
| Public REST API | Out of scope for v1 — internal use only | v2 (~6 mo out) |
| Multi-brand white-label | Scale tier feature | At Scale customer demand |
| SSO (SAML / OIDC) | Auth.js supports; not wired | First enterprise customer |

### 9.2 Known issues

| Issue | Severity | Workaround |
|---|---|---|
| Orphan migration `20260511110705_repuboost_day4` in Neon | Cosmetic | Ignore — Prisma only blocks on failed migrations |
| Pre-existing `delete` calls in `sentry.server.config.ts` flagged by Biome | Cosmetic | Correct code; `= undefined` would leave keys |
| `_document` PageNotFoundError during build | Cosmetic | Known Next.js 15 quirk; build succeeds (exit 0, BUILD_ID written) |
| Light a11y warnings on admin form labels | Low | Pre-existing; will resolve in next polish pass |

### 9.3 Things to watch on first deploy

1. **`.env.production` on VPS** — must be created and mode 600. The env
   validator will refuse to boot otherwise and the failure will be
   visible in `journalctl -u repulabs`.
2. **Migration `20260515120000_v7_fixes`** — applied automatically by
   `prisma migrate deploy`. Adds the `digest_runs` table (idempotency
   for daily-digest cron) and the `past_due` plan state.
3. **Stripe live webhook secret** — must match `https://repulabs.com/api/webhooks/stripe`,
   not the local `stripe listen` secret.

---

## 10. Documentation Map

The full doc set lives in `/docs`. Key entry points:

| Doc | When to read it |
|---|---|
| `README.md` | First — quick-start + doc table |
| `docs/STATE_OF_REPULABS.md` *(this doc)* | When you want the snapshot |
| `docs/DEPLOY_HOSTINGER.md` | First production deploy |
| `docs/SHIP_CHECKLIST.md` | Every production push |
| `docs/API.md` | When you need to call an endpoint |
| `docs/architecture/ARCHITECTURE.md` | Deep system design |
| `docs/architecture/DATA_MODEL.md` | Schema + RLS rationale |
| `docs/SECURITY_AND_OPS_REVIEW.md` | Findings from the 7-specialist security pass |
| `docs/runbooks/INDEX.md` | Incident response |

---

*End of state snapshot.*
