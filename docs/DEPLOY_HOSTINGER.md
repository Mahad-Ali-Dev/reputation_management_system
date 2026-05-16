# Deploying Repulabs to a Hostinger VPS

A start-to-finish runbook for getting Repulabs from a fresh Ubuntu 22.04
Hostinger VPS to a working production deployment on `repulabs.com`.

**Estimated time:** 60–90 minutes for the first deploy.

---

## 0. Prerequisites

- A Hostinger VPS (KVM 2 or higher recommended: 2 vCPU / 8 GB RAM / 100 GB SSD)
- Domain `repulabs.com` with DNS pointed at the VPS IP
- A Neon Postgres database with `DATABASE_URL` ready
- A Resend account with API key (or alternative SMTP provider)
- Stripe live keys + webhook secret
- An Anthropic API key
- (Optional but recommended) A Cloudflare account with the domain proxied
  through it — gives you free DDoS, WAF, CDN, and edge cache

---

## 1. Server hardening (one-time)

SSH in as root:

```bash
ssh root@<vps-ip>
```

### 1.1 Create a deploy user

```bash
adduser deploy
usermod -aG sudo deploy

# Set up SSH for the deploy user
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
```

### 1.2 Disable password SSH + root login

Edit `/etc/ssh/sshd_config`:

```
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
```

Restart sshd: `systemctl restart sshd`. From a **new terminal** (don't close the
existing root session yet), test: `ssh deploy@<vps-ip>`. If that works, you can
close the root session.

### 1.3 Firewall

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

### 1.4 Fail2ban (SSH brute-force protection)

```bash
sudo apt update && sudo apt install -y fail2ban
sudo systemctl enable --now fail2ban
```

### 1.5 Automatic security updates

```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

---

## 2. Install the runtime stack

```bash
# Node.js 20 LTS via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# pnpm via corepack
sudo corepack enable
sudo corepack prepare pnpm@latest --activate

# Nginx + certbot
sudo apt install -y nginx certbot python3-certbot-nginx

# Git
sudo apt install -y git
```

Verify versions:

```bash
node -v     # should be v20.x
pnpm -v     # should be 9.x or 10.x
nginx -v
```

---

## 3. Create the app user and directory

```bash
# Service user — runs the Node process, owns no home dir.
sudo adduser --system --group --no-create-home --shell /bin/false repulabs

# App directory
sudo mkdir -p /var/www/repulabs
sudo chown -R deploy:repulabs /var/www/repulabs
sudo chmod 750 /var/www/repulabs
```

---

## 4. Clone the repo and configure env

```bash
cd /var/www/repulabs
sudo -u deploy git clone https://github.com/<your-org>/repulabs.git .

# Copy and edit env
sudo -u deploy cp .env.example .env.production
sudo -u deploy nano .env.production
```

Critical values to set for production:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `NEXT_PUBLIC_APP_URL` | `https://repulabs.com` |
| `AUTH_URL` | `https://repulabs.com` |
| `AUTH_TRUST_HOST` | `true` |
| `DATABASE_URL` | Your Neon **pooled** URL (with `-pooler`) |
| `DIRECT_URL` | Your Neon **direct** URL (no pooler) — for migrations |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `STRIPE_SECRET_KEY` | Your **live** secret key (`sk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | From dashboard webhook config |
| `ANTHROPIC_API_KEY` | Your live key |
| `RESEND_API_KEY` | Your live key |
| `EMAIL_FROM` | `Repulabs <auth@repulabs.com>` (must be a verified Resend sender) |
| `ENCRYPTION_MASTER_KEY` | `openssl rand -base64 32` |
| `SLUG_HMAC_SECRET` | `openssl rand -base64 32` |
| `OAUTH_STATE_SECRET` | `openssl rand -base64 32` |
| `HMAC_SECRET` | `openssl rand -base64 32` |
| `CRON_SECRET` | `openssl rand -base64 32` |
| `SENTRY_DSN` | Your Sentry project DSN |

Lock down the env file:

```bash
sudo chown repulabs:repulabs /var/www/repulabs/.env.production
sudo chmod 600 /var/www/repulabs/.env.production
```

---

## 5. Install dependencies and run first migration

```bash
cd /var/www/repulabs
sudo -u deploy pnpm install --frozen-lockfile

# Generate Prisma client + apply migrations against your Neon DB.
sudo -u deploy pnpm db:generate
sudo -u deploy pnpm db:migrate:deploy
```

Build the production bundle:

```bash
sudo -u deploy NODE_ENV=production pnpm exec next build
```

---

## 6. Install the systemd service

```bash
sudo cp /var/www/repulabs/deploy/repulabs.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable repulabs
sudo systemctl start repulabs

# Verify
sudo systemctl status repulabs
sudo journalctl -u repulabs -f    # watch logs
```

Hit the health endpoint locally to confirm:

```bash
curl http://127.0.0.1:3000/api/health
# {"status":"ok","checks":{"db":"ok",...}}
```

---

## 7. Install Nginx config

```bash
sudo cp /var/www/repulabs/deploy/nginx.conf /etc/nginx/sites-available/repulabs
sudo ln -s /etc/nginx/sites-available/repulabs /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t              # syntax check
sudo systemctl reload nginx
```

---

## 8. Get TLS certificates from Let's Encrypt

```bash
sudo certbot --nginx \
  -d repulabs.com \
  -d www.repulabs.com \
  -d app.repulabs.com \
  -d admin.repulabs.com \
  -d r.repulabs.com \
  --email you@repulabs.com \
  --agree-tos --no-eff-email
```

Certbot will write the cert paths into `/etc/nginx/sites-available/repulabs`
and set up an auto-renewal timer. Confirm:

```bash
sudo systemctl list-timers | grep certbot
```

---

## 9. Install logrotate

```bash
sudo cp /var/www/repulabs/deploy/repulabs.logrotate /etc/logrotate.d/repulabs
sudo logrotate -d /etc/logrotate.d/repulabs    # dry run
```

---

## 10. Configure external services

### 10.1 Stripe webhook

In Stripe dashboard → Developers → Webhooks → Add endpoint:

- URL: `https://repulabs.com/api/webhooks/stripe`
- Events to send: `checkout.session.completed`, `customer.subscription.updated`,
  `customer.subscription.deleted`, `invoice.payment_failed`
- Copy the signing secret → set as `STRIPE_WEBHOOK_SECRET` in `.env.production`

### 10.2 Google OAuth

In Google Cloud Console → Credentials → OAuth 2.0 client:
- Add authorized redirect URIs:
  - `https://repulabs.com/api/auth/callback/google`
  - `https://repulabs.com/api/connections/google/callback`

### 10.3 Resend domain

In Resend dashboard → Domains → Add `repulabs.com`, complete DKIM/SPF records
in your DNS provider.

### 10.4 Uptime monitor

Sign up at UptimeRobot (free) → HTTP(s) monitor:
- URL: `https://repulabs.com/api/health`
- Interval: 5 minutes
- Alert contacts: your email + a phone-friendly channel (PagerDuty free)

---

## 11. First deploy

From your laptop after pushing to `main`, SSH in and run:

```bash
ssh deploy@<vps-ip>
cd /var/www/repulabs
pnpm deploy
```

The `scripts/deploy.sh` script:
1. Verifies `.env.production` exists and is mode 600
2. `git fetch + checkout main`
3. `pnpm install --frozen-lockfile`
4. `prisma migrate deploy`
5. `next build`
6. `systemctl restart repulabs`
7. Waits up to 60s for `/api/health` → 200, rolls back on failure

---

## 12. Ongoing operations

### Watching logs

```bash
# App logs
sudo journalctl -u repulabs -f

# Nginx
sudo tail -f /var/log/nginx/repulabs.access.log
sudo tail -f /var/log/nginx/repulabs.error.log

# Last hour of errors only
sudo journalctl -u repulabs --since "1 hour ago" -p err
```

### Rolling back

```bash
cd /var/www/repulabs
cat .deploy-previous-sha
pnpm deploy --ref=<that-sha>
```

### Database backups

Neon handles point-in-time recovery automatically (7-day retention on free
tier, 30-day on Launch). For belt-and-braces, schedule a daily `pg_dump`:

```bash
# /etc/cron.daily/pg-backup
#!/bin/sh
TS=$(date +%Y-%m-%d)
pg_dump $DATABASE_URL | gzip > /var/backups/repulabs-$TS.sql.gz
find /var/backups -name 'repulabs-*.sql.gz' -mtime +14 -delete
```

### Memory pressure

The systemd unit caps memory at 1.5 GB. If you hit it routinely, the service
will be killed and restart. Check:

```bash
systemd-cgls -u repulabs
sudo systemctl status repulabs   # look for MemoryCurrent
```

If you're running hot, either scale up the VPS or move to Fargate.

---

## 13. Cloudflare (recommended)

Once everything works directly, put Cloudflare in front:

1. Add `repulabs.com` to Cloudflare → set nameservers at your registrar
2. Set DNS records: `A repulabs.com → <vps-ip>` (Proxied / orange cloud)
3. SSL/TLS mode: **Full (strict)**
4. Enable: Bot Fight Mode, Always Use HTTPS, HSTS, Brotli, Minify (off — Next
   handles this), Rocket Loader (off — breaks Next), Auto Minify (off)
5. WAF → Managed Rules → enable the OWASP ruleset
6. Page Rules: `r.repulabs.com/*` → cache level: bypass (don't cache redirects)

Then uncomment the `set_real_ip_from` lines in `nginx.conf` and reload Nginx
so request logs show real client IPs.

---

## 14. Sanity checklist

After your first deploy, hit each of these and confirm:

- [ ] `https://repulabs.com` → 200, dashboard loads
- [ ] `https://repulabs.com/api/health` → `{"status":"ok"}`
- [ ] Sign in with magic link → email arrives → click → logged in
- [ ] Generate a QR → scan it → redirects to a Google review URL with HTTPS
- [ ] Generate a Stripe checkout session → completes → webhook fires → org plan updates
- [ ] Trigger a Sentry test event (`Sentry.captureMessage("test")` from a route) → arrives in Sentry
- [ ] `sudo ufw status` → only 22, 80, 443 listed
- [ ] `sudo systemctl status repulabs` → active (running)
- [ ] Memory usage stable after 1 hour: `sudo systemctl status repulabs | grep Memory`

---

## When you outgrow this setup

Move to AWS Fargate (or similar) when **any** of these become true:

- Webhook drops during deploys (single-instance limitation)
- p95 page latency > 1.5s sustained
- VPS at >70% CPU/RAM for >10 min/hour
- More than one engineer pushing deploys

The `docs/AWS_DEPLOY.md` runbook covers the next step.
