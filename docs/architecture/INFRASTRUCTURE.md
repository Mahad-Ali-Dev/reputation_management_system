# Infrastructure, Security & Scaling — RepuBoost

---

## 1. Environment Topology

| Env | URL | Purpose | Data |
|---|---|---|---|
| **dev** | localhost / preview branches | Daily dev | Seed + synthetic |
| **staging** | `staging.repuboost.io` | QA, e2e, demos | Anonymized prod snapshot, refreshed weekly |
| **prod** | `repuboost.io`, `app.repuboost.io`, `admin.repuboost.io` | Customer-facing | Real |

Each env has independent Stripe accounts, Twilio subaccounts, Anthropic projects (cost separation), Postgres clusters.

---

## 2. Cloud Topology (Production)

```
┌──────────────────────────────────────────────────────────────────┐
│  Cloudflare (DNS + WAF + CDN + Workers)                          │
│  ├─ repuboost.io           → marketing (Vercel)                  │
│  ├─ app.repuboost.io       → tenant app (Vercel)                 │
│  ├─ admin.repuboost.io     → admin app (Vercel, IP-allowlisted) │
│  ├─ chat.repuboost.io      → widget bundle (Cloudflare Pages)    │
│  ├─ r.repuboost.io         → short-link (CF Worker + KV)         │
│  └─ api.repuboost.io       → external API (Hono on Vercel/Fly)   │
└──────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
┌───────▼─────────┐   ┌───────▼─────────┐   ┌───────▼─────────┐
│  Vercel         │   │  Fly.io         │   │  AWS us-east-1  │
│  Next.js        │   │  Workers        │   │  RDS Postgres   │
│  (web app)      │   │  (BullMQ)       │   │  ElastiCache    │
│  ┌────────────┐ │   │  ┌────────────┐ │   │  Redis          │
│  │ Region: iad │ │   │  │ Region: iad │ │   │  S3             │
│  └────────────┘ │   │  └────────────┘ │   │  KMS            │
└─────────────────┘   └─────────────────┘   └─────────────────┘
                              │
                      ┌───────▼─────────┐
                      │ ClickHouse Cloud │
                      │ + Sentry + Axiom │
                      │ + Anthropic API  │
                      └─────────────────┘
```

---

## 3. Compute Sizing (year 1)

| Component | Spec | Cost/mo (est) |
|---|---|---|
| Vercel Pro (web app) | Unlimited bandwidth, ISR, edge | $200 |
| Fly.io (workers) | Auto-scaled 2-8× shared-cpu-2x by queue depth | $90-300 |
| RDS Aurora Serverless v2 | 0.5–**16 ACUs** auto-scaling (was 0.5-4 — would brown-out at 1K tenants) | $400-800 |
| ElastiCache Redis | cache.t4g.small single-AZ at MVP → multi-AZ at 100 paying tenants | $45-90 |
| S3 + R2 | 500 GB | $30 |
| ClickHouse Cloud | Dev tier 8 GB | $200 |
| Cloudflare | Workers Paid + Pages | $30 |
| Sentry | Team tier | $80 |
| Axiom (logs) | Pro | $100 |
| Anthropic | $4 × 500 tenants | $2,000 |
| Twilio | $0.005 × 50K SMS | $250 |
| SendGrid | Essentials 100K/mo | $20 |
| Stripe | 2.9% + 30¢ per txn | revenue % |
| **Total infra (excl Anthropic + variable)** | | **~$1,340/mo** |

---

## 4. CI/CD Pipeline

```
PR opened
  ├─ Biome lint + typecheck
  ├─ Vitest unit tests (parallel shards)
  ├─ RLS cross-tenant attack suite (tests/rls/cross_tenant.spec.ts)
  ├─ Prisma migration check + squawk (block DROP/NOT-NULL adds w/o phase marker)
  ├─ AI golden-set eval (any prompt change must pass safety 100% + brand_voice ≥4.0)
  ├─ Checkov on Terraform (block IAM wildcards, public SG ingress on admin/db ports)
  ├─ Build all apps (turbo)
  ├─ Vercel preview deploy (preview-scoped envs only — no prod secrets)
  ├─ Playwright e2e against preview
  ├─ Bundle budget gate (apps/web first-load JS < 200KB gzipped)
  ├─ Storybook + Chromatic visual regression
  └─ Semgrep + Snyk + gitleaks

Merge to main
  ├─ Migration runs against staging DB (auto, expand phase only)
  ├─ Deploy to staging (Vercel + Fly.io)
  ├─ Smoke tests + synthetic baseline
  └─ Auto-promote to prod (gated by manual approval after 2pm window)

Release tag
  ├─ Migration to prod DB (with manual approve, expand-only)
  ├─ Deploy to prod (instant alias swap, NOT canary — see below)
  ├─ Auto-rollback if Sentry error budget breach within 10 min
  ├─ Sentry release marker
  └─ Grafana deploy annotation
```

**Migration safety (3-phase contract)**:
1. **Expand**: PR-N adds new columns/tables (additive only, all NULLable). Squawk-linted.
2. **Migrate code**: PR-N+1 deploys code that reads either old or new, writes to both.
3. **Contract**: PR-N+2 (≥48h after N+1) drops the old column/table. Requires `_PHASE3` PR title marker + DBA review.

**Deploy strategy clarified — NOT canary**:
Vercel doesn't natively support percentage traffic-split on a single domain. Our model:
- Vercel deploys are atomic alias swaps (sub-second cutover)
- Auto-rollback triggered by Sentry error rate >2% over rolling 5min OR p95 latency regression >50%
- For high-risk changes: feature flag (OpenFeature backed by `feature_flags` table) gates the new code path; rollout 5% → 25% → 100% over 24h, monitored manually.
- Pure server-side cutover for the worker tier on Fly.io uses `fly deploy --strategy=rolling` (one machine at a time, queue drains during).

**Rollback**:
- Code: `vercel rollback <deploy-id>` (Vercel) + `fly releases rollback <ver>` (workers) — target RTO 5 min
- DB: NEVER via PITR (data loss). Always forward-fix with a new migration.
- See [runbooks/rollback.md](../runbooks/rollback.md).

---

## 5. Security

### 5.1 Threat model (top risks)
| Risk | Vector | Mitigation |
|---|---|---|
| Cross-tenant data leak | Bug forgets `WHERE org_id` | RLS enforced at DB level |
| OAuth token theft | DB compromise | Tokens encrypted at rest with AWS KMS DEKs |
| Stripe webhook spoofing | Forged signature | HMAC verification + replay protection |
| Subscription bypass | Manipulated client | Plan check on server, never trust client |
| AI prompt injection | Malicious review or chatbot input | System prompt isolation; never let user content set policy; output sanitization |
| SSRF via integration URLs | User-supplied URLs (e.g., shopify webhook config) | Allowlist + private IP block |
| Session hijack | XSS | CSP, HttpOnly cookies, SameSite=Lax |
| Brute force login | Credential stuffing | Rate limit + Cloudflare Turnstile + breached-password check (Have I Been Pwned API) |
| Insider abuse | Admin impersonates without reason | Mandatory `reason` field, audit log, weekly admin-action review |

### 5.2 Security controls (expanded)

**Transport & headers**
- TLS 1.3 only (no 1.2 fallback for prod)
- HSTS preloaded (`max-age=63072000; includeSubDomains; preload`)
- Full security header set (table below)

| Header | Value |
|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'nonce-{n}' https://js.stripe.com; frame-src https://js.stripe.com; img-src 'self' data: https://*.googleusercontent.com https://*.fbcdn.net; connect-src 'self' https://api.anthropic.com wss://realtime.repuboost.io; report-uri /csp-report` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `geolocation=(), camera=(), microphone=(self), payment=(self)` |
| `X-Content-Type-Options` | `nosniff` |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Cross-Origin-Embedder-Policy` | `require-corp` |
| `X-Frame-Options` | (replaced by CSP `frame-ancestors`) |

Chatbot embed (`chat.repuboost.io`) carries its own CSP: `frame-ancestors {tenant origin allowlist from widget_keys}`.

**Authentication**
- Passwords: argon2id (memory=64MB, iterations=3, parallelism=4)
- Min 12 chars, breached-password check (HIBP) on signup AND every reset
- Account lockout: 10 failed attempts per 15min per (account+IP) pair (NOT just IP — defeats credential-stuffing IP rotation)
- Admin lockout: 5 failed attempts per 1h
- Magic link: 15-min TTL, single-use, IP-bound (rejected if redeemed from a different /16 than requested)
- 2FA: TOTP for users; **WebAuthn / FIDO2 mandatory for all admin users** (TOTP alone insufficient — see §5.8)
- Session: HttpOnly cookie, 30d rolling, regenerated on privilege change

**CSRF**
- Auth.js handles via SameSite=Lax + state nonces
- Non-Auth.js mutating routes: double-submit token + Origin header check + custom header (`X-Requested-With`)

**Authorization**
- All authz via `can(user, action, resource)` central helper (uses `establishment_members` for per-establishment ACL)
- Cross-establishment access by non-owner returns **404** (not 403 — don't leak existence)
- Contract test: every mutating endpoint has a "user from org B cannot affect resource in org A" case

**Encryption at rest**
- AES-256 throughout (RDS, S3, ElastiCache snapshots, Aurora backups)
- OAuth tokens use envelope encryption (see §5.5 KMS catalog and DATA_MODEL §3.3)
- Per-tenant DEKs rotated nightly by background worker; alert if any row's `key_version < current - 1` for >90 days

**Compliance & data subject rights**
- GDPR DPA signed with subprocessors (Anthropic, Stripe, Vercel, AWS, Twilio, SendGrid, Cloudflare, ClickHouse Cloud)
- Public sub-processor page at `/legal/subprocessors` updated within 30 days of changes
- DSR endpoints: `/api/v1/me/data-export` (Article 20, machine-readable JSON of all linked PII), `/api/v1/me/erasure` (Article 17, 30-day soft-delete then attested hard-delete)
- Cookie consent banner (TCF-compliant) on EU traffic detection
- 72h breach notification clock — see [runbooks/breach_response.md](../runbooks/breach_response.md)

**Other**
- 2FA: required for `owner` role; **mandatory** for all admin users (WebAuthn)
- SSO: SAML 2.0 + SCIM (P2, enterprise plans)
- Pen test: annual external firm
- SOC 2 Type I (Y1 Q3) → Type II (Y2 Q2)
- `security.txt` published at `/.well-known/security.txt`; bug bounty triage SLA: critical 24h, high 72h

### 5.3 PII handling

**Storage retention table:**

| PII | Where stored | Retention |
|---|---|---|
| User email, name | `users` table | While account active + 30d |
| Phone numbers (recipients) | `review_requests` | 13 months (TCPA), then deleted |
| Reviewer name (from Google) | `reviews` | Indefinite (public data) |
| Inbox messages | `inbox_messages` | 25 months (default), tenant-configurable |
| Survey answers | `survey_answers` | Tenant-configurable |
| AI conversation logs | `ai_messages` | 90 days |
| Phone call recordings + transcripts | S3 (org-scoped prefix) | 30 days; transcript PII redacted before Postgres write via Presidio |
| Audit logs | `audit_log` + S3 Object Lock | 7 years (SOC 2 + insurance) |

**Pino log redaction config (mandatory in every service):**
```ts
const logger = pino({
  redact: {
    paths: [
      'req.headers.authorization', 'req.headers.cookie',
      '*.password', '*.password_hash', '*.totp_secret',
      '*.access_token', '*.refresh_token', '*.access_token_ct', '*.refresh_token_ct',
      '*.dek_ciphertext',
      '*.stripe_payment_intent', '*.stripe_secret',
      '*.activation_code', '*.activation_code_hash',
      'body.email', 'body.phone', 'body.recipient',
      '*.shipping_address',
      'body.tokenString', '*.client_secret',
    ],
    censor: '[REDACTED]',
  },
});
```

PII in URL paths (e.g., `/inbox/threads/{uuid}`) is OK — UUIDs aren't PII. PII in URL **query strings** is forbidden — use POST body.

**Presidio pipeline for phone transcripts**: STT output → Presidio (CREDIT_CARD, PHONE_NUMBER, EMAIL_ADDRESS, PERSON, LOCATION) → masked text stored in Postgres; raw recording in S3 with 30d lifecycle delete.

---

### 5.4 IAM Role Catalog (AWS)

Every AWS role uses least-privilege. Wildcard `Action: *` or `Resource: *` is rejected by Checkov in CI.

| Role | Trust principal | Allow (summary) | Deny |
|---|---|---|---|
| `repuboost-vercel-runtime` | OIDC: `vercel.com` for org `repuboost`, prod env only | `secretsmanager:GetSecretValue` on `arn:...:secret:repuboost/prod/web/*`; `s3:PutObject` + `s3:GetObject` on `repuboost-tenant-uploads/*` | All others |
| `repuboost-worker-runtime` | OIDC: Fly.io machines, prod app | `secretsmanager:GetSecretValue` on `arn:...:secret:repuboost/prod/worker/*`; `kms:Decrypt` only with `EncryptionContext.purpose=oauth`; `s3:*` only on `repuboost-tenant-exports/*` | iam:*, ec2:RunInstances |
| `connections-decryptor` | Assumed by review-sync + token-refresh workers | `kms:Decrypt` on OAuth CMK with EncryptionContext match | All else |
| `audit-archiver` | Assumed by daily audit export job | `s3:PutObject` (with `x-amz-object-lock-mode=COMPLIANCE`) on `repuboost-audit-archive/*` | s3:DeleteObject anywhere |
| `admin-worker-runtime` | OIDC: dedicated Fly.io machine, IP-allowlisted | DB connect as `app_admin_writer`; `stripe-refund-key` from Secrets Mgr; `kms:Decrypt` on admin-ops CMK | Everything else |
| `analytics-ingest` | Fly.io worker | `clickhouse:Insert`; read-only S3 on event archive | All write to other AWS resources |

**Forbidden combinations** (CI Checkov gate):
- `iam:PassRole` + `lambda:CreateFunction` (escalation)
- `iam:PassRole` + `ec2:RunInstances`
- `iam:CreatePolicyVersion` + `iam:SetDefaultPolicyVersion`
- `s3:*` on `*` resource
- Any role with `Action: *`

### 5.5 KMS Key Catalog

Each Customer-Managed Key (CMK) has a single purpose, an explicit allow-list, and rotation enabled.

| Alias | Purpose | Allowed `kms:Decrypt` principals | EncryptionContext required |
|---|---|---|---|
| `alias/repuboost/oauth` | OAuth refresh-token DEK wrapping | `connections-decryptor` only | `{org_id, provider, purpose: "oauth"}` |
| `alias/repuboost/widget-secrets` | Embeddable widget HMAC secrets | `chatbot-runtime` only | `{org_id, purpose: "widget"}` |
| `alias/repuboost/s3-tenant-uploads` | S3 SSE-KMS for tenant uploads | `vercel-runtime`, `worker-runtime` | n/a (bucket-level) |
| `alias/repuboost/s3-audit-archive` | S3 Object Lock audit archive | `audit-archiver` write; SOC2 auditor read | n/a |
| `alias/repuboost/rds` | Aurora encryption-at-rest | RDS service principal | n/a |
| `alias/repuboost/admin-ops` | Stripe refund key, break-glass secrets | `admin-worker-runtime` only | `{action, admin_user_id}` |

**Stripe API key strategy** (key separation):
- `repuboost/prod/stripe/checkout-write` — Restricted: Customers:write, PaymentIntents:write, Subscriptions:write. Used by web runtime.
- `repuboost/prod/stripe/refund-only` — Restricted: Refunds:write only. Used by admin-worker.
- `repuboost/prod/stripe/read-only` — Restricted: read-only on all. Used by analytics + reporting.

**Anthropic API key strategy** — separate keys per surface (chatbot / phone / replies / classifier / sentiment) so a leaked widget key doesn't unlock receptionist quotas. Per-surface daily $ caps configured in Anthropic console.

### 5.6 Network Topology (AWS VPC)

```
VPC (10.0.0.0/16) us-east-1
├─ Public subnets       (10.0.0.0/19,  10.0.32.0/19,   10.0.64.0/19)   — NAT, ALB
├─ Private-app subnets  (10.0.96.0/19, 10.0.128.0/19,  10.0.160.0/19)  — Fly.io machines (via WireGuard peering), Vercel egress hits internal endpoints via VPC Lattice
└─ Private-data subnets (10.0.192.0/19,10.0.224.0/19,  10.0.232.0/19)  — Aurora, ElastiCache, no IGW route
```

**Security group ingress matrix:**

| SG | Allows from | On |
|---|---|---|
| `sg-aurora` | `sg-app-tier`, `sg-worker-tier`, `sg-admin-worker` | tcp/5432 |
| `sg-redis` | `sg-app-tier`, `sg-worker-tier` | tcp/6379 |
| `sg-app-tier` | `sg-alb` | tcp/3000 |
| `sg-alb` | 0.0.0.0/0 (Cloudflare-fronted) | tcp/443 |
| `sg-admin-worker` | Office VPN CIDR + Cloudflare Access tunnel | tcp/3001 |

**Mandatory:**
- Aurora `publicly_accessible = false`
- ElastiCache subnet group is private-data only
- Checkov CI gate fails on `0.0.0.0/0` ingress to ports 22, 3389, 5432, 6379, 3306, 1433, 27017

### 5.7 S3 Bucket Baseline

Every S3 bucket is created via the `repuboost-s3-tenant-bucket` Terraform module. Baseline:

```hcl
resource "aws_s3_bucket_public_access_block" "this" {
  bucket                  = aws_s3_bucket.this.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "this" {
  bucket = aws_s3_bucket.this.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = var.kms_key_arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_policy" "deny_unencrypted_transit" {
  bucket = aws_s3_bucket.this.id
  policy = jsonencode({
    Statement = [{
      Effect = "Deny", Principal = "*", Action = "s3:*",
      Resource = ["${aws_s3_bucket.this.arn}/*", aws_s3_bucket.this.arn],
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
}

# Tenant-prefix isolation: org_{id}/* — IAM conditions enforce s3:prefix matches PrincipalTag/org_id
```

Account-level public access block is also `true × 4`. Both must be set; account-level can be overridden by bucket-level if not enforced.

Presigned URL TTL: max 600s. Tenant exports are written under `org_{id}/exports/{date}/` and downloaded via short-lived presigned URLs.

### 5.8 Admin Panel Zero-Trust

Admin panel is the highest-blast-radius surface. Posture:

| Control | |
|---|---|
| Auth | Email + password + **WebAuthn** (FIDO2 hardware key required, TOTP disabled). `last_webauthn_at` < 12h enforced for any sensitive action (impersonation, refund, suspend). |
| Network | Front by Cloudflare Access (Zero Trust) + SSO + device posture (managed device required). Behind that, app sits on a dedicated Fly.io machine on a separate subnet. NO Vercel deploy for admin. |
| DB | Connects only as `app_admin_reader` for reads, `app_admin_writer` for writes. WebAuthn assertion required to acquire `app_admin_writer` token. |
| Audit | Every admin action emits `audit_log` row with `actor_type='admin_user'`. Trigger on BYPASSRLS-eligible tables fires `RAISE EXCEPTION` if `app.audit_context` is unset → no silent bypass. |
| Impersonation | Read-only by default, mandatory `reason` text field, banner shown to tenant ("Admin viewing"), max 60-min session, audit-logged. Write actions require separate WebAuthn re-prompt + secondary admin approval (4-eye principle). |
| Break-glass | Stripe key checkout requires 2-person Slack approval; logged + reviewed weekly. |
| Offboarding | SCIM-driven from Google Workspace; access revoked within 60s of HR event. |

### 5.9 Webhook Security Contract

| Provider | Header | Algorithm | Skew | Idempotency key | Notes |
|---|---|---|---|---|---|
| Stripe | `Stripe-Signature` | HMAC-SHA256 of `t.payload` | 300s | `event.id` | Retries aggressively → idempotency mandatory |
| Twilio (SMS/voice) | `X-Twilio-Signature` | HMAC-SHA1 of url+sortedParams | 300s | `MessageSid` / `CallSid` | Validate against full URL incl. query |
| Meta (FB/IG) | `X-Hub-Signature-256` | HMAC-SHA256 of raw body | 600s | `entry[].id+changes[].time` | Verify using app secret per integration |
| Google GBP | OAuth bearer + Pub/Sub `X-Goog-Channel-Token` | bearer match + JWT | 600s | Pub/Sub `messageId` | |
| Shopify | `X-Shopify-Hmac-SHA256` | HMAC-SHA256 base64 | 600s | `X-Shopify-Webhook-Id` | |
| LinkedIn | `X-LI-Signature` | HMAC-SHA256 | 600s | `eventId` | |
| SendGrid | `X-Twilio-Email-Event-Webhook-Signature` | ECDSA P-256 | 600s | per-event `sg_event_id` | |
| WooCommerce | `X-WC-Webhook-Signature` | HMAC-SHA256 base64 | 600s | `X-WC-Webhook-Delivery-ID` | |

**Middleware contract** (every inbound webhook handler):
```ts
export async function handleWebhook(provider: Provider, req: Request) {
  const raw = await req.text();
  const sig = req.headers.get(provider.sigHeader);
  if (!verifyHMAC(provider, raw, sig)) return reject(401, 'rejected_signature');

  const ts = extractTimestamp(provider, raw);
  if (Math.abs(Date.now()/1000 - ts) > provider.skew) return reject(401, 'replay_skew');

  const eventId = extractEventId(provider, raw);
  // INSERT ON CONFLICT — true idempotency, no race window
  const inserted = await db.webhookDeliveries.upsert(provider.name, eventId, sha256(raw));
  if (!inserted) return ok({ idempotent: true }); // 200, drop

  // ordering check (Stripe specifically)
  if (provider.name === 'stripe') {
    const event = JSON.parse(raw);
    const stored = await getStoredCreatedAt(event.data.object.id);
    if (stored && event.created < stored) return ok({ stale: true });
  }

  await processEvent(provider, raw);
}
```

### 5.10 Compliance Operations

- **Sub-processor page**: `/legal/subprocessors` (auto-generated from a YAML manifest; PR-reviewed; tenant notification email on changes ≥30 days before effect)
- **Cookie banner**: `cookie-banner` package, TCF v2.2; only loads non-essential scripts after consent
- **Data export endpoint**: `/api/v1/me/data-export` returns ZIP of (users, memberships, all reviews, all inbox messages, all surveys + responses, all hardware orders) as JSON
- **Erasure endpoint**: `/api/v1/me/erasure` triggers 30-day pending-delete; reversible; after 30d, hard-delete worker scrubs PII columns and emits attestation
- **Bug bounty**: HackerOne or self-hosted at `/security`; SLA: critical 24h, high 72h, medium 7d
- **`security.txt`**: published at `/.well-known/security.txt`

### 6.1 The 4 golden signals (per service)
- Latency (p50, p95, p99)
- Errors (rate, top 10)
- Saturation (CPU, mem, queue depth)
- Traffic (RPS by endpoint)

### 6.2 Dashboards (must exist)
1. **Service health** (uptime, error rate per service)
2. **AI cost & usage** (per-tenant spend, model breakdown, cache hit rate)
3. **Job queue health** (depth, age of oldest job, failures)
4. **Integration health** (each external API success rate, rate-limit headroom)
5. **Tenant funnel** (signup → connect Google → first review → first paid)
6. **Revenue** (MRR, churn, expansion, hardware orders)

### 6.3 Alerts (paged)
- Error rate > 1% over 5 min
- Queue lag > 5 min
- Postgres CPU > 80% sustained 10 min
- Redis memory > 75%
- Stripe webhook signature failures > 0
- Anthropic 5xx rate > 5%
- Hardware fulfillment queue stalled > 24h
- Any integration token revocation count spike (10x baseline)

---

## 7. Scaling Strategy

### 7.1 Vertical first, horizontal when needed
- Aurora: scale ACUs up to 16 → then read replicas → then split to per-region
- Workers: increase Fly.io machine count → split queues into priority lanes → extract AI worker

### 7.2 Specific bottlenecks & answers
| Bottleneck | At what scale | Solution |
|---|---|---|
| Postgres write throughput | ~5K writes/sec | Already 99% reads; partition `audit_log` and `ai_messages` by month |
| Redis queue throughput | ~50K jobs/min | Split queues per priority + worker pool per queue |
| Anthropic rate limits | TBD per tenant | Per-tenant token bucket; backpressure with toast in UI |
| Inbox WebSocket connections | 5K concurrent | Extract realtime gateway (Soketi or Centrifugo) |
| Short-link redirects | 10K rps | Already at edge — auto-scales |
| Analytics queries | Heavy joins on reviews | Move to ClickHouse views, refresh hourly |

### 7.3 Per-tenant resource isolation
- AI: per-tenant daily $ cap; configurable via plan
- SMS: per-tenant cap (default 5K/mo, paid expansion)
- API: per-tenant rate limit
- DB: pg_stat_statements per `app.current_org_id` to spot abuse

---

## 8. Backup & Disaster Recovery

| Asset | Backup | RPO | RTO |
|---|---|---|---|
| Postgres | PITR 7d + daily logical to S3 (30d) + monthly (1y) | 5 min | 1 h |
| Redis | RDB snapshot 1h + AOF | 1 h | 15 min (degraded fine) |
| S3 | Versioning + cross-region replication to eu-west-1 | 0 | minutes |
| ClickHouse | Daily backup → S3 | 24 h | 4 h (analytics non-critical) |
| Code | GitHub | 0 | minutes |
| Secrets | AWS Secrets Manager + glacier export weekly | 7 d | 1 h |

**DR drill**: quarterly — restore Postgres from PITR to a separate cluster, run smoke tests.

**RTO targets**:
- Critical paths (auth, review write): 1 h
- Non-critical (analytics, reports): 4 h

---

## 9. Compliance Roadmap

| Quarter | Milestone |
|---|---|
| Q1 (launch) | GDPR DPA, ToS/Privacy Policy, cookie consent, data deletion endpoint |
| Q2 | Security policies documented, vendor due diligence, employee security training |
| Q3 | SOC 2 Type I (with Vanta or Drata) |
| Q4 | Pen test, SOC 2 Type II evidence collection begins |
| Y2 Q2 | SOC 2 Type II report |
| Y2 Q3 | ISO 27001 (if EU enterprise demand) |
| Y2 Q4 | TCPA / CTIA SMS audit |

---

## 10. Cost Controls

- **Per-tenant cost dashboard**: AI + SMS + Twilio Voice + bandwidth — visible in admin panel
- **AI cost capping**: hard cap per plan; soft warning at 80%
- **Auto-pause heavy abusers**: > 10x median tenant spend triggers ops review (not auto-suspend, but flagged)
- **Negotiated rates**: Anthropic enterprise tier when monthly spend > $20K; Twilio committed-use after $5K/mo
- **Reserved instances**: RDS reserved 1y when stable

---

## 11. On-Call & Runbooks

- 2 on-call engineers, weekly rotation
- Pager: PagerDuty integration with Sentry + Grafana alerts
- Escalation tiers: P1 → IC → engineering manager (15min) → CTO (30min) → CEO (60min)
- Required runbooks (in `docs/runbooks/`):
  1. Postgres failover
  2. Anthropic outage (degrade chatbot to canned, queue replies, fail over phone to Bedrock)
  3. Twilio outage (switch to MessageBird)
  4. OAuth bulk revocation event (mass token-refresh storm)
  5. Stripe webhook outage / signature failure spike
  6. Mass-email mistake recall
  7. **Breach response** (GDPR 72h clock — IC → DPO → legal → customer comms → regulator)
  8. Hardware fulfillment partner outage
  9. Rollback (Vercel + Fly + DB-forward-fix policy)
  10. Cloudflare KV rebuild (rebuild slug→device map from Postgres, RTO target 15min)
  11. Aurora ACU saturation (emergency scale-up beyond 16, query plan investigation)
  12. Logical corruption recovery (PITR snapshot → diff → selective UPSERT, NOT cluster restore)
  13. EU failover (promote eu-west-1 replica, DNS swap, Stripe/Twilio implications)
  14. AI cost runaway (per-tenant disable, identify abuser via ClickHouse query)
  15. Secrets break-glass (2-person Slack approval, audit review)
  16. Drift remediation (nightly Terraform plan non-zero exit)
  17. DEK rotation (re-encrypt OAuth tokens under new key version)
  18. Cross-tenant data leak discovered (RLS bypass, KV poisoning)
  19. Cloudflare KV API token compromise (rotate, audit, revoke + re-issue all slugs)

See [runbooks/INDEX.md](../runbooks/INDEX.md).
