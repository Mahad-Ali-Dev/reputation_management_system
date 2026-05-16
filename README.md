# Repulabs

> Multi-tenant reputation management SaaS — AI-powered review automation, social media management, customer surveys, unified inbox, AI phone receptionist, and a physical QR review-stand hardware line.

**Status**: Built. Production-ready for single-VPS (Hostinger) deployment. See [Deploy →](#deploy)

---

## Quick Start (after Phase 0 lands)

```bash
pnpm install
cp .env.example .env.local
pnpm db:up           # docker postgres + redis
pnpm db:migrate
pnpm db:seed
pnpm dev             # all apps via Turbo
```

---

## Documentation

| Doc | Purpose |
|---|---|
| [docs/PRD.md](docs/PRD.md) | Product requirements: vision, personas, features, success metrics |
| [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md) | System design, modules, ADRs, critical flows, validation/sanitization standards |
| [docs/architecture/DATA_MODEL.md](docs/architecture/DATA_MODEL.md) | ERD, RLS multi-tenant strategy, all tables (incl. envelope encryption, AI lifecycle, consent, webhooks) |
| [docs/architecture/TECH_STACK.md](docs/architecture/TECH_STACK.md) | Stack choices with rationale |
| [docs/architecture/INFRASTRUCTURE.md](docs/architecture/INFRASTRUCTURE.md) | Deploy, security (IAM/KMS catalog, network topology, S3 baseline, admin zero-trust, webhook contract), scaling, observability |
| [docs/architecture/AI_STRATEGY.md](docs/architecture/AI_STRATEGY.md) | AI surfaces, model routing, prompt caching, RAG, safety, evals, phone latency, cost engineering |
| [docs/api/API_SURFACE.md](docs/api/API_SURFACE.md) | API endpoints, webhooks, integrations, OAuth state pattern |
| [docs/API.md](docs/API.md) | **Active API reference** — every route, auth scheme, rate limit, error code, with curl recipes |
| [docs/DEPLOY_HOSTINGER.md](docs/DEPLOY_HOSTINGER.md) | **Production deploy runbook** — Hostinger VPS, end-to-end (TLS, systemd, Nginx, certbot, monitoring) |
| [docs/SHIP_CHECKLIST.md](docs/SHIP_CHECKLIST.md) | **Pre-deploy checklist** — run this before every prod push |
| [docs/BILLING_AND_HARDWARE.md](docs/BILLING_AND_HARDWARE.md) | Pricing, subscription lifecycle, hardware fulfillment, **activation flow** |
| [docs/NINE_DAY_PLAN.md](docs/NINE_DAY_PLAN.md) | **9-day solo founder build plan** — day-by-day, scope cuts, 30-40 features shipping, deferral list |
| [docs/SECURITY_AND_OPS_REVIEW.md](docs/SECURITY_AND_OPS_REVIEW.md) | Consolidated findings from 7 specialist reviews + traceability |
| [docs/SLOs.md](docs/SLOs.md) | Service Level Objectives + error budget policy |
| [docs/runbooks/INDEX.md](docs/runbooks/INDEX.md) | Index of 19 operational runbooks |
| [docs/ROADMAP.md](docs/ROADMAP.md) | 9-month delivery plan with phases & risks |

---

## Deploy

For a single-VPS (Hostinger / generic Ubuntu) deployment:

```bash
# On the VPS, first time:
git clone https://github.com/<your-org>/repulabs.git /var/www/repulabs
cd /var/www/repulabs
cp .env.example .env.production && chmod 600 .env.production
# edit .env.production with prod secrets (see DEPLOY_HOSTINGER.md §4)
sudo cp deploy/repulabs.service /etc/systemd/system/
sudo cp deploy/nginx.conf /etc/nginx/sites-available/repulabs
sudo cp deploy/repulabs.logrotate /etc/logrotate.d/repulabs
# follow docs/DEPLOY_HOSTINGER.md from §6 onwards

# On every subsequent push:
ssh deploy@<vps>
cd /var/www/repulabs
pnpm deploy           # see scripts/deploy.sh — pulls, migrates, builds, restarts, health-checks
```

**Before every deploy:** run `pnpm preflight` locally and walk through [docs/SHIP_CHECKLIST.md](docs/SHIP_CHECKLIST.md).

---

## High-Level Architecture

```
Tenants (web) ──► Cloudflare CDN/WAF ──► Next.js (Vercel)
                                          │
QR Scans ──► r.repuboost.io (CF Worker) ──┘
                                          │
                                          ▼
                              Modular monolith services
                              (auth, reviews, social, inbox,
                               surveys, billing, hardware, AI)
                                          │
                              ┌───────────┼───────────────┐
                              ▼           ▼               ▼
                          Postgres     Redis +        Workers
                          (RLS)        BullMQ        (Fly.io)
                              │           │               │
                              ▼           ▼               ▼
                          ClickHouse   Stripe         Anthropic /
                          (analytics)                 Twilio / SendGrid /
                                                     Meta / Google
```

---

## Tech Stack (TL;DR)

- **Web**: Next.js 15, React 19, TypeScript, Tailwind, shadcn/ui
- **Backend**: Next.js route handlers + BullMQ workers
- **Data**: PostgreSQL 16 (RLS multi-tenancy), Redis, pgvector, ClickHouse
- **Auth**: Auth.js (magic link + Google + Microsoft)
- **AI**: Claude Sonnet 4.6 + Haiku 4.5 + Opus 4.7 (with prompt caching)
- **Payments**: Stripe Subscriptions + Customer Portal
- **Infra**: Vercel + Fly.io + Cloudflare + AWS RDS Aurora

See [docs/architecture/TECH_STACK.md](docs/architecture/TECH_STACK.md) for full rationale.

---

## Open Questions for the Founder

1. Hardware fulfillment — 3PL, in-house, or hybrid?
2. AI Phone Receptionist — MVP or Phase 5?
3. Single Pro tier or also a Starter mid-tier?
4. Free tier — permanent or hard-convert at day 7?

(Brand/domain and geography confirmed — founder owns those decisions.)

## Phase 0 (Weeks 1-2) — security baseline first

The first 10 days now include security foundations:

1. RLS canonical policy + cross-tenant attack test suite
2. Envelope encryption module for OAuth tokens
3. Database role split (`app_tenant_user` / `app_admin_reader` / `app_admin_writer`)
4. Webhook idempotency middleware + `webhook_deliveries` table
5. OAuth state JWT + `oauth_state_consumed` table
6. Aurora ACU 0.5–16 + private subnet + SG ingress matrix
7. IAM role catalog + Checkov gate
8. Slug entropy (10-char base32) + signed redirect + edge rate limit
9. WebAuthn enforcement on admin
10. Pino redaction config

See [docs/SECURITY_AND_OPS_REVIEW.md](docs/SECURITY_AND_OPS_REVIEW.md) §7 for the full ordered checklist.
