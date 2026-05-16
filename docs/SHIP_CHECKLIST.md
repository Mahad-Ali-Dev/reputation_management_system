# Repulabs — Ship Checklist

Run this list before every production deploy. If any item is unchecked,
**don't ship.** Document why if you ship anyway.

> Target time: 15 minutes. Most steps are automated.

---

## 1. Code — run locally (3 min)

```bash
pnpm preflight    # typecheck + lint + tests + production build
```

- [ ] **TypeScript clean** — `pnpm typecheck` exits 0
- [ ] **Lint clean** — `pnpm lint` exits 0 (style suggestions are OK; rule errors are not)
- [ ] **Tests pass** — `pnpm test` exits 0
- [ ] **Production build succeeds** — `NODE_ENV=production pnpm exec next build`
  exits 0. Cosmetic warnings (`PageNotFoundError /_document`, OpenTelemetry
  critical-dependency) are known-OK.

---

## 2. Secrets + config (2 min)

- [ ] **`.env.production` exists on the VPS** and is mode 600 owned by
  `repulabs:repulabs`. Verify: `stat -c '%a %U:%G' /var/www/repulabs/.env.production`
  → `600 repulabs:repulabs`.
- [ ] **No env files in git** — `git ls-files | grep -E "^\.env"` returns
  nothing (only `.env.example` is allowed).
- [ ] **All required prod secrets set** in `.env.production`:
  - `NODE_ENV=production`
  - `NEXT_PUBLIC_APP_URL=https://repulabs.com`
  - `AUTH_URL=https://repulabs.com`
  - `AUTH_TRUST_HOST=true`
  - `AUTH_SECRET` (32-byte base64)
  - `DATABASE_URL` (Neon pooled)
  - `DIRECT_URL` (Neon direct, for migrations)
  - `STRIPE_SECRET_KEY` (live `sk_live_...`)
  - `STRIPE_WEBHOOK_SECRET` (matches the live webhook endpoint)
  - `RESEND_API_KEY` (Resend domain verified)
  - `ANTHROPIC_API_KEY`
  - `ENCRYPTION_MASTER_KEY` (32-byte base64)
  - `SLUG_HMAC_SECRET` (32-byte base64)
  - `OAUTH_STATE_SECRET` (32-byte base64)
  - `CRON_SECRET` (32-byte base64)
- [ ] **Test the env validator** — on the VPS run `node -e 'require("./lib/env")'`
  (after `pnpm install`) and confirm it doesn't crash.

---

## 3. Database (2 min)

- [ ] **Migration status is clean** — `npx prisma migrate status` on the
  VPS shows: "Database schema is up to date" (or only pending migrations
  that will apply during `deploy.sh`).
- [ ] **The pending migration is reviewed** — read every `migration.sql`
  in `prisma/migrations/<latest>/` before deploying.
- [ ] **RLS policies are present** — `psql $DATABASE_URL -c "SELECT
  schemaname, tablename, policyname FROM pg_policies WHERE schemaname='public';"`
  returns rows for every multi-tenant table.
- [ ] **Backups configured** — Neon backups are on (Launch plan or
  higher). For belt-and-braces, the daily `pg_dump` cron is installed on
  the VPS.

---

## 4. External services (3 min)

- [ ] **Stripe webhook endpoint** — Dashboard → Developers → Webhooks
  shows `https://repulabs.com/api/webhooks/stripe` as **Live** mode,
  status enabled, signing secret matches `STRIPE_WEBHOOK_SECRET` in
  `.env.production`. Selected events:
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`
  - `charge.refunded`
- [ ] **Stripe live products + prices created** — `STRIPE_PRO_PRICE_ID`
  in `.env.production` is a **live** price ID (`price_live_...`), not test.
- [ ] **Resend domain verified** — Resend dashboard shows `repulabs.com`
  DKIM and SPF as green.
- [ ] **Google OAuth client** — Google Cloud Console has these redirect
  URIs registered:
  - `https://repulabs.com/api/auth/callback/google`
  - `https://repulabs.com/api/connections/google/callback`
- [ ] **Sentry project exists** — `SENTRY_DSN` is set and the test event
  arrives in Sentry within 1 minute of deploy (`curl -X POST .../api/dev/sentry-test`
  if you wire that; or trigger a known error path).

---

## 5. Infra (2 min)

- [ ] **DNS is pointed** — `dig +short repulabs.com` returns the VPS IP
  (or Cloudflare IP if proxied).
- [ ] **TLS certs are valid** — `curl -sI https://repulabs.com | head -1`
  → `HTTP/2 200`. `openssl s_client -servername repulabs.com -connect
  repulabs.com:443 < /dev/null 2>&1 | openssl x509 -noout -dates` shows
  `notAfter` ≥ 30 days out.
- [ ] **Certbot auto-renewal active** — `sudo systemctl list-timers |
  grep certbot` shows the timer.
- [ ] **systemd unit installed + healthy** — `sudo systemctl is-enabled
  repulabs` → `enabled`; `sudo systemctl is-active repulabs` → `active`.
- [ ] **Firewall locked down** — `sudo ufw status` shows only 22, 80,
  443 allowed.
- [ ] **fail2ban running** — `sudo systemctl is-active fail2ban` → `active`.

---

## 6. Deploy + verify (3 min)

```bash
# On the VPS:
ssh deploy@<vps-ip>
cd /var/www/repulabs
pnpm deploy           # runs scripts/deploy.sh
```

After deploy completes, the deploy script auto-checks `/api/health`. Then
manually verify:

- [ ] **Health endpoint returns 200** — `curl -fsS https://repulabs.com/api/health`
  → `{"status":"ok","checks":{"db":"ok",...}}`
- [ ] **Login works** — sign in with a magic link, confirm email arrives,
  click the link, confirm you land on `/dashboard`.
- [ ] **A real review request can be sent** — `/outreach/new` → send SMS
  → verify Twilio dashboard shows the message, recipient receives it.
- [ ] **A QR code redirects correctly** — generate a QR for any
  establishment, scan it from a phone, confirm 302 to the Google review
  URL (NOT localhost).
- [ ] **Stripe checkout works** — start a Pro upgrade, complete with a
  test card, confirm the webhook fires, confirm `subscription.status`
  flips to `active` in the local DB.
- [ ] **Admin login works** — `https://admin.repulabs.com/admin/login`,
  confirm dashboard loads, impersonate a tenant with a valid reason,
  confirm the warning banner appears.
- [ ] **No 500s in Sentry** in the 5 minutes after deploy.
- [ ] **Logs flowing** — `sudo journalctl -u repulabs -f` shows recent
  request logs with structured JSON (Pino format).

---

## 7. Rollback plan (always know this)

If anything broke:

```bash
ssh deploy@<vps-ip>
cd /var/www/repulabs
cat .deploy-previous-sha       # the SHA of the last good deploy
pnpm deploy --ref=<that-sha>   # rolls back, including migrations? NO.
```

> **Migrations are NOT auto-rolled-back.** If a migration caused the
> problem, restore the DB from the most recent Neon snapshot via Neon
> Console → Branches → Restore. Then redeploy old code.

---

## 8. If you skip steps

Document why you skipped each. Examples:

- "Skipped §4 Stripe — no billing changes in this deploy."
- "Skipped §3 migrations — no schema changes."
- "Skipped §6 admin login — admin domain hasn't been provisioned yet."

Anything in §1 (preflight) and §2 (secrets) is **not skippable**.

---

## Appendix: One-shot smoke test

After a successful deploy, this curl sequence exercises the critical
paths without writing data:

```bash
APP=https://repulabs.com

# Health
curl -fsS $APP/api/health | jq .status

# Static asset (proves Next is serving)
curl -sI $APP | head -1

# QR redirect with a real slug (replace ABCDEFGHIJ)
curl -sI $APP/r/ABCDEFGHIJ | grep -i location

# Login page renders
curl -sI $APP/login | head -1
```

All four should return 200 / 302 with sane headers. If any returns 5xx,
**roll back.**
