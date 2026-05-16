# API Surface — RepuBoost

> REST + JSON over HTTPS. Authentication via session cookie (web) or API key (programmatic). Versioned at `/api/v1/...`. Webhooks signed with HMAC-SHA256.

---

## 1. Conventions

- **Base URL**: `https://app.repuboost.io/api/v1`
- **Auth**:
  - Web: HttpOnly session cookie (Auth.js)
  - Programmatic: `Authorization: Bearer rb_live_...` (per-org API key)
- **Tenant scope**: derived from session/API key — never accepted from client param
- **Pagination**: cursor-based: `?cursor=...&limit=50` → `{data, next_cursor}`
- **Errors**: RFC 7807 problem+json
  ```json
  { "type": "/errors/validation", "title": "Validation failed", "status": 422, "detail": "...", "errors": [...] }
  ```
- **Idempotency**: `Idempotency-Key` header on all POST/PUT/DELETE
- **Rate limits**: returned in `X-RateLimit-*` headers

---

## 2. Endpoints by Module

### 2.1 Auth & Onboarding

| Method | Path | Description |
|---|---|---|
| POST | `/auth/signup` | Create org + owner user, start trial |
| POST | `/auth/login` | Email/password or magic link |
| POST | `/auth/sso/google` | Google OAuth callback |
| POST | `/auth/logout` | End session |
| POST | `/auth/2fa/enable` | Enroll TOTP |
| POST | `/auth/2fa/verify` | Verify TOTP code |
| POST | `/auth/password/reset` | Send reset email |
| GET  | `/auth/me` | Current user + memberships |

### 2.2 Organizations & Members

| Method | Path | Description |
|---|---|---|
| GET | `/organizations/current` | Current org settings |
| PATCH | `/organizations/current` | Update name, slug, logo |
| GET | `/organizations/current/members` | List members |
| POST | `/organizations/current/invitations` | Invite user |
| DELETE | `/organizations/current/members/:user_id` | Remove member |
| PATCH | `/organizations/current/members/:user_id` | Change role |

### 2.3 Establishments

| Method | Path | Description |
|---|---|---|
| GET | `/establishments` | List org's establishments |
| POST | `/establishments` | Create — Free tier capped at 1 |
| GET | `/establishments/:id` | Get one |
| PATCH | `/establishments/:id` | Update name, address, brand voice |
| DELETE | `/establishments/:id` | Soft-delete |
| GET | `/establishments/:id/members` | Per-establishment ACL |
| POST | `/establishments/:id/members` | Grant access |

### 2.4 Connections (OAuth)

| Method | Path | Description |
|---|---|---|
| GET | `/connections` | List connected providers |
| GET | `/connections/:provider/authorize` | Redirect to OAuth start (state-signed, see below) |
| GET | `/connections/:provider/callback` | OAuth callback handler |
| DELETE | `/connections/:id` | Revoke + delete tokens |
| POST | `/connections/:id/refresh` | Force token refresh |
| POST | `/connections/:id/test` | Verify connection works |

**OAuth state pattern** (mandatory CSRF + tenant-fixation defense):

```ts
// /authorize handler
const nonce = crypto.randomUUID();
const pkceVerifier = generatePKCEVerifier();
const state = jwt.sign(
  { orgId, userId, nonce, provider, pkce: pkceVerifier },
  OAUTH_STATE_SECRET,
  { expiresIn: '10m' }
);
res.cookie('oauth_state_sig', sha256(state), {
  httpOnly: true, sameSite: 'lax', secure: true, maxAge: 600_000,
});
return redirect(buildAuthorizeUrl(provider, state, pkceChallenge(pkceVerifier)));

// /callback handler
const claims = jwt.verify(req.query.state, OAUTH_STATE_SECRET);
if (sha256(req.query.state) !== req.cookies.oauth_state_sig) reject();
if (claims.userId !== req.session.userId) reject();
// Single-use enforcement:
const consumed = await db.oauthStateConsumed.upsert({ nonce: claims.nonce, ... });
if (!consumed) reject();
// PKCE:
const tokens = await provider.exchange({ code: req.query.code, code_verifier: claims.pkce });
```

PKCE is mandatory for every provider that supports it (Google, Meta, X, LinkedIn).

### 2.5 Reviews

| Method | Path | Description |
|---|---|---|
| GET | `/reviews` | List with filters: ?establishment_id, ?source, ?rating, ?from, ?to, ?has_reply |
| GET | `/reviews/:id` | Get one with reply + dispute |
| POST | `/reviews/:id/reply` | Manual reply |
| POST | `/reviews/:id/reply/generate` | AI-suggest reply (returns draft) |
| POST | `/reviews/:id/reply/:reply_id/publish` | Approve & publish |
| POST | `/reviews/:id/dispute` | File dispute with Google |
| POST | `/reviews/sync` | Force re-sync from connected sources |
| GET | `/reviews/stats` | Aggregate: avg rating, distribution, velocity |

### 2.6 Review Requests (outbound)

| Method | Path | Description |
|---|---|---|
| GET | `/review-requests` | List sent + queued |
| POST | `/review-requests` | Send single SMS/email |
| POST | `/review-requests/bulk` | CSV upload — bulk send |
| POST | `/review-requests/templates` | CRUD message templates |
| GET | `/review-requests/:id` | Status + delivery |
| POST | `/review-requests/automations` | Configure trigger rules (e.g., Shopify order delivered → +3d → request) |

### 2.7 Devices (hardware in field)

| Method | Path | Description |
|---|---|---|
| GET | `/devices` | List org's devices |
| POST | `/devices` | Provision (admin only — usually from order fulfillment) |
| POST | `/devices/activate` | Customer activation: `{activation_code, establishment_id, redirect_mode}` — claims an unactivated device |
| GET | `/devices/:id` | Detail with scan stats |
| PATCH | `/devices/:id` | Update redirect URL, pause; logged + alert if changed outside deploy window |
| POST | `/devices/:id/nfc-rewrite` | Re-bind NFC chip; requires (a) authenticated owner/admin, (b) physical NFC UID submitted with request, (c) audit + email to org owner |
| GET | `/devices/:id/scans` | Scan history |
| POST | `/devices/:id/test` | Test redirect chain |

**Activation flow**:
- `activation_code` is hashed (SHA-256) before lookup; matched against `devices.activation_code_hash`
- One-time use: `activation_code_used_at` set on success → subsequent attempts reject
- Rate limited: 10 attempts per IP per hour (Cloudflare Turnstile after 3 failures)
- On success: device `status` flips `unactivated → active`, `organization_id` and `establishment_id` populated, default `redirect_url` built from establishment's Google Place ID

### 2.8 Hardware Orders

| Method | Path | Description |
|---|---|---|
| GET | `/hardware/products` | Catalog |
| POST | `/hardware/orders` | Place order (creates Stripe PaymentIntent) |
| GET | `/hardware/orders` | List org's orders |
| GET | `/hardware/orders/:id` | Status + tracking |

### 2.9 Social

| Method | Path | Description |
|---|---|---|
| GET | `/social/accounts` | Connected social accounts |
| GET | `/social/posts` | List drafts + scheduled + published |
| POST | `/social/posts` | Create post (with target accounts) |
| PATCH | `/social/posts/:id` | Edit (only if not yet published) |
| DELETE | `/social/posts/:id` | Cancel |
| POST | `/social/posts/:id/publish` | Publish now (override schedule) |
| POST | `/social/posts/generate-caption` | AI caption suggestion |
| GET | `/social/calendar` | Calendar view ?from&to |
| GET | `/social/comments` | Inbound comments needing moderation |
| POST | `/social/comments/:id/hide` | Hide / report spam |

### 2.10 Surveys

| Method | Path | Description |
|---|---|---|
| GET | `/surveys/campaigns` | List |
| POST | `/surveys/campaigns` | Create campaign |
| GET | `/surveys/campaigns/:id` | Detail with questions |
| PATCH | `/surveys/campaigns/:id` | Edit |
| POST | `/surveys/campaigns/:id/launch` | Activate |
| POST | `/surveys/campaigns/:id/send` | Manual send to recipients |
| GET | `/surveys/responses` | List responses |
| GET | `/surveys/responses/:id` | Detail + answers |
| POST | `/surveys/public/:token/respond` | Public submit endpoint (no auth) |

### 2.11 Inbox

| Method | Path | Description |
|---|---|---|
| GET | `/inbox/threads` | List ?status&channel&assignee |
| GET | `/inbox/threads/:id` | Thread + messages |
| POST | `/inbox/threads/:id/messages` | Send reply |
| POST | `/inbox/threads/:id/notes` | Internal note |
| PATCH | `/inbox/threads/:id` | Update status, assignee |
| POST | `/inbox/threads/:id/ai-suggest` | AI reply suggestion |
| WS | `/inbox/realtime` | Live thread updates (Socket.IO/SSE) |

### 2.12 AI

| Method | Path | Description |
|---|---|---|
| GET | `/ai/documents` | Knowledge docs |
| POST | `/ai/documents` | Upload doc (PDF, URL, text) |
| DELETE | `/ai/documents/:id` | Remove + delete embeddings |
| POST | `/ai/chatbot/converse` | Visitor message → response (used by widget) |
| POST | `/ai/chatbot/widget/config` | Widget appearance settings |
| GET | `/ai/conversations` | Past chatbot sessions |

### 2.13 Phone Receptionist (P2)

| Method | Path | Description |
|---|---|---|
| GET | `/phone/numbers` | Connected numbers |
| POST | `/phone/numbers/provision` | Buy/port a Twilio number |
| GET | `/phone/calls` | Call log |
| GET | `/phone/calls/:id` | Transcript + recording |
| POST | `/phone/config` | Greeting, business hours, escalation rules |

### 2.14 Analytics

| Method | Path | Description |
|---|---|---|
| GET | `/analytics/overview` | Top-line KPIs |
| GET | `/analytics/reviews/trend` | Time-series |
| GET | `/analytics/devices/funnel` | scan → review attribution |
| GET | `/analytics/competitors` | Competitor star avg over time |
| GET | `/analytics/reports` | Scheduled reports list |
| POST | `/analytics/reports` | Schedule a PDF/CSV report |
| GET | `/analytics/export` | One-off CSV ?type&from&to |

### 2.15 Billing

| Method | Path | Description |
|---|---|---|
| GET | `/billing/subscription` | Current plan + period |
| POST | `/billing/checkout` | Start Stripe checkout (returns session URL) |
| POST | `/billing/portal` | Stripe customer portal session |
| POST | `/billing/cancel` | Cancel at period end |
| GET | `/billing/invoices` | Invoice list |
| GET | `/billing/usage` | Current period meters |

### 2.16 Admin (separate auth, IP-allowlisted)

Mounted at `https://admin.repuboost.io/api/v1/admin`:

| Method | Path | Description |
|---|---|---|
| GET | `/tenants` | Search by name, email, plan, churn-risk |
| GET | `/tenants/:id` | Full tenant snapshot |
| POST | `/tenants/:id/impersonate` | Start read-only session (audit-logged) |
| DELETE | `/tenants/:id/impersonate` | End session |
| POST | `/tenants/:id/suspend` | Suspend access |
| POST | `/tenants/:id/refund` | Issue Stripe refund |
| PATCH | `/tenants/:id/feature-flags` | Set per-tenant flag |
| GET | `/hardware/queue` | Fulfillment queue (pending orders) |
| PATCH | `/hardware/orders/:id/ship` | Mark shipped, attach tracking |
| GET | `/system/alerts` | Active integration outages |
| GET | `/system/ai-cost` | Per-tenant AI spend |
| GET | `/audit` | Cross-tenant audit log |
| GET | `/revenue/dashboard` | MRR, churn, LTV |

---

## 3. Webhooks (inbound to us)

All inbound webhooks have signature verification + replay protection.

| Source | Path | Verification |
|---|---|---|
| Google Business Profile | `/webhooks/google/notifications` | OAuth + topic verification |
| Meta (FB + IG) | `/webhooks/meta` | App-secret HMAC + verify_token |
| Stripe | `/webhooks/stripe` | Stripe-Signature header |
| Twilio (SMS status) | `/webhooks/twilio/sms-status` | Twilio signature |
| Twilio (Voice events) | `/webhooks/twilio/voice` | Twilio signature |
| SendGrid (email events) | `/webhooks/sendgrid` | Public key signature |
| Shopify | `/webhooks/shopify/orders` | App-secret HMAC |
| WooCommerce | `/webhooks/woocommerce/orders` | Secret key HMAC |
| LinkedIn | `/webhooks/linkedin` | Bearer token verification |

---

## 4. Webhooks (outbound to tenant systems)

Tenants can subscribe to events; we sign with HMAC-SHA256:

| Event | Payload |
|---|---|
| `review.created` | `{review, establishment}` |
| `review.reply.published` | `{review, reply}` |
| `survey.response.submitted` | `{response, campaign}` |
| `inbox.thread.created` | `{thread}` |
| `device.scan` | `{device, scan_meta}` |
| `subscription.changed` | `{subscription}` |

Headers: `X-RB-Signature: t=...,v1=...` (Stripe-style).

---

## 5. Public / Anonymous Endpoints

These endpoints are unauthenticated (or weakly authenticated) and must carry their own anti-abuse layers.

| Method | Path | Purpose | Anti-abuse |
|---|---|---|---|
| GET | `r.repuboost.io/:slug` | Edge redirect (no auth) | Per-IP rate limit 50 req/min at Cloudflare; signed redirect target verified at edge; 10-char base32 slug = 50 bits entropy |
| POST | `r.repuboost.io/beacon` | Scan beacon | HMAC-bound `(slug, ts, sig)` so attackers can't forge scan events; idempotent on `(slug, scan_id)` |
| POST | `/api/v1/ai/chatbot/converse` | Embedded widget | Per-visitor short-lived JWT (signed by per-tenant HMAC secret from `widget_keys`); origin in tenant's `widget_keys.origin_allowlist`; Cloudflare Turnstile on first message; per-visitor sliding window (20 msgs / 5 min); per-tenant daily $ cap (Redis) |
| POST | `/api/v1/surveys/public/:token/respond` | Survey submit | Token = single-use, expires (`survey_response_tokens` table); SHA-256 hashed in DB; 1 submission per token; ≥128-bit entropy; size cap 4KB; Turnstile after 5 submissions/min from one IP |

**Widget key flow**:
1. Tenant generates a widget key in dashboard → public_key + HMAC secret stored in `widget_keys` (secret encrypted)
2. Tenant embeds `<script src="https://chat.repuboost.io/widget.js?key=PUBLIC_KEY">`
3. Widget JS calls `chat.repuboost.io/api/bootstrap?key=PK` → server validates Origin against allowlist → returns short-lived (60min) visitor JWT signed with that tenant's HMAC secret
4. All `/converse` calls carry the JWT in `Authorization: Bearer ...`
5. Server verifies JWT, applies rate limits, charges tenant's AI budget

---

## 6. Integration Catalog (OAuth scopes)

| Provider | Scopes | Purpose |
|---|---|---|
| Google Business Profile | `business.manage`, `userinfo.email` | Read reviews, post replies, list locations |
| Google OAuth (login) | `openid email profile` | SSO |
| Meta (FB + IG) | `pages_manage_posts`, `pages_messaging`, `instagram_basic`, `instagram_manage_comments`, `pages_read_engagement` | Post + read messages |
| LinkedIn | `w_member_social`, `r_organization_social`, `w_organization_social` | Post to pages |
| X (Twitter) | `tweet.read`, `tweet.write`, `users.read` | Post tweets |
| Shopify | `read_orders`, `read_customers` | Trigger review requests post-delivery |
| WooCommerce | REST API key | Same |
| Square | `ORDERS_READ` | Same |
| QuickBooks | `com.intuit.quickbooks.accounting.read` | Sync customer list |
| HubSpot | `crm.objects.contacts.read` | Sync contacts |
| Stripe | n/a (server keys) | Billing |
| Twilio | n/a (server keys + subaccount per tenant for SMS sender ID) | SMS + Voice |

---

## 7. SDKs (Phase 2)

- `@repuboost/node` — TypeScript client
- `@repuboost/widget` — Embeddable chatbot script (`<script src="https://chat.repuboost.io/widget.js" data-key="..."/>`)
- Postman collection auto-generated from OpenAPI

OpenAPI 3.1 spec auto-generated from route handlers (using `@hono/zod-openapi` or Next.js + Zod).
