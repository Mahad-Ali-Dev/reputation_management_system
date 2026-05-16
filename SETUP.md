# RepuBoost — Local Setup

## 1. Prerequisites

- **Node.js 20+** (`.nvmrc` pins to 20)
- **pnpm 9+** (`corepack enable && corepack prepare pnpm@9.15.0 --activate`)
- A Postgres database (Neon recommended for free dev tier — https://neon.tech)
- Optional for full Day-1: Resend, Stripe, Google Cloud accounts

## 2. Provision external accounts (Day 0 / pre-flight)

| Service | What to grab | Where |
|---|---|---|
| Neon | `DATABASE_URL` (pooled) + `DIRECT_URL` | https://console.neon.tech |
| Resend | `RESEND_API_KEY`; verify sending domain | https://resend.com/api-keys |
| Google Cloud | OAuth Client ID + Secret (web), redirect URI = `http://localhost:3000/api/auth/callback/google` | https://console.cloud.google.com/apis/credentials |
| Stripe | Test secret key, publishable key, webhook secret (via `stripe listen`) | https://dashboard.stripe.com/test/apikeys |
| Stripe price | Create a "Pro" recurring product at $167/mo with 7-day trial | Dashboard → Products |
| Anthropic | `ANTHROPIC_API_KEY` (Phase 1+) | https://console.anthropic.com |
| Upstash | Redis URL + token (Phase 1+) | https://console.upstash.com |
| Twilio | Account SID + Auth Token + a number (Phase 1+ for SMS) | https://console.twilio.com |

## 3. Generate secrets

```bash
# AUTH_SECRET, ENCRYPTION_MASTER_KEY, SLUG_HMAC_SECRET, OAUTH_STATE_SECRET — each 32 random bytes
openssl rand -base64 32
```

PowerShell equivalent:
```powershell
[Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

## 4. Configure `.env.local`

```bash
cp .env.example .env.local
# Edit .env.local with the values above
```

## 5. Install dependencies

```bash
pnpm install
```

## 6. Database setup

```bash
pnpm db:migrate          # applies migrations (Prisma + raw SQL for RLS)
pnpm db:generate         # generates the Prisma client
```

If you see `db:migrate` fail with permissions errors against Neon, switch the `DATABASE_URL` to your `DIRECT_URL` temporarily (Prisma migrations need a non-pooled connection).

## 7. Run dev server

```bash
pnpm dev
```

Open http://localhost:3000.

For subdomain testing, add to your `hosts` file:

```
127.0.0.1 localhost app.localhost admin.localhost r.localhost
```

Then visit `http://app.localhost:3000`.

## 8. Stripe webhook locally

```bash
stripe login
stripe listen --forward-to localhost:3000/api/webhooks/stripe
# Copy the printed whsec_… into STRIPE_WEBHOOK_SECRET
```

In another terminal:
```bash
stripe trigger customer.subscription.created
```

Watch your terminal — you should see `subscription.synced` log.

## 9. Run the RLS acceptance test

```bash
pnpm test:rls
```

This is the **Day 1 acceptance gate** — every cross-tenant attack vector must be blocked.

## 10. Common issues

| Symptom | Fix |
|---|---|
| `relation "..." does not exist` | Run `pnpm db:migrate` |
| `RLS denied — 0 rows` from a UI page | You forgot to wrap the query in `withTenant(orgId, ...)` |
| `STRIPE_SECRET_KEY not set` | Copy `.env.example` → `.env.local` and fill in |
| Magic link email not sent | Check `RESEND_API_KEY`; for dev, use Resend's test mode (`onboarding@resend.dev` as `EMAIL_FROM`) |
| Google OAuth redirect mismatch | Add `http://localhost:3000/api/auth/callback/google` in Google Cloud Console |

## 11. Daily flow

```bash
pnpm dev               # local dev (next + auth + stripe webhook in another terminal)
pnpm typecheck         # before committing
pnpm test              # all tests
pnpm test:rls          # only RLS attack suite
pnpm lint:fix          # auto-fix biome
pnpm db:studio         # GUI for the DB
```

## 12. What's already built (Day 1)

- Next.js 15 app with App Router + Tailwind + shadcn primitives (Button, Card)
- Prisma schema: orgs, users, memberships, invitations, admin_users, subscriptions, webhook_deliveries, oauth_state_consumed, audit_log (append-only)
- Canonical RLS policies (`USING + WITH CHECK + FORCE`) on every tenant-scoped table
- `withTenant(orgId, fn)` helper — every tenant query wraps in this
- Envelope encryption module (`lib/crypto/envelope.ts`) — AES-GCM with EncryptionContext binding
- OAuth state JWT helper (`lib/oauth/state.ts`) — CSRF + tenant-fixation defense + PKCE + single-use nonce
- Webhook idempotency middleware (`lib/webhooks/idempotency.ts`) — INSERT ON CONFLICT race-free claim
- Auth.js v5 with Resend magic link + Google SSO; auto-creates org + owner on first sign-in
- Stripe checkout + customer portal + webhook handler with signature verification + idempotency
- Pino logger with PII redaction config
- Subdomain routing middleware (`app.*` → tenant, `admin.*` → admin)
- `/api/health` endpoint
- Marketing landing page, login page, dashboard
- Cross-tenant RLS attack test (CI gate)

## 13. What's NOT yet built (Day 2+)

See `docs/NINE_DAY_PLAN.md` for the full schedule. Day 2 is establishments + Google OAuth + connections; Day 3 is the review loop; etc.
