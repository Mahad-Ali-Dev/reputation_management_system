# RepuBoost — 9-Day Solo Founder Implementation Plan

> **Document version**: 1.0
> **Date**: 2026-05-09
> **Status**: Reality-checked plan to ship a "complete-feeling" v1 in 9 days, solo, AI-paired
> **Replaces**: `docs/ROADMAP.md` 9-month plan for the founder's MVP push only — the original ROADMAP remains the post-launch north star

---

## 0. Honest Assessment (read this first)

You asked for the *complete app* in 9 days. Here is the truth.

The PRD enumerates **75+ features** across 4 personas. The original ROADMAP budgets ~14,400 person-hours over 9 months across 4 engineers. You have ~108 working hours over 9 days. With Claude/Cursor/AI pairing at a 3–5× multiplier, your effective ceiling is roughly **400–500 person-hour equivalent** — about **3% of the original budget**. The 15 critical security findings alone would consume 40+ hours.

**What "complete" can mean in 9 days:**
- A **demo-ready, beta-quality v1** that exercises the full loop (signup → trial → connect Google → fetch reviews → AI reply → publish → hardware order → activation → review request → survey → simple chatbot → admin) with **two channels at most per surface**.
- **30–40 of the 75+ features** ship; the rest are deferred — explicitly, not silently.
- **Security floor**: RLS canonical policy, envelope encryption for OAuth, webhook idempotency, OAuth state CSRF, signed redirect, audit log. Not SOC 2 evidence, not WebAuthn admin, not chaos drills.
- **One paying friendly customer can use it**, not 50 enterprises. Not pen-tested. Not multi-region. Not load-tested past 50 concurrent tenants.

If the real requirement behind "9 days" is "I need something to demo and onboard 1–5 friendly customers in 2 weeks", this plan delivers. If it's "I need a SOC2-ready competitor to Birdeye in 9 days", we should reset scope or timeline.

---

## 1. Scope Triage (the cuts that buy the time)

| Category | In v1 (Days 1–9) | Deferred to Days 10–30+ |
|---|---|---|
| Reviews | Google Business only, AI reply with Sonnet (≤3⭐) + Haiku (≥4⭐), human approve, manual + automated requests | Yelp, FB reviews, Google reply dispute API, sentiment topics, competitor tracking |
| Hardware | Review Stand SKU only, in-app order, slug + activation code, edge redirect, NFC URI generator (paper QR fine for v1) | Plaque, Card pack, smart-route NPS gate UI polish, NFC chip rewrite flow, ShipStation export, RMA |
| Social | **Google Business Posts only** (single channel) | FB / IG / LinkedIn / X composer, calendar, comments moderation, DM ingestion |
| Inbox | **Email + Google Q&A only** (2 channels) | FB messages, IG DMs, SMS inbox, web chat, assignment, internal notes |
| Surveys | Minimal builder (NPS + 1 free-text), email send, public response page, smart-route 4–5⭐ → review request | Conditional logic, SMS, coupons, scheduled, analytics dashboard |
| AI Chatbot | Simple FAQ chatbot — single uploaded doc per tenant, no rerank, Haiku + safety classifier | RAG with reranker, multi-doc, URL crawler, lead capture polish, voice handoff |
| Phone Receptionist | **Deferred entirely** (Phase 5) | All Twilio Voice work |
| Analytics | Postgres queries → 4 KPI tiles + reviews trend chart | ClickHouse, materialized views, scheduled reports, competitor tracking, revenue prediction |
| Admin | Tenant search, read-only impersonation, audit-log view, fulfillment queue | Refunds UI (do via Stripe dashboard), feature flags UI, alerts, MRR dashboard |
| Compliance | Terms + Privacy + cookie banner stubs, security.txt, sub-processors page | SOC 2, ISO 27001, DPA pack, full DSR portal, cookie consent vendor |
| Multi-tenancy | RLS canonical, envelope-encrypted OAuth tokens, webhook idempotency, OAuth state JWT, audit log, signed redirect | DB role split, hash-chain audit, Object Lock daily archive, WebAuthn admin, IAM Checkov gate, multi-region |
| Eval | Smoke tests + 1 hand-curated golden set per AI surface | Full eval CI gate, judge model, drift monitoring |
| Billing | Stripe Checkout + Customer Portal, 7-day trial, hardware Payment Intents, subscription webhooks | Coupons, dunning UI, pause, usage-metering for AI/SMS |
| Infra | Vercel + Fly.io single region, AWS RDS Postgres single-AZ, Upstash Redis, Cloudflare Worker for redirect, Sentry, Axiom logs | Aurora Multi-AZ, ElastiCache, ClickHouse, K8s, IaC scope |
| White-label / SSO / SAML / mobile native / multi-region | **None of it** | Phase 6 |

**Non-negotiables that survive the cut**: RLS, envelope encryption, OAuth state JWT, webhook idempotency, signed slug redirect, audit log, Stripe 7-day trial, hardware activation flow, AI safety classifier on review replies, Pino redaction.

---

## 2. Stack Choice (different from ROADMAP — optimized for 9 days)

| Layer | Choice | Why this differs from ROADMAP |
|---|---|---|
| Starter | **Fork Makerkit Next.js Supabase or shipped.club Next.js + Stripe** | Saves ~16h: org/membership/auth/billing already wired |
| Auth | **Auth.js v5** with Email magic link (Resend) + Google only | Drop Microsoft + Apple |
| DB | **Neon Postgres** (serverless, branchable) | Replaces Aurora — no AWS friction Day 1, branches give "staging" free |
| ORM | Prisma | Same |
| Queue | **Upstash QStash** for time-fired jobs + **Upstash Redis** + tiny worker on Fly.io | BullMQ requires a long-lived Redis + worker; QStash kills boilerplate for 80% of jobs |
| Hosting | **Vercel** for web, **Fly.io** 1 machine for the workers, **Cloudflare Worker** for `r.repuboost.io` | Same |
| UI | **shadcn/ui + Tailwind**, plus paid **shadcnblocks.com** + **TailGrids** for marketing/dashboard scaffolds | Buy templates, don't design |
| Payments | Stripe Checkout (hosted) + Customer Portal (hosted) | No custom Elements UI — too slow |
| AI | Anthropic SDK direct (Sonnet 4.6 + Haiku 4.5) — **prompt caching from day one** | Same |
| Email | Resend for transactional + outbound review-request | Drop SendGrid for now |
| SMS | Twilio (single provider, no fallback in v1) | Drop MessageBird |
| Embeddings | Voyage `voyage-3` only if chatbot ships Day 8 | Same |
| Observability | Sentry + Axiom + Better-Stack uptime — no Grafana, no OTEL | Cuts 8h |
| Domain | `repuboost.io` (or whatever founder owns) — `r.<root>` for redirect | Same |
| Repo | **Single Next.js app** (no Turborepo) — workers as separate repo if needed | Drop monorepo on day 1; promote later |

**Boilerplate buys (~$200 total, save 30+ hours)**:
- Makerkit Lite ($299) OR shipped.club starter ($79) for org+billing+auth scaffolding
- shadcnblocks pro license ($159) for app-shell, sidebar, data-table, settings pages
- TailGrids marketing blocks ($59) for landing + pricing
- Optional: a Tailwind admin template like TailAdmin (free or $59)

---

## 3. Pre-Flight Checklist (Day 0 — do this 24–48h before Day 1)

| Category | Item | Done? |
|---|---|---|
| Domain | Register `repuboost.io` (or final brand). Set up Cloudflare DNS as registrar nameservers | ☐ |
| Subdomains | Pre-create CNAME placeholders: `app`, `admin`, `r`, `chat`, `api` | ☐ |
| Accounts | GitHub org, Vercel team, Fly.io org, Cloudflare account, Neon, Upstash, Sentry, Axiom, Better-Stack | ☐ |
| Payment | Stripe account → test mode keys; bank info for live mode (live activation Day 9) | ☐ |
| AI | Anthropic console: 2 projects (`repuboost-dev`, `repuboost-prod`); prompt-caching enabled; $50/day cap on dev | ☐ |
| Email | Resend account, verify sending domain (DKIM/SPF/DMARC for `repuboost.io`) — DNS propagation takes hours | ☐ |
| SMS | Twilio account, buy 1 number, A2P 10DLC registration started (US) — this can take 1–7 days, kick off early | ☐ |
| Google | Google Cloud project, OAuth consent screen "Internal/External", **enable Google Business Profile API + request access** (Google partner approval is 24-72h, kick off Day 0!) | ☐ |
| Tools | Cursor + Claude Code + Linear (or just a Notion table) + Loom + Figma optional + Postman | ☐ |
| Hardware | Order 5 NTAG215 NFC stickers + 5 cardstock QR placeholders from Amazon ($30, 2-day ship) — physical demo on Day 9 | ☐ |
| Cards | Personal credit card on file for Vercel ($20), Fly ($5), Twilio ($20 prepaid), Anthropic ($100 prepaid), Resend (free), Sentry (free) | ☐ |
| Templates bought | Makerkit/Shipped + shadcnblocks + TailGrids licenses downloaded | ☐ |
| Founder onboarding | Pre-write your own brand voice (tone, do-not-say, signature) in a Markdown file — used for AI on Day 3 | ☐ |
| Legal stubs | Generate Terms, Privacy, sub-processors via Termly (free tier) | ☐ |

**Show-stopper risk**: Google Business Profile API access. If you don't have it by Day 3, the entire reviews loop is a stub. **Apply Day 0.**

---

## 4. Daily Standup Structure

**Each morning at hour 4 (10am if you start at 6am)** run a 10-minute self-check:
1. Yesterday's acceptance — did each box pass? (If no, it carries; today's scope shrinks.)
2. Are you on or off the daily 12h budget? (If you used 14h yesterday, drop the lowest-priority morning task today.)
3. Are blockers external (Google API, Twilio 10DLC, payment KYC)? Note in risk register.
4. Smoke-test deploy from yesterday: open the production URL, click 3 things. If broken, fix before new code.

**Each evening at hour 11**, before deploy:
1. Run the day's smoke checklist (each day defines 5 manual checks).
2. Push to staging branch → Vercel preview → click through.
3. Push to main → prod deploy.
4. Record a 60-second Loom of working state (your demo trail; also flushes panic).
5. Write 3 lines in DAY_LOG.md: shipped, broken, tomorrow.

---

## 5. AI-Pair Programming Protocol

**Claude/Cursor handles end-to-end (founder reviews diff before commit)**:
- Boilerplate UI: form pages, shadcn-block compositions, table columns, modal flows
- CRUD route handlers from a Zod schema → Prisma model → API
- Webhook signature verification per provider
- Test scaffolding (Vitest) — generates from API code
- Email templates (Resend React Email)
- shadcn theming + dark mode

**Founder writes / heavily reviews**:
- All RLS policies (every tenant table) — copy-paste the canonical pattern from `DATA_MODEL.md §2.2`
- Envelope encryption module (`packages/crypto`) — security-critical, no AI shortcuts
- Stripe webhook handler — idempotency + state machine
- OAuth state JWT + callback verification
- AI prompt strings — they are the product
- Anything touching `connections.access_token_ct` or `audit_log`

**Verification rule**: For anything security-critical (RLS, encryption, webhooks, auth), AI writes draft, founder reads line-by-line, runs the cross-tenant test, and only then commits. **Never ship security code on AI's word alone.**

**Prompt-cache your own context**: Keep a 2-page `PROJECT_CONTEXT.md` with stack, conventions, schema, RLS pattern. Paste at the start of every Cursor/Claude session. Saves 10 minutes of re-explaining per chat.

---

## 6. The 9-Day Plan

### Day 1 — Foundation, Auth, Tenancy, Stripe Skeleton
**Goal**: Sign up, create org, see empty dashboard, click "Upgrade" to Stripe Checkout test mode and back.
**Hours budget**: 12

#### Morning (6h)
- [ ] Fork Makerkit/shipped starter, rename to `repuboost`, push to GitHub. Vercel + Neon hooked up. (1.5h) — `apps/web`
- [ ] Drop in shadcnblocks app-shell + sidebar + topbar; brand colors + logo placeholder. (1h) — `apps/web/components/ui/*`, `globals.css`
- [ ] Prisma schema: `organizations`, `users`, `memberships`, `invitations`, `audit_log` (with hash chain placeholder column, no triggers yet). UUIDv7 default via `@better-auth/utils` or pg extension. Migrate. (1.5h) — `prisma/schema.prisma`
- [ ] **RLS canonical policy** applied to every tenant table via raw SQL migration: `USING + WITH CHECK + FORCE`. Helper: `withTenant(orgId, fn)` that calls `SET LOCAL app.current_org_id`. (1.5h) — `prisma/migrations/00X_rls.sql`, `lib/db/with-tenant.ts`
- [ ] Auth.js v5: Email magic link (Resend) + Google SSO. Signup creates org + owner membership in a transaction. (0.5h) — `app/api/auth/[...]/route.ts`

#### Afternoon (4h)
- [ ] Stripe SDK wired; create `pro_monthly` price; `/api/billing/checkout` returns Stripe Checkout URL with 7-day trial; success_url back to dashboard. Customer Portal endpoint. (2h) — `app/api/billing/*`, `lib/stripe.ts`
- [ ] Stripe webhook handler `/api/webhooks/stripe` with `webhook_deliveries` table + signature verify + idempotent INSERT. Handles `customer.subscription.created/updated/deleted`. (1.5h) — `prisma/schema.prisma`, `app/api/webhooks/stripe/route.ts`
- [ ] Middleware: subdomain routing (`app.*` → tenant, `admin.*` → admin) — Next.js middleware with host inspection. (0.5h) — `middleware.ts`

#### Evening (2h)
- [ ] Cross-tenant RLS smoke test: seed 2 orgs, query reviews_table without `withTenant` → expect 0 rows. Vitest test passes. (45m) — `tests/rls/cross_tenant.spec.ts`
- [ ] Pino + redaction config (email/phone/token) → Axiom transport. Sentry SDK wired. (30m)
- [ ] Deploy to prod, click signup → magic link → Google OAuth → see empty dashboard → Stripe Checkout (test card) → return. (45m)

**End-of-day acceptance**:
- [ ] New user can sign up via magic link OR Google
- [ ] After signup, exactly 1 organization + 1 owner membership exists
- [ ] RLS test passes (cross-tenant SELECT → 0 rows)
- [ ] Stripe Checkout opens; test card 4242 succeeds; `subscriptions.status` reflects active

**Cut if behind**: drop Google SSO (magic link only), drop Customer Portal (defer Day 9).

---

### Day 2 — Establishments, Connections, Google OAuth (Reviews Pipe)
**Goal**: User adds an establishment, connects their Google Business Profile, sees a list of "locations" returned from GBP.
**Hours budget**: 12

#### Morning (6h)
- [ ] Establishments CRUD UI: list + create + edit (name, category, timezone, address JSONB, brand_voice JSONB stub) + delete (soft). RLS-enforced. (2h) — `app/(tenant)/establishments/*`, `app/api/establishments/*`
- [ ] **Envelope encryption module**: AES-256-GCM with per-row IV, DEK encrypted by AWS KMS (or for v1, simpler `node:crypto` with a master key in env, document migration to KMS post-launch). EncryptionContext bound to `org_id + provider`. Helpers `encrypt(plaintext, ctx)` / `decrypt(ct, dek_ct, iv, ctx)`. (2h) — `lib/crypto/envelope.ts` + tests
- [ ] `connections` table per `DATA_MODEL.md §3.3` — full envelope columns. Prisma + raw SQL migration with RLS. (1h) — `prisma/migrations/00X_connections.sql`
- [ ] **OAuth state JWT** + `oauth_state_consumed` table + cookie hash binding. Helper `signOAuthState({orgId, userId, provider, pkceVerifier})` and `verifyOAuthState(stateParam, cookieSig)`. (1h) — `lib/oauth/state.ts`

#### Afternoon (4h)
- [ ] Google OAuth flow: `/api/connections/google/authorize` → Google → `/api/connections/google/callback` → exchange code (with PKCE) → fetch GBP locations → upsert connection (encrypted tokens) + log audit row. (2.5h)
- [ ] List GBP locations on the establishment edit page; let user pick one and persist `google_place_id` on `establishments`. (1h)
- [ ] Dashboard top-nav: "Connect Google" CTA when no connection; once connected, show check + "Manage". (30m)

#### Evening (2h)
- [ ] Smoke: signup → create estab → connect Google → see locations → save place_id → audit log shows the connect event. (1h)
- [ ] Decrypt round-trip test (Vitest): encrypt → store → fetch → decrypt → equal. (30m)
- [ ] Deploy + Loom. (30m)

**End-of-day acceptance**:
- [ ] Connect Google OAuth completes; tokens are stored encrypted (verify the bytea column starts with non-printable bytes, not the access token plaintext)
- [ ] Audit log row written for `connection.created`
- [ ] OAuth state nonce is single-use (replay rejected)

**Cut if behind**: skip PKCE for Google (it's optional but Google supports it — costs 30m), skip audit row (do Day 5).

---

### Day 3 — Reviews Loop (Fetch, AI Reply, Approve, Publish)
**Goal**: 5 stars and 1 star reviews appear in the dashboard within 15 min of posting; AI drafts replies; you click approve; the reply is posted to Google.
**Hours budget**: 12

#### Morning (6h)
- [ ] `reviews`, `review_replies` tables with RLS + indexes. (45m) — `prisma/migrations`
- [ ] Review-fetch worker (`apps/worker/src/jobs/review-sync.ts` on Fly.io OR a Vercel Cron + route handler — pick Vercel Cron for v1 to skip Fly.io until Day 4). Polls every 15 min per active connection: `accounts.locations.reviews.list`. Upserts on `(source, external_id)`. (2h)
- [ ] Reviews list UI: filterable by establishment, rating, has_reply. shadcn Data Table. (1.5h) — `app/(tenant)/reviews/page.tsx`
- [ ] Anthropic SDK wrapper `lib/ai/client.ts` with **prompt caching breakpoints** for `[GLOBAL_SYSTEM, BRAND_VOICE, FEW_SHOT]`. Logs `ai_messages` row with token + cost. (1.5h) — `lib/ai/*`, `prisma/schema.prisma`

#### Afternoon (4h)
- [ ] `POST /api/reviews/:id/reply/generate` — routes Sonnet for ≤3⭐ + long bodies, Haiku otherwise. XML-fences user content. Stores draft in `review_replies` with `status='pending_approval'` or `'pending_review'`. (1.5h)
- [ ] **Safety classifier** as a Haiku call returning structured JSON (`toxic|pii_leak|off_brand|jailbreak_attempt`). Any flag → force `pending_review`. (1h) — `lib/ai/safety.ts`
- [ ] Approve/edit/publish UI: drawer on review detail; on publish, calls Google `accounts.locations.reviews.updateReply`. (1h)
- [ ] Audit log entries for `review.reply.published`. (30m)

#### Evening (2h)
- [ ] End-to-end: post a real 5⭐ + 1⭐ test review on your own GBP → poll fires → reviews appear → AI drafts → you publish 5⭐ → check Google → reply visible. (1h)
- [ ] One golden-set unit test: 3 hand-crafted reviews + expected tone tags; assert classifier flags an obvious profanity case. (30m)
- [ ] Deploy + Loom (the money-shot demo). (30m)

**End-of-day acceptance**:
- [ ] Real GBP review appears in app within 15 min of posting
- [ ] AI generates a draft; classifier verdict logged
- [ ] Publish round-trips to Google and reply shows on the listing

**Cut if behind**: skip safety classifier (gate every reply through manual review for v1), skip few-shot brand voice (use system prompt only).

---

### Day 4 — Hardware: Catalog, Order, Edge Worker, Activation
**Goal**: User orders a Review Stand, pays via Stripe; on activation page, enters the printed code, scans the QR — gets redirected to their Google review URL with HMAC verification.
**Hours budget**: 12

#### Morning (6h)
- [ ] `hardware_products`, `hardware_orders`, `hardware_order_items`, `devices` tables per `DATA_MODEL.md §3.4` (full activation_code_hash, slug, slug_signature, redirect_url). Seed 1 product (`STAND_V1` $29). (1h)
- [ ] Hardware catalog + cart UI (1 product is enough); `POST /api/hardware/orders` creates Stripe Payment Intent (one-time, with shipping address collection via Stripe Checkout). (1.5h)
- [ ] Stripe webhook for `payment_intent.succeeded` → mark order paid → **provision N devices**: each gets a 10-char Crockford base32 slug + 8-char activation code (hashed) + `slug_signature = HMAC(SLUG_SECRET, slug || redirect_url || expires_at)`. (1.5h) — `lib/devices/provision.ts`
- [ ] **Cloudflare Worker** at `r.repuboost.io/:slug`: lookup KV → verify HMAC signature → 302 to redirect_url. KV miss → fetch from Postgres via Hono endpoint → backfill KV. Per-IP rate limit 50/min. (2h) — `apps/edge-redirect/src/index.ts`

#### Afternoon (4h)
- [ ] Activation page: `/activate` — owner enters code → `POST /api/devices/activate` → SHA-256 hash → match unactivated row → set org/establishment/redirect_url → push to KV. Rate limit + Turnstile after 3 failures. (1.5h)
- [ ] Print-PDF generator: server-side Puppeteer or `@react-pdf/renderer` route returns a PDF with QR (encoding `r.repuboost.io/{slug}`) + serial + activation code. Admin downloads it from the fulfillment queue (Day 5). (1.5h) — `app/api/admin/orders/:id/labels/pdf/route.ts`
- [ ] Beacon endpoint at the Worker: `POST r.repuboost.io/beacon` → write scan event to a `device_scans` Postgres table (no ClickHouse in v1). HMAC-bound; idempotent on `(slug, scan_id)`. (1h)

#### Evening (2h)
- [ ] Smoke: order in test mode → webhook fires → 3 devices created → download labels PDF → print on plain paper → tape QR to a sticky note → scan with phone → land on Google review URL. **Take a photo, you'll need it for the demo.** (1h)
- [ ] Tampering test: edit `redirect_url` in DB without re-signing → scan → edge rejects (signature fails) → falls through to Postgres → fixes it. (30m)
- [ ] Deploy + Loom. (30m)

**End-of-day acceptance**:
- [ ] Stripe test payment → 3 device rows exist with valid slugs + activation codes
- [ ] Activation flips a device from `unactivated` → `active`
- [ ] Real phone scan → 302 → Google reviews page in <500ms

**Cut if behind**: skip beacon (do Day 8), skip Turnstile (do Day 9), skip the PDF (admin can copy-paste codes from DB).

---

### Day 5 — Admin Panel + Audit Log View + Fulfillment Queue
**Goal**: An "us" admin (separate auth) signs into `admin.repuboost.io`, searches a tenant, opens a read-only impersonation, sees their reviews; runs the fulfillment queue and marks an order shipped.
**Hours budget**: 12

#### Morning (6h)
- [ ] `admin_users` table separate from `users`. Auth route at `/admin/login` — email + password (argon2id) + TOTP. **Defer WebAuthn** for v1; document as Day-15 work. IP-allowlist via Cloudflare Access if you have time, otherwise just tight rate limit. (2h)
- [ ] Admin shell (separate layout) at `/(admin)/*`. Tenant directory: search by name/email, paginated, plan + trial status badges. Uses `app_admin_reader` Postgres role *for v1 just bypass RLS via a connection that doesn't `SET LOCAL` — document the security gap, harden Day 12*. (1.5h)
- [ ] Tenant detail page: org info, members, establishments, recent reviews, hardware orders, audit log timeline. (1.5h)
- [ ] **Read-only impersonation**: clicking "Impersonate" sets `app.current_org_id` for that admin's session via a signed admin-impersonation cookie + writes `admin_impersonations` row. UI banner "Admin viewing — read only" stuck to top. Mutation routes 403 when admin-impersonation cookie present. (1h)

#### Afternoon (4h)
- [ ] Fulfillment queue: list `hardware_orders` where `status='paid'` or `'printing'`, "Generate labels PDF" + "Mark shipped" with tracking number input. Activates devices on ship. (1.5h)
- [ ] Audit-log view: filter by org, actor, action, time. Pagination. Export CSV button. (1.5h)
- [ ] Audit-log INSERT triggers + UPDATE/DELETE forbid trigger. Hash chain optional v1. (1h)

#### Evening (2h)
- [ ] Smoke: admin login → search a tenant → impersonate → reviews visible → try to publish a reply → 403 → end impersonation → audit log shows the impersonation. (1h)
- [ ] Mark a test hardware order shipped → tenant gets email "your stands shipped" → activation page works for codes. (30m)
- [ ] Deploy + Loom. (30m)

**End-of-day acceptance**:
- [ ] Two distinct auth surfaces: tenant on `app.*`, admin on `admin.*`. Crossing cookies rejected.
- [ ] Impersonation is read-only (mutations 403)
- [ ] Audit log has entries for `connection.created`, `review.reply.published`, `admin.impersonation.started`, `hardware.order.shipped`

**Cut if behind**: skip CSV export, skip read-only enforcement on admin (just don't render mutate buttons + document gap).

---

### Day 6 — Inbox (Email + Google Q&A) + Automated Review Requests
**Goal**: User sees Google Business Q&A questions in an inbox view; can reply. Sets up an automated SMS+Email review-request rule and triggers a manual send.
**Hours budget**: 12

#### Morning (6h)
- [ ] `inbox_threads`, `inbox_messages` tables with RLS. (30m)
- [ ] Google Q&A poller worker: every 15min per connection, fetch Q&A → upsert thread + message. Reply via GBP API. (2h)
- [ ] **Resend Inbound** for email replies: configure webhook → on inbound, parse `In-Reply-To`/`References` → match to thread → append message. Per-establishment routing email (`{slug}@inbox.repuboost.io`) configured via Resend domain. (2h) — **fallback if Resend Inbound is gated**: skip email channel, ship Q&A only and document
- [ ] Inbox UI: thread list + detail panel + reply box. shadcn split layout. AI suggest button (Haiku) for drafting replies. (1.5h)

#### Afternoon (4h)
- [ ] `review_requests` table + `sms_consents` + `unsubscribes` (the TCPA tables — DO NOT skip even in v1). RLS. (45m)
- [ ] Twilio: send SMS via `lib/sms/twilio.ts` with consent + unsubscribe checks. STOP keyword → upsert `unsubscribes`. (1.5h)
- [ ] Resend: review-request email template (React Email) with one-click unsubscribe header. (45m)
- [ ] UI: review-request page — paste phone or email, pick template, send now or schedule + 1d/3d/7d. Inserts `review_requests`, enqueues a QStash schedule. (1h)

#### Evening (2h)
- [ ] Smoke: post a Q&A question on your own GBP → appears in inbox within 15min → reply → check Google. (45m)
- [ ] Smoke: send yourself a test SMS review-request → click link → land on review URL via the same `r.repuboost.io/{slug}` path (build a one-off slug bound to the request). (45m)
- [ ] Deploy + Loom. (30m)

**End-of-day acceptance**:
- [ ] One Google Q&A thread visible and replyable
- [ ] Outbound SMS includes opt-out instructions and respects `unsubscribes`
- [ ] Review request creates a unique tracked link; click drives a `device_scans`-like row attributed to the request

**Cut if behind**: drop email-inbox channel (Q&A only); drop scheduled requests (immediate-send only); drop AI-suggest in inbox (canned templates).

---

### Day 7 — Surveys (Minimal) + Single-Channel "Social" (GBP Posts)
**Goal**: User builds a 3-question NPS survey, sends it to a list, public response page works, ≥4⭐ smart-routes to a review request. User schedules a Google Business post.
**Hours budget**: 12

#### Morning (6h)
- [ ] `survey_campaigns`, `survey_questions`, `survey_responses`, `survey_answers`, `survey_response_tokens` tables with RLS. (45m)
- [ ] Survey builder UI (no drag-drop): name + type (NPS only) + 1 free-text follow-up. Save draft. (1h)
- [ ] Send: insert tokens (single-use, 7-day expiry, hashed), email via Resend with `repuboost.io/s/{token}` link. (1.5h)
- [ ] Public response page (no auth): renders questions, validates token (single-use), saves answers. Cap 4KB body. Turnstile after 5 submissions/min/IP. (1.5h)
- [ ] Smart-route on submit: avg ≥4 → enqueue review request; ≤3 → mark for owner follow-up (email notification). (1.25h)

#### Afternoon (4h)
- [ ] `social_posts` + `social_post_targets` tables (single channel = `gbp` only for v1). RLS. (45m)
- [ ] Composer UI: textarea + media upload (S3/R2) + scheduler. AI caption button (Haiku). (1.5h)
- [ ] Worker / QStash schedule: at `scheduled_for`, call GBP `accounts.locations.localPosts.create`. Status updates. (1.5h)
- [ ] Calendar view: simple list grouped by date. (15m)

#### Evening (2h)
- [ ] Smoke: build NPS → send to your own email → submit 5 → see review-request fire to phone → SMS arrives. (45m)
- [ ] Smoke: schedule a GBP post for "in 5 minutes" → wait → check it on the listing. (45m)
- [ ] Deploy + Loom. (30m)

**End-of-day acceptance**:
- [ ] Survey token rejects on second use
- [ ] ≥4⭐ NPS submission triggers a review_request row
- [ ] GBP post appears on the listing within 30s of scheduled_for

**Cut if behind**: drop the AI caption; drop the calendar; drop media upload (text-only post).

---

### Day 8 — Simple FAQ Chatbot + Analytics + Polish Pass 1
**Goal**: Tenant uploads 1 FAQ document, embeds a `<script>` widget on a test page, asks "what are your hours" and gets the right answer with safety classifier on output. Analytics tab shows 4 KPI tiles + a 30-day reviews chart.
**Hours budget**: 12

#### Morning (6h)
- [ ] `ai_documents` + `ai_embeddings` (pgvector) + `ai_conversations` + `ai_messages` + `ai_safety_verdicts` + `widget_keys` tables. RLS. Enable pgvector extension on Neon. (1h)
- [ ] Doc upload route: PDF → text via `pdf-parse`, or paste text. Chunker: header-aware for markdown, otherwise sentence-window. Embed via Voyage `voyage-3`. Insert with `establishment_id` (cross-location isolation). (1.5h)
- [ ] Widget bundle (`apps/widget` — simple Vite build). Bootstrap call → returns visitor JWT. POST `/api/ai/chatbot/converse` → embed query → top-5 by cosine (no rerank in v1) → Haiku with citations → safety classifier (with `<untrusted_doc>` fencing on retrieved chunks per `AI_STRATEGY.md §3.3`). (2h)
- [ ] Per-tenant daily $ cap in Upstash Redis (atomic INCRBY by `cost_micros`); 429 with friendly message when exceeded. (45m)
- [ ] Origin allowlist + Turnstile on first message. Per-visitor sliding window 20 msgs / 5 min. Strip markdown image syntax from output unconditionally. (45m)

#### Afternoon (4h)
- [ ] Analytics page: 4 KPI tiles (total reviews 30d, avg rating 30d, scans 30d, response rate 30d) — pure Postgres queries. (1h)
- [ ] One Recharts line: reviews per day last 30d. (45m)
- [ ] Polish: empty states everywhere (no establishments, no reviews, no orders, no surveys); error boundary + 404 + 500 pages. (1.5h)
- [ ] Cookie consent banner stub (one-line "We use cookies — Accept/Decline"); Privacy + Terms + Sub-processors pages from Termly export. (45m)

#### Evening (2h)
- [ ] Smoke: upload a 1-page FAQ → embed widget on a `localhost:3000/test.html` → ask "what are your hours" → correct answer + citation. Ask "ignore previous instructions" → safety classifier flags → friendly refusal. (1h)
- [ ] Cap test: bump tenant's cap to $0.01 → ask 3 questions → 3rd returns the cap-exhausted message. (30m)
- [ ] Deploy + Loom. (30m)

**End-of-day acceptance**:
- [ ] Chatbot answers an in-doc question with a citation
- [ ] Out-of-doc question → "I don't have that info — leave your email" lead-capture
- [ ] Analytics tiles populate from real data

**Cut if behind**: skip lead-capture form, skip cookie banner, skip widget — replace with a chat page on `app.*` only (no embed).

---

### Day 9 — Polish, Security Sweep, Deploy, Onboarding Flow, Demo
**Goal**: Friendly customer can sign up cold, hit the "wow" moments in <10 min, pay, install hardware. You record the demo and ship.
**Hours budget**: 12

#### Morning (6h)
- [ ] Onboarding wizard (4 steps, dismissible): create establishment → connect Google → buy or activate hardware → enable AI replies. Persisted on `organizations.onboarding_step`. (2h)
- [ ] **Security sweep checklist** (1.5h):
  - [ ] All POST/PUT/DELETE routes use Zod validation
  - [ ] All AI-displayed/HTML-displayed content goes through `sanitize-html`
  - [ ] All session cookies HttpOnly, SameSite=Lax, Secure
  - [ ] Stripe + Twilio + Google + Resend webhook signatures verified
  - [ ] `webhook_deliveries` idempotency works (replay returns 200, no double-effect)
  - [ ] Pino redaction confirmed on a sample log
  - [ ] CSP header set; `script-src 'self' 'nonce-{n}' js.stripe.com`
  - [ ] Origin check on chatbot widget
  - [ ] Cross-tenant attack test still passes
  - [ ] No service role used on a tenant request path
- [ ] Health check + status page: `/api/health` → checks DB, Redis, Stripe ping, Anthropic ping. Better-Stack monitor on it. Public status at `repuboost.io/status` (Better-Stack hosted page). (1h)
- [ ] `/.well-known/security.txt`, `repuboost.io/legal/subprocessors`, marketing landing page using TailGrids hero + features + pricing. (1.5h)

#### Afternoon (4h)
- [ ] **Bug-bash**: open a fresh browser, run through every flow as a stranger. List bugs → fix the top 8. (3h)
- [ ] Stripe live mode activation: KYC if not done; flip API keys; test one $1 charge with a real card; refund yourself. (1h)

#### Evening (2h)
- [ ] **Final smoke (the demo script)**: signup → onboarding → connect Google → reviews appear → AI reply → publish to Google → order hardware (real $) → activation → scan QR → review request flow → survey → smart-route → chatbot answers a doc Q. (1h)
- [ ] Record 5-min walkthrough Loom for sales/onboarding. Push DNS + final deploy. Send announcement to your 5 friendly users with their seed accounts. (1h)

**End-of-day acceptance**:
- [ ] Cold sign-up to "first reply published" in <10 min
- [ ] Real money charge succeeds end-to-end (Pro subscription + 1 hardware order)
- [ ] Public status page green
- [ ] `repuboost.io` marketing site live with signup CTA

**Cut if behind**: don't activate live Stripe today — keep test mode through the friendly-customer week, real launch Day 11.

---

## 7. Risk Register (top 10 things that will go wrong)

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | Google Business Profile API access not granted by Day 3 | High | Catastrophic for Day 3 | Apply Day 0; have a recorded "demo with mock GBP data" Loom as fallback to keep momentum |
| 2 | Twilio A2P 10DLC not approved by Day 6 | High | High | Use Twilio test creds for SMS demo; switch to TollFree route which is faster; mark SMS "beta" until approved |
| 3 | Resend domain DKIM/DMARC not propagated by Day 6 | Medium | Medium | Verify Day 0; fallback to Resend's test domain `onboarding@resend.dev` |
| 4 | Founder hits the wall around Day 5 (energy / sleep) | High | Critical | Mandatory 6h sleep; cut Day 5 admin scope to "search + impersonate" only; defer fulfillment queue to Day 7 |
| 5 | RLS policy misses a table → data leak | Medium | Catastrophic | Cross-tenant test runs in CI on every commit; review every migration line-by-line |
| 6 | Anthropic spend spikes due to a bug | Medium | High | $50/day project cap on dev; per-tenant $1/day cap in Redis; alert at 50% |
| 7 | Stripe webhook misses an event during deploy → subscription out of sync | Medium | High | `webhook_deliveries` idempotency; daily reconcile job (Day 11+); use Stripe's "resend webhook" to replay |
| 8 | Cloudflare Worker KV propagation delay → broken QR for ~60s post-activation | Medium | Low | Postgres fall-through path handles cache miss; warn user "give it a minute" on activation success |
| 9 | A friendly customer hits a security bug / data leak in week 1 | Medium | Catastrophic | Limit to 5 friendly orgs; keep nightly Postgres snapshots in a different region; have a written breach-notification stub |
| 10 | Third-party outage (Anthropic / Google / Stripe) on demo day | Medium | High | Chatbot has canned fallback; review reply queues; subscription state cached server-side; status page tells the truth |

---

## 8. End-of-Day-9 Feature Inventory

**Legend**: ✅ shipped • ⚠️ partial / scaffolded • ❌ deferred

### Reviews & Replies
- ✅ F1 Google Business OAuth + 15-min poll
- ✅ F4 AI reply (Sonnet ≤3⭐ + Haiku ≥4⭐) with safety classifier
- ✅ F5 One-click approve + publish
- ⚠️ F2 SMS + email review requests (no scheduled bulk CSV)
- ⚠️ F3 Custom timing (immediate + 1d/3d/7d only)
- ❌ F6 Dispute via Google flagging API
- ❌ F7 Topic extraction

### Hardware
- ✅ H1 Review Stand SKU + ordering + Stripe payment
- ✅ H4 Activation flow (slug + activation code)
- ✅ H5 Edge redirect + signed signature
- ⚠️ H6 Per-device scan count (no cohort funnel chart)
- ❌ H2 Plaque, H3 Cards
- ❌ NFC chip rewrite UI

### Social
- ⚠️ S2/S3 GBP-only post composer + scheduler (single channel)
- ⚠️ S4 AI caption (Haiku)
- ❌ S1 Multi-account (FB/IG/LinkedIn/X)
- ❌ S5 Comment moderation
- ❌ S6 Mention monitoring
- ❌ S7 DM → ticket

### Surveys
- ✅ Q1 Builder (NPS-only, no conditional logic)
- ✅ Q2 Email distribution
- ✅ Q5 Results page
- ✅ Q6 Smart-route 4–5⭐ → review request
- ❌ Q3 Coupon engine
- ❌ Q4 Conditional logic
- ⚠️ SMS distribution (only on review-request channel, not on surveys)

### AI
- ✅ A1 FAQ chatbot widget (single-doc, no rerank)
- ⚠️ A2 RAG over uploaded doc (1 doc per tenant, no URL crawl, no PDF complex)
- ✅ A4 AI review reply
- ✅ A5 AI social caption
- ⚠️ A6 Sentiment (just rating-based for now)
- ❌ A3 AI Phone Receptionist

### Inbox
- ✅ I1 (subset) Google Q&A + Email channels
- ⚠️ I3 AI suggest reply
- ❌ FB / IG / SMS / Webchat channels
- ❌ I2 Assign / mention / internal notes

### Multi-location
- ✅ E1 Establishments CRUD
- ✅ E2 Per-establishment Google connection
- ⚠️ E3 Org-level RBAC only (no per-establishment ACL)
- ❌ E4 Bulk operations

### Analytics & Reports
- ⚠️ R1 4 KPI tiles + reviews trend (Postgres-backed)
- ❌ R2/R3/R4/R5

### Admin
- ✅ AD1 Tenant search
- ✅ AD2 Read-only impersonation
- ✅ AD3 Fulfillment queue
- ✅ AD8 Audit log view
- ❌ AD4 Refunds (use Stripe dashboard)
- ❌ AD5 Feature flags UI
- ❌ AD6 System alerts
- ❌ AD7 MRR dashboard

### Account & Billing
- ✅ B1 Email + Google SSO
- ✅ B2 7-day trial no card
- ✅ B3 Stripe subscription
- ✅ B6 Connections page
- ⚠️ B7 Account settings (password reset works; 2FA deferred)
- ❌ B5 Usage-based add-ons UI

### Security
- ✅ RLS canonical + cross-tenant test
- ✅ Envelope encryption (KMS optional, master-key acceptable for v1)
- ✅ Webhook idempotency
- ✅ OAuth state JWT + PKCE (Google)
- ✅ Signed slug redirect
- ✅ Audit log INSERT-only
- ✅ Pino redaction
- ✅ TCPA tables (consent + unsubscribe)
- ⚠️ Admin auth (TOTP, no WebAuthn yet)
- ❌ DB role split (`app_admin_reader/writer`)
- ❌ Audit log hash chain + S3 Object Lock archive
- ❌ IAM Checkov gate (no IaC yet)
- ❌ SOC 2 evidence

---

## 9. Post-9-Day Roadmap (Days 10–30)

**Days 10–14 — Stabilize & ship to first 5 friendlies**
- Fix every bug your 5 customers hit
- Add SMS for review requests with proper A2P 10DLC sender ID
- Add WebAuthn admin
- DB role split
- Daily Postgres backup + restore drill
- Email digest of yesterday's reviews per tenant

**Days 15–22 — Second channel sweep**
- FB Pages + IG Business OAuth + posting
- FB Messages + IG DMs in inbox
- Sentiment + topic extraction worker
- Dispute flow
- Better-Stack + Sentry alerts wired to PagerDuty/SMS
- Audit log hash chain + S3 Object Lock archive

**Days 23–30 — Scale & quality**
- ClickHouse setup for analytics + materialized views
- Reranker for chatbot RAG; multi-doc + URL crawl
- Eval golden set in CI (one per AI surface)
- Per-establishment RBAC
- Bulk CSV review requests
- LinkedIn + X
- Performance pass: bundle budget, p95 latency targets

**Days 31–60 — Phase 2 of original ROADMAP**
- AI Phone Receptionist starts
- White-label / SAML — only when an enterprise asks

---

## 10. Daily Time Budget Sanity Check

```
Day 1: 12h × 1 = 12h cumulative   (1.4% of original 14,400h budget)
Day 2: 24h     (Stack should be self-sustaining now)
Day 3: 36h     (The product loop is alive)
Day 4: 48h     (Hardware demo-able)
Day 5: 60h     (Internal ops viable)
Day 6: 72h     (Outbound channels live)
Day 7: 84h     (Surveys + a social channel)
Day 8: 96h     (AI surface complete-feeling)
Day 9: 108h    (Shipped)
```

108h × 4× AI multiplier = ~432 effective person-hours. Roughly equal to **3 weeks of one engineer at full pace**, distributed across 9 calendar days. That's the math. It is *possible*; it is not *sustainable* — plan a 3-day recovery window after Day 9.

---

## 11. Definition of "Shipped" on Day 9

Concrete acceptance for the founder to mark Day 9 done:

1. A friend you haven't briefed can sign up at `repuboost.io`, complete onboarding, connect their Google Business, and publish 1 AI-drafted reply within 15 minutes — without you over their shoulder.
2. They can pay $167 with a real card and the subscription state is correct in Stripe + your DB.
3. They can place a $29 hardware order; you ship 3 stands within 24h; they activate them; a customer's QR scan lands on the right Google review URL.
4. The cross-tenant RLS test passes in CI.
5. `repuboost.io/status` is green; `/.well-known/security.txt` is reachable; Privacy + Terms + Sub-processors pages exist.
6. You have a 5-min Loom of the full loop.

If all 6 are true, you shipped. If not, the gap is your Day-10 scope.
