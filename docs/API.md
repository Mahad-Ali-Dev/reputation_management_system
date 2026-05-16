# Repulabs API reference

Last updated: 2026-05-15 · `git log -1 --oneline docs/API.md` for the canonical version.

This document covers every HTTP endpoint Repulabs exposes. It's the contract
between the Next.js server, the client, third-party webhook senders (Stripe,
Twilio), and our cron schedulers.

> **Status:** Repulabs does not currently expose a public REST API for
> third-party integrations. Every endpoint listed here is consumed by our
> own client, our webhook senders, our cron, our admins, or our chat
> widget. The shape and semantics may change at any time without notice.

---

## Conventions

### Base URLs

| Surface | Host | Notes |
|---|---|---|
| Tenant app | `https://repulabs.com` | Main SaaS surface |
| Admin | `https://admin.repulabs.com` | Routed via middleware subdomain rewrite |
| Edge redirect | `https://r.repulabs.com/{slug}` | QR scan endpoint, see `/r/[slug]` (page route, not under `/api`) |

### Auth schemes

Most routes use one of these mechanisms:

| Scheme | Used by | Verified in | Notes |
|---|---|---|---|
| **Auth.js session cookie** | tenant API | `auth()` from `@/lib/auth/config` | Magic-link or Google OAuth; sets `next-auth.session-token` |
| **Admin session cookie** | `/api/admin/*` + `/admin/*` | `getAdminSession()` | Separate JWT, not the same as tenant cookie |
| **Stripe signature** | `/api/webhooks/stripe` | `stripe.webhooks.constructEvent` | HMAC-SHA256, 300s skew tolerance |
| **Twilio signature** | `/api/voice/*`, `/api/webhooks/twilio/*` | `twilio.validateRequest` | Required when `TWILIO_AUTH_TOKEN` is set |
| **CRON_SECRET** | `/api/cron/*` | `verifyCronRequest()` | `Authorization: Bearer ${CRON_SECRET}` |
| **Visitor JWT** | `/api/ai/chatbot/*` | `verifyWidgetVisitor()` | 60-min token from widget bootstrap |
| **Public** | `/api/health` | — | No auth |

If a route returns **401 `{"error":"unauthenticated"}`**, the session is
missing or expired. **403 `{"error":"forbidden"}`** means the session is
valid but lacks permission (e.g. not an admin on an admin route).

### Error shape

All non-2xx responses return JSON of the form:

```json
{
  "error": "machine_readable_code",
  "message": "Human-readable explanation (optional)",
  "retryAfterSeconds": 60
}
```

`error` codes you'll see:

| Code | HTTP | Meaning |
|---|---|---|
| `unauthenticated` | 401 | No session |
| `forbidden` | 403 | Session lacks required role |
| `not_found` | 404 | Resource doesn't exist or isn't visible to caller |
| `invalid_body` | 400 | Request body failed Zod validation |
| `rate_limited` | 429 | Limiter exhausted; check `retryAfterSeconds` |
| `ai_budget_exceeded` | 429 | Org's daily AI cap hit |
| `internal` | 500 | Unhandled error; an entry was created in Sentry |

### Rate limits

All limits are sliding-window. Backed by Upstash Redis when configured,
in-memory otherwise (single-VPS deployments). See `lib/ratelimit/index.ts`.

| Limiter | Quota | Key |
|---|---|---|
| `ai_reply` | 30/min | per org |
| `ai_caption` | 20/min | per org |
| `ai_classify` | 60/min | per org |
| `ai_assistant` | 20 / 5min | per (org, user) |
| `url_crawl` | 10 / 5min | per org |
| `outreach_send` | 100/min | per org |
| `bulk_csv` | 5/hour | per org |
| `chatbot_turn` | 60/min | per visitor |
| `widget_bootstrap` | 30/min | per IP |
| `login_attempt` | 10 / 5min | per email |
| `signup_attempt` | 3/hour | per IP |
| `scan_redirect` | 60/min | per (IP, slug) |

Nginx adds a second layer of per-IP limits at the reverse proxy (see
`deploy/nginx.conf`).

### Idempotency

Webhooks (Stripe, Twilio) are idempotent on the provider's event ID via
`webhook_deliveries`. A re-delivery returns `200 {"ok":true,"idempotent":true}`
without reapplying the side-effect.

---

## Public

### `GET /api/health`

Uptime monitor target. Used by UptimeRobot and the homepage status badge.

| | |
|---|---|
| Auth | None |
| Rate limit | None (excluded from Nginx zones too) |
| Runtime | `nodejs` |

**Response:**

```json
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
  "time": "2026-05-15T08:42:13.184Z",
  "latencyMs": 42
}
```

Returns **200** when `db` check passes (the only SLO-critical dependency),
**503** otherwise. Other checks downgrade to `degraded` but stay 200.

---

## Tenant API (Auth.js session)

### `POST /api/billing/checkout`

Create a Stripe Checkout session for the org's Pro upgrade.

| | |
|---|---|
| Auth | Auth.js session + `orgId` |
| Rate limit | None app-side (Stripe rate-limits) |

**Body:** none.

**Response:**

```json
{ "url": "https://checkout.stripe.com/c/pay/cs_test_..." }
```

Errors: `unauthenticated` (401), generic 500 on Stripe failures.

### `POST /api/billing/portal`

Open the customer's Stripe Billing Portal for plan changes / invoices.

| | |
|---|---|
| Auth | Auth.js session + `orgId` |
| Rate limit | None |

**Response:**

```json
{ "url": "https://billing.stripe.com/p/session/..." }
```

### `GET /api/devices/[id]/qr?format=png|svg|pdf`

Generate the printable QR for a specific device.

| | |
|---|---|
| Auth | Auth.js session, RLS enforces org match |
| Rate limit | None |
| Response | `image/png`, `image/svg+xml`, or `application/pdf` |

Query params:

| Name | Default | Notes |
|---|---|---|
| `format` | `png` | `png` (300dpi), `svg`, `pdf` (8.5×11) |
| `size` | 300 | PNG pixel size (svg ignores) |
| `logo` | `1` | `0` to omit the centre logo overlay |

The QR content is `${NEXT_PUBLIC_APP_URL}/r/{shortSlug}`. The redirect target
(Google review URL) is signed at activation time — changing it without
re-signing breaks the redirect.

### `POST /api/ai/assistant`

In-app help bot (Ask AI button). Talks to Claude Haiku with a system prompt
that knows the product surface area.

| | |
|---|---|
| Auth | Auth.js session |
| Rate limit | `ai_assistant` (20 / 5min per user) |
| Budget | Counts against the org's `AI_TENANT_DAILY_CAP_MICROS` |

**Body:**

```json
{
  "messages": [
    { "role": "user", "content": "How do I connect Google Business Profile?" }
  ]
}
```

**Response:**

```json
{ "answer": "Settings → Connections → click Google → ..." }
```

Errors: `unauthenticated` (401), `rate_limited` (429),
`ai_budget_exceeded` (429), `invalid_body` (400), `internal` (500).

---

## AI · widget (cross-origin)

The embeddable chatbot widget runs on customer websites and authenticates
visitors via a short-lived JWT.

### `POST /api/ai/widget/bootstrap?key=PUBLIC_KEY`

Issue a 60-minute visitor JWT for the widget. Origin allowlist enforced
against the tenant's configured `widget_origins`.

| | |
|---|---|
| Auth | Public key in query + Origin header check |
| Rate limit | `widget_bootstrap` (30/min per IP) |

**Response:**

```json
{
  "visitorToken": "eyJ...",
  "expiresAt": "2026-05-15T09:42:00.000Z",
  "config": { "brandColor": "#2563eb", "greeting": "Hi!" }
}
```

### `POST /api/ai/chatbot/converse`

Single conversation turn.

| | |
|---|---|
| Auth | `Authorization: Bearer ${visitorToken}` |
| Rate limit | `chatbot_turn` (60/min per visitor) |
| Budget | Org's daily AI cap |

**Body:**

```json
{
  "conversationId": "uuid-or-null",
  "message": "What are your hours?"
}
```

**Response:**

```json
{
  "conversationId": "uuid",
  "answer": "We're open 8am–6pm Mon–Fri ...",
  "citations": [{ "title": "Store hours FAQ", "url": "https://..." }]
}
```

---

## Voice (Twilio webhooks)

All voice routes are POSTed by Twilio with form-urlencoded bodies and a
`X-Twilio-Signature` header. We verify the signature when `TWILIO_AUTH_TOKEN`
is set; in dev with no token, we accept unsigned requests.

### `POST /api/voice/incoming`

Twilio fires this when a call hits a number bound to a tenant. Returns
TwiML that opens the conversation with the configured greeting.

| | |
|---|---|
| Auth | Twilio signature |
| Response | `text/xml` (TwiML) |

### `POST /api/voice/respond`

Per-turn TwiML generator. Twilio fires this after each speech segment.

### `POST /api/voice/status`

Twilio call status callback (`ringing`, `in-progress`, `completed`,
`failed`). Updates `voice_calls.status`.

### `POST /api/voice/outbound`

Outbound campaign TwiML — uses the campaign script as the opening
line. Called by Twilio after we initiate the call from
`/api/cron/dispatch-outbound`.

---

## Webhooks

### `POST /api/webhooks/stripe`

All Stripe events the platform cares about.

| | |
|---|---|
| Auth | `Stripe-Signature` header (HMAC-SHA256, 300s skew) |
| Idempotency | On `event.id` via `webhook_deliveries` |
| Runtime | `nodejs` (raw-body needed for signature) |

Events handled:

| Event | Side-effect |
|---|---|
| `checkout.session.completed` | Mark subscription active, provision devices for hardware orders |
| `customer.subscription.updated` | Mirror plan + status into local `subscriptions` |
| `customer.subscription.deleted` | Mark org `suspended` |
| `invoice.payment_failed` | Email owner; mark `past_due` |
| `charge.refunded` | Audit-log the refund |

**Response:**

```json
{ "ok": true }
```

A bad signature returns `400 {"error":"bad_signature"}` — Stripe will retry.

### `POST /api/webhooks/twilio/sms-status`

Twilio delivery receipts for outreach SMS. Updates
`outreach_attempts.status` (`delivered`, `failed`, `undelivered`).

---

## Cron

Every cron route requires `Authorization: Bearer ${CRON_SECRET}` and returns
JSON. Trigger from `vercel.json` cron, Hostinger's crond, or any scheduler:

```
* * * * * curl -fsS -H "Authorization: Bearer ${CRON_SECRET}" https://repulabs.com/api/cron/dispatch-outbound
```

### `GET /api/cron/dispatch-outbound`

Pulls queued outbound voice-campaign targets and places calls via Twilio.
Respects per-campaign `ratePerMinute` and call-window timezone settings.
**Cadence: every 1 minute.**

### `GET /api/cron/daily-digest`

Sends per-org daily summary email to owners. **Cadence: hourly, gated on
each org's preferred-time zone.**

### `GET /api/cron/extract-topics`

Runs Claude Haiku topic extraction on un-extracted reviews (last 24h).
**Cadence: every 15 minutes.**

### `GET /api/cron/sync-reviews`

Pulls reviews from Google Business Profile for every connected
establishment via the GBP API. **Cadence: every 30 minutes.**

All cron routes return `200 { "ok": true, ...counters }` or `401` if the
secret is wrong.

---

## Admin

Separate auth domain. Cookie name `admin_session`. Verified in
`middleware.ts` (cookie presence check) and `app/admin/layout.tsx`
(full JWT verification). See `lib/admin/session.ts`.

### `POST /api/admin/login`

| | |
|---|---|
| Auth | None (this IS the login) |
| Rate limit | `login_attempt` (10 / 5min per email) |

**Body:** `{ "email": "you@repulabs.com", "password": "..." }`

**Response:** `200 { "ok": true }` and sets `admin_session` cookie.

Errors: `401 { "error": "invalid_credentials" }`.

### `POST /api/admin/logout`

Clears the `admin_session` cookie.

### `POST /api/admin/impersonate`

Start or end a read-only impersonation session. Audit-logged with the
required `reason`.

**Body (form-encoded):**

| Field | Required | Notes |
|---|---|---|
| `action` | yes | `start` or `end` |
| `orgId` | when `start` | Target org UUID |
| `reason` | when `start` | Min 6 chars (ticket ref, etc.) |

While impersonating, the admin's tenant requests run as RLS role
`app_tenant_reader` — all writes are rejected at the database level.

---

## Connections — OAuth dance

Per-tenant OAuth flows for connecting third-party platforms. Each provider
has an `authorize` (start) and `callback` (complete) endpoint:

| Provider | Authorize | Callback |
|---|---|---|
| Google Business Profile | `/api/connections/google/authorize` | `/api/connections/google/callback` |
| HubSpot | `/api/connections/hubspot/authorize` | `/api/connections/hubspot/callback` |
| Shopify | `/api/connections/shopify/authorize` | `/api/connections/shopify/callback` |
| Mailchimp | `/api/connections/mailchimp/authorize` | `/api/connections/mailchimp/callback` |
| Klaviyo | `/api/connections/klaviyo/authorize` | `/api/connections/klaviyo/callback` |
| QuickBooks | `/api/connections/quickbooks/authorize` | `/api/connections/quickbooks/callback` |

Pattern (identical across all providers):

1. **`GET /authorize`** — issues a state JWT (60s TTL, scoped to `orgId`),
   redirects to provider's OAuth start URL with our redirect URI.
2. **`GET /callback?code=...&state=...`** — verifies state JWT, exchanges
   `code` for access + refresh tokens, encrypts both with envelope encryption
   (AES-256-GCM, per-tenant DEK), stores in `connections` table.

Both endpoints require Auth.js session. Errors redirect to
`/connections?error=...`.

---

## Internal jobs

Triggered by QStash with HMAC signature verification
(`QSTASH_CURRENT_SIGNING_KEY`).

### `POST /api/jobs/digest-org`

Builds and sends one tenant's daily digest. Called by
`/api/cron/daily-digest` once per org.

### `POST /api/jobs/topic-extract`

Runs Claude on a batch of reviews to extract topic tags. Idempotent on
`(review_id, sentiment_extracted_at)`.

---

## Auth.js routes (provided by NextAuth v5)

`/api/auth/[...nextauth]` is auto-generated by NextAuth and handles every
session, sign-in, sign-out, callback, and CSRF endpoint:

| Route | Purpose |
|---|---|
| `GET /api/auth/session` | Current session (or `null`) |
| `POST /api/auth/signin/resend` | Trigger magic-link email |
| `POST /api/auth/signin/google` | Start Google OAuth flow |
| `GET /api/auth/callback/email` | Magic-link landing — exchanges token for session |
| `GET /api/auth/callback/google` | Google OAuth callback |
| `POST /api/auth/signout` | Clear session cookie |
| `GET /api/auth/csrf` | CSRF token for above endpoints |

`AUTH_TRUST_HOST=true` must be set in production (we're always behind a
reverse proxy) or Auth.js refuses to follow `X-Forwarded-*` headers.

---

## Dev-only

These are gated by `NODE_ENV !== "production"` and 404 in prod.

### `POST /api/dev/seed-review`

Insert a synthetic Review row scoped to the current org. Useful for testing
the AI reply pipeline without waiting for real reviews.

### `POST /api/dev/sync-subscription`

Force a refetch of the org's Stripe subscription state and mirror it
into local `subscriptions` table. Skips webhook flow.

---

## Auth-flow recipes

### Magic-link sign-in (tenant)

```bash
# 1. Get CSRF token
curl -c cookies.txt https://repulabs.com/api/auth/csrf

# 2. Request a magic link
curl -b cookies.txt -c cookies.txt \
  -X POST https://repulabs.com/api/auth/signin/resend \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "email=you@example.com&csrfToken=$(jq -r .csrfToken < cookies.txt)"

# 3. User clicks the email link → Auth.js sets session cookie via callback
```

### Admin sign-in

```bash
curl -X POST https://admin.repulabs.com/api/admin/login \
  -H "Content-Type: application/json" \
  -c admin-cookies.txt \
  -d '{"email":"admin@repulabs.com","password":"..."}'
# Sets admin_session cookie. Use that cookie for subsequent /admin/* requests.
```

### Triggering a cron manually

```bash
curl -fsS \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  https://repulabs.com/api/cron/dispatch-outbound
```

### Verifying a Stripe webhook signature locally

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
# stripe CLI prints the whsec_ secret — paste into STRIPE_WEBHOOK_SECRET
stripe trigger checkout.session.completed
```

---

## Adding a new endpoint

Follow this checklist:

1. Place under `app/api/<group>/<name>/route.ts`
2. Pick a runtime: `nodejs` for anything using Prisma, Node crypto, or
   Anthropic SDK; `edge` only for trivial response shaping
3. Set `dynamic = "force-dynamic"` if it reads request headers or session
4. Add auth: import `auth()`, `getAdminSession()`, or `verifyCronRequest()`
5. Add rate limit if it touches AI, sends external requests, or accepts
   public input (see `lib/ratelimit/index.ts` for the registry)
6. Wrap DB writes in `withTenant(orgId, async (tx) => ...)` so RLS
   predicates apply
7. Log structured events via `logger` — never `console.log`
8. Add the route to this doc

If the route is a webhook receiver, also:

- Disable body parsing (Next.js does this automatically when you call
  `req.text()` before parsing)
- Verify the provider's signature (HMAC for Stripe, validateRequest for
  Twilio, etc.)
- Insert into `webhook_deliveries` with the provider's event ID for
  idempotency

---

## Surface that **isn't** under `/api`

A few non-`/api` page routes participate in the HTTP surface too:

| Route | Purpose |
|---|---|
| `GET /r/{slug}` | QR redirect — 302s to the device's Google review URL |
| `GET /widget.js` | Embeddable chatbot widget bundle |
| `GET /widget` | Iframe host for the chatbot UI |
| `GET /activate` | Hardware activation code redemption page |

`/r/{slug}` has signature verification (defeats DB tampering) and
per-(IP, slug) rate limiting. See `app/r/[slug]/route.ts`.

---

## Out of scope for this doc

- Server actions (in `lib/*/actions.ts`) — these are not HTTP endpoints,
  they're React Server Action functions invoked by form posts. They share
  the same auth + rate-limit primitives.
- Database schema — see `prisma/schema.prisma`.
- Background workers — covered in `docs/architecture/`.
