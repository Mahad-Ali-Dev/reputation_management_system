# RepuLabs — VPS Deploy & Remediation Runbook

Covers shipping this session's fixes (subscription sync, email, QR batch, AI training,
soft-UI) to the VPS + the config/ops steps only you can do, + creating the Pro test user.

> ⚠️ All fixes are currently UNCOMMITTED in the local working tree. Nothing reaches
> the VPS until you commit + push (Step 0). The VPS pulls from git.

---

## Step 0 — On your dev machine: commit & push
```bash
# from D:\reputation_management_system
git checkout -b fix/subscription-email-qr-ai-softui   # or your normal branch flow
git add -A
git commit -m "Fix subscription sync, email sandbox, 500-QR batch, AI-training; soft-UI refresh"
git push origin HEAD
```
Then merge to the branch your VPS deploys from (e.g. `main`) per your normal process.

---

## Step 1 — On the VPS: pull, install, migrate, build, restart
SSH in and `cd` to the app directory, then:

```bash
git pull                       # get the new code

pnpm install                   # deps unchanged, but safe

# >>> THE IMPORTANT ONE — fixes /ai/training (creates ai_* tables + pgvector + knowledge_gaps)
pnpm prisma migrate status     # see what's pending
pnpm prisma migrate deploy     # apply pending migrations (NOT migrate dev)

pnpm build                     # production build (next build)

# restart your process — use whatever you run in prod, e.g.:
pm2 restart repulabs           # if pm2
# or: sudo systemctl restart repulabs
```

If `migrate deploy` errors on the `vector` extension, enable it once as the DB owner
on Neon, then re-run:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

---

## Step 2 — Set / verify env vars on the VPS (the config fixes)

These are the ops items code can't do. Set them in your prod env (`.env` on the VPS or
your secrets manager), then restart.

### Email (fixes "no mail / resend not working")
1. In the **Resend dashboard → Domains**, add `repulabs.com` and add the SPF/DKIM/DMARC
   DNS records it shows. Wait until it says **Verified**.
2. ```
   EMAIL_FROM="Repulabs <notifications@repulabs.com>"   # a VERIFIED address — NOT *.resend.dev
   RESEND_API_KEY="re_..."                               # a Sending key from Resend
   CRON_SECRET="<openssl rand -base64 32>"               # required or scheduled sends stop
   ```
3. **Install the cron schedule** (all 21 jobs — review sync, request dispatch,
   auto-reply, digests, …). `vercel.json` does NOT run on the VPS, so nothing is
   scheduled until you do this ONCE, as the `deploy` user:
   ```bash
   chmod +x /opt/repulabs/deploy/cron-hit.sh
   crontab /opt/repulabs/deploy/repulabs.cron
   crontab -l | grep -c api/cron          # -> 21
   # smoke-test one job by hand:
   /opt/repulabs/deploy/cron-hit.sh sync-reviews && echo OK
   ```
   The crontab is generated from `vercel.json` (`scripts/gen-cron.py`); the
   secret stays in `.env.production` and is read by `cron-hit.sh` at run time —
   nothing sensitive is committed. Without this, review sync, review-request
   dispatch and auto-reply all silently never run.
4. Magic-link **login** uses the same email path — once the domain is verified, sign-in
   emails will actually arrive (this is why "auth wasn't working").

### Subscription (fixes dashboard not updating after subscribe)
In the **Stripe dashboard → Developers → Webhooks**, confirm an endpoint exists:
```
https://repulabs.com/api/webhooks/stripe
events: customer.subscription.created/updated/deleted,
        invoice.payment_succeeded, invoice.payment_failed,
        checkout.session.completed
```
And in prod env:
```
STRIPE_SECRET_KEY="sk_live_..."        # now also used by the dashboard sync-on-return
STRIPE_WEBHOOK_SECRET="whsec_..."      # MUST match that exact endpoint's signing secret
STRIPE_PRO_PRICE_ID="price_..."        # your live Pro price
NEXT_PUBLIC_APP_URL="https://repulabs.com"
```

---

## Step 3 — Create the PRO test user (testuser1@gmail.com)
Auth is passwordless (magic-link/Google) + database sessions, so you log in by planting
a session cookie — no email needed. Run the seed on the box whose DB you want it in:

```bash
node scripts/seed-test-user.mjs
```
It prints a **session token** + the cookie name to use. Then in your browser:
- DevTools → Application → Cookies → `https://repulabs.com`
- Add a cookie:
  - **name:** `__Secure-authjs.session-token`  (prod/HTTPS)  — or `authjs.session-token` (localhost)
  - **value:** the printed token
  - **Path:** `/`
- Visit `/dashboard` → you're in as a **Pro** owner (onboarding pre-dismissed).

The account: `testuser1@gmail.com`, org "Test Pro Workspace", `plan=pro`. (The password
`12345678` is stored as an argon2 hash but isn't used by the current login — there's no
password provider wired up.)

---

## Step 4 — Smoke test
- [ ] Log in as testuser1 (cookie) → dashboard shows Pro, no upgrade gates.
- [ ] `/ai/training` loads (not blank) and "Scan & Build My AI" works on a content-rich URL.
- [ ] Subscribe a fresh org via Stripe test → land on dashboard → plan shows Pro immediately.
- [ ] Send a review-request email to a REAL external inbox → it arrives (not sandbox).
- [ ] Generate a 500-unit QR batch → ZIP downloads without timeout.

---

## Notes
- Node is pinned to 20 on this project; `pnpm dev` is broken (use `next` directly / prod build).
- The soft-UI redesign was verified to compile + pass tests, but NOT visually reviewed —
  eyeball the dashboard/empty states after deploy (or run the screenshot tooling).
- Real magic-link login for everyone else only works after the Resend domain is verified.
