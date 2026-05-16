# Security & Operations Review — Consolidated Findings

> Output of 4 parallel specialist reviews (Cloud Security · SecOps/AppSec · ML Engineering · DevOps/Platform) against PRD v0.1. De-duplicated and prioritized. Status mapped against existing docs and inline updates applied.

| Review lens | Critical | High | Medium |
|---|---|---|---|
| Cloud Security | 4 | 6 | 6 |
| SecOps / AppSec | 6 | 9 | 7 |
| ML / AI Engineering | 5 | 10 | 10 |
| DevOps / Platform | 4 | 9 | 10 |
| **De-duped** | **15** | **27** | **27** |

---

## 1. Top 15 Critical Findings (block production)

| # | Finding | Source(s) | Status | Where fixed |
|---|---|---|---|---|
| **CR-1** | Generic `BYPASSRLS` admin role = single-step total tenant breach on any leak | CloudSec C1, SecOps C6 | **FIXED** | [DATA_MODEL.md §2.1](architecture/DATA_MODEL.md), [INFRASTRUCTURE.md §5.4](architecture/INFRASTRUCTURE.md) |
| **CR-2** | RLS policy missing `WITH CHECK` → cross-tenant write escape via `INSERT/UPDATE` | CloudSec H8 (escalated) | **FIXED** | [DATA_MODEL.md §2.2](architecture/DATA_MODEL.md) |
| **CR-3** | OAuth tokens — KMS DEK strategy named but unspecified; no per-row key columns | CloudSec C2 | **FIXED** | [DATA_MODEL.md §3.3](architecture/DATA_MODEL.md), [INFRASTRUCTURE.md §5.5](architecture/INFRASTRUCTURE.md) |
| **CR-4** | Cloudflare KV slug map = single point of failure; slug enumeration leaks tenant funnel; no signed redirect | CloudSec C4, SecOps H8, DevOps C3 | **FIXED** | [BILLING_AND_HARDWARE.md §3](BILLING_AND_HARDWARE.md), [ARCHITECTURE.md §6](architecture/ARCHITECTURE.md) |
| **CR-5** | Admin panel relies on TOTP + IP allowlist only — no WebAuthn, no zero-trust posture | CloudSec C3 | **FIXED** | [INFRASTRUCTURE.md §5.8](architecture/INFRASTRUCTURE.md) |
| **CR-6** | Public chatbot endpoint allows AI cost exhaustion via spoofable Origin header | SecOps C1, CloudSec H10 | **FIXED** | [ARCHITECTURE.md §5.7](architecture/ARCHITECTURE.md), [API_SURFACE.md §5](api/API_SURFACE.md) |
| **CR-7** | Public survey endpoint unauthenticated, no token entropy/expiry/single-use enforcement | SecOps C2 | **FIXED** | [API_SURFACE.md §5](api/API_SURFACE.md), [DATA_MODEL.md §3.12](architecture/DATA_MODEL.md) |
| **CR-8** | RAG ingestion endpoint = SSRF primitive (RFC1918, 169.254.169.254 metadata, DNS rebinding) | SecOps C3 | **FIXED** | [ARCHITECTURE.md §5.7](architecture/ARCHITECTURE.md), [AI_STRATEGY.md §6](architecture/AI_STRATEGY.md) |
| **CR-9** | Webhook idempotency + replay protection asserted but never modeled | SecOps C4, CloudSec M13, DevOps H4 | **FIXED** | [DATA_MODEL.md §3.12](architecture/DATA_MODEL.md), [INFRASTRUCTURE.md §5.9](architecture/INFRASTRUCTURE.md) |
| **CR-10** | OAuth `state` param handling unspecified → callback CSRF + tenant fixation | SecOps C5 | **FIXED** | [API_SURFACE.md §2.4](api/API_SURFACE.md), [DATA_MODEL.md §3.12](architecture/DATA_MODEL.md) |
| **CR-11** | AI replies auto-publish to Google with no output safety classifier | ML/AI C1 | **FIXED** | [AI_STRATEGY.md §5](architecture/AI_STRATEGY.md), [DATA_MODEL.md §3.9](architecture/DATA_MODEL.md) |
| **CR-12** | Indirect prompt injection from user-controlled review bodies in RAG / few-shot | ML/AI C2 | **FIXED** | [AI_STRATEGY.md §5](architecture/AI_STRATEGY.md), [ARCHITECTURE.md §5.7](architecture/ARCHITECTURE.md) |
| **CR-13** | RAG embeddings missing `establishment_id` → cross-location bleed for multi-location tenants | ML/AI C3 | **FIXED** | [DATA_MODEL.md §3.9](architecture/DATA_MODEL.md) |
| **CR-14** | Vercel "canary" doesn't exist natively — pipeline contract is fictional | DevOps C1 | **FIXED** | [INFRASTRUCTURE.md §4](architecture/INFRASTRUCTURE.md) |
| **CR-15** | Aurora Serverless v2 0.5–4 ACU cap will brown-out at 1K tenants | DevOps C4 | **FIXED** | [INFRASTRUCTURE.md §3](architecture/INFRASTRUCTURE.md) |

---

## 2. High Findings — Summary Table

| # | Finding | Lens | Where addressed |
|---|---|---|---|
| H1 | CSP / CSRF / security-header policy is one line | SecOps | INFRASTRUCTURE §5.2 expanded |
| H2 | XSS in inbox + reviews + AI-generated content not sanitized | SecOps | ARCHITECTURE §5.7 |
| H3 | Magic-link + no-card trial = account farming + SMS spam vector | SecOps | ARCHITECTURE §5.7, ROADMAP Phase 1 |
| H4 | Account lockout / password policy / breached-password check incomplete | SecOps | INFRASTRUCTURE §5.2 |
| H5 | Pino redaction config missing → 7y PII retention | SecOps | INFRASTRUCTURE §5.3 |
| H6 | TCPA SMS consent / CAN-SPAM unsubscribe not modeled | SecOps | DATA_MODEL §3.5 |
| H7 | IDOR via guessable uuidv7 + ACL gap | SecOps | ARCHITECTURE §5.2 + contract test |
| H8 | NFC URI rewritable in field — no auth specified | SecOps | BILLING_AND_HARDWARE §3.4 |
| H9 | S3 bucket configuration baseline missing | CloudSec | INFRASTRUCTURE §5.7 |
| H10 | Aurora / ElastiCache public-accessibility / SG ingress unspecified | CloudSec | INFRASTRUCTURE §5.6 |
| H11 | Stripe / Anthropic key scoping + restricted-key usage missing | CloudSec | INFRASTRUCTURE §5.5 |
| H12 | Worker IAM role wildcard blast radius undocumented | CloudSec | INFRASTRUCTURE §5.4 |
| H13 | Prompt cache breakpoint placement ambiguous; 5-min TTL won't hit for low-traffic tenants | ML/AI | AI_STRATEGY §3 |
| H14 | $4/tenant/mo cost target unproven — show the math | ML/AI | AI_STRATEGY §8 |
| H15 | No reranker → RAG quality cliff at scale | ML/AI | AI_STRATEGY §4 |
| H16 | Chunking strategy undefined | ML/AI | AI_STRATEGY §4 |
| H17 | No eval framework (LLM-as-judge, golden sets, regression CI) | ML/AI | AI_STRATEGY §7 |
| H18 | Hallucination on factual chatbot Qs without confidence/citations | ML/AI | AI_STRATEGY §5 |
| H19 | Brand-voice drift on long sessions | ML/AI | AI_STRATEGY §3 |
| H20 | No Anthropic→Bedrock fallback for live phone | ML/AI | AI_STRATEGY §9 |
| H21 | Per-purpose AI cost breakdown missing | ML/AI | DATA_MODEL §3.9 |
| H22 | Rollback procedure undefined | DevOps | runbooks/rollback.md |
| H23 | Tracing tool ambiguity (Honeycomb vs Tempo) | DevOps | TECH_STACK §1 |
| H24 | SLOs missing — only uptime % defined | DevOps | SLOs.md |
| H25 | No idempotency keys for Stripe webhooks / AI replies | DevOps | DATA_MODEL §3.12, §3.9 |
| H26 | Aurora EU residency claim not provisioned | DevOps | INFRASTRUCTURE §3 (deferred + flagged) |
| H27 | Per-tenant AI daily cap counter location undefined (Redis vs Postgres) | DevOps | AI_STRATEGY §8 |

---

## 3. Medium Findings — Bucket Summary

The 27 medium findings cluster into 6 themes — each addressed in the linked docs:

1. **Compliance specifics** (cookie consent, GDPR DSR API completeness, DPA/sub-processor list, security.txt, bug bounty SLA) → INFRASTRUCTURE §5.10, ROADMAP Phase 4
2. **Operational hygiene** (DEK rotation procedure, drift detection, restore drill cadence, audit log tamper-evidence, mock Anthropic for offline dev) → INFRASTRUCTURE §5.5/§8/§11, AI_STRATEGY §10
3. **Webhook + integration robustness** (Stripe ordering, signature semantics per provider, Twilio recordings PII) → INFRASTRUCTURE §5.9
4. **AI quality + observability** (HITL UI, feedback table, audit AI events, voice transcript PII redaction, document re-embedding cadence, brand_voice JSONB schema, Opus routing rule, Bedrock cache differences, Stripe data residency) → AI_STRATEGY full doc
5. **DevOps refinements** (Pulumi/Terraform consolidation, ElastiCache MVP sizing, ClickHouse upgrade triggers, per-tenant dashboards, Checkly endpoint list, Vercel build minutes, secret rotation per type, break-glass procedure) → INFRASTRUCTURE §3/§6/§11
6. **Data integrity** (cross-region replication scoping for residency, audit_log hash chain, established prompt versioning) → DATA_MODEL §3.11/§3.12

See respective doc sections for the concrete implementation.

---

## 4. What was already correct (don't redo)

| Existing decision | Where |
|---|---|
| RLS as defense-in-depth + CI invariant test | DATA_MODEL §2 |
| Modular monolith with documented extraction triggers | ARCHITECTURE ADR-001, §7 |
| Per-tenant DEK encryption *intent* (now made concrete) | INFRASTRUCTURE §5.2 |
| Separate `admin_users` table, not mixed with tenant users | DATA_MODEL §3.1 |
| Per-tenant AI $ daily cap *intent* (now made concrete) | ARCHITECTURE §5.4 |
| Outbox pattern for async events | TECH_STACK §6 |
| Multi-provider SMS abstraction (Twilio + MessageBird) | ARCHITECTURE §6 |
| TLS 1.3, HSTS preloaded, SameSite cookies | INFRASTRUCTURE §5.2 |
| HMAC webhook signature *intent* (contract now defined) | API_SURFACE §3 |
| PITR 7d + cross-region S3 replication + quarterly DR drill | INFRASTRUCTURE §8 |
| Tenant scope derived from session/API key only | API_SURFACE §1 |
| Streaming for chatbot + phone | TECH_STACK §3 |
| pgvector + HNSW choice for RAG | TECH_STACK §1 |
| Per-environment Anthropic project isolation | INFRASTRUCTURE §1 |

---

## 5. New Documents Added This Pass

| Doc | Purpose |
|---|---|
| [SECURITY_AND_OPS_REVIEW.md](SECURITY_AND_OPS_REVIEW.md) (this) | Consolidated findings + traceability |
| [architecture/AI_STRATEGY.md](architecture/AI_STRATEGY.md) | Full AI architecture: model routing, caching, RAG, evals, safety, phone latency, fallback chain |
| [SLOs.md](SLOs.md) | Service Level Objectives + error budget policy |
| [runbooks/INDEX.md](runbooks/INDEX.md) | Index of 16 runbooks (stubs for Phase 0-1 work) |

## 6. Existing Documents Modified

| Doc | Sections changed |
|---|---|
| [PRD.md](PRD.md) | Updated Open Questions list to reflect security decisions made |
| [ARCHITECTURE.md](architecture/ARCHITECTURE.md) | Added §5.7 Validation/Sanitization, §6 KV failure mode |
| [DATA_MODEL.md](architecture/DATA_MODEL.md) | RLS canonical pattern, envelope encryption columns, activation_code field, sms_consents, unsubscribes, webhook_deliveries, oauth_state_consumed, prompt_versions, ai_evals, ai_feedback, ai_safety_verdicts, ai_embeddings establishment scope, audit_log hash chain |
| [INFRASTRUCTURE.md](architecture/INFRASTRUCTURE.md) | Aurora ACU bump, deploy strategy clarified, §5.4 IAM catalog, §5.5 KMS catalog, §5.6 Network topology, §5.7 S3 baseline, §5.8 Admin zero-trust, §5.9 Webhook security contract, §5.10 Compliance ops, §5.3 Pino redaction, expanded runbook list |
| [API_SURFACE.md](api/API_SURFACE.md) | OAuth state pattern, public endpoint anti-abuse details, activation endpoints |
| [BILLING_AND_HARDWARE.md](BILLING_AND_HARDWARE.md) | Activation flow + activation_code mechanic, slug entropy + signed redirect, NFC rewrite auth |
| [TECH_STACK.md](architecture/TECH_STACK.md) | Tracing tool decision (Tempo on Grafana Cloud) |
| [ROADMAP.md](ROADMAP.md) | Phase 0 security baseline tasks, Phase 1 abuse controls |

---

## 6.5 Third-Pass Review (2026-05-09 — DB + AI Security)

A third review pass added 3 specialist lenses. Findings consolidated below; all critical items applied to the docs.

### DB Production-Readiness (6 critical, 12 high, 12 medium)

| # | Finding | Where addressed |
|---|---|---|
| DB-1 | RLS-scoped indexes lack `organization_id` leading column → seq-scan fallback at scale | DATA_MODEL §6.2 (replacement composite indexes) |
| DB-2 | `audit_log`, `ai_messages`, `inbox_messages`, `review_requests`, `webhook_deliveries` not partitioned → autovacuum / DELETE storms at 50M+ rows | DATA_MODEL §6.4 (pg_partman strategy) |
| DB-3 | HNSW index lacks tenant pre-filter capability + suboptimal params | DATA_MODEL §6.3 (m=32, ef_construction=200, iterative scan) |
| DB-4 | Cascade storms on `organizations` delete (30-table FK chain) | DATA_MODEL §6.5 (RESTRICT + soft-delete + chunked hard-delete worker) |
| DB-5 | RLS GUC `current_setting()` evaluates per-row → no index-only scans possible | DATA_MODEL §6.1 (subselect form: `(SELECT app.current_org())`) |
| DB-6 | `reviews UNIQUE (source, external_id)` rejects 2nd tenant on shared Place ID | DATA_MODEL §6.7 (scope to establishment) |
| DB-H1 | Missing partial index on `review_requests.scheduled_for WHERE status='queued'` | DATA_MODEL §6.2 |
| DB-H2 | No covering / INCLUDE indexes for hot read paths | DATA_MODEL §6.2 |
| DB-H3 | Enums as TEXT with no CHECK enforcement | DATA_MODEL §6.6 (CHECK constraints + DOMAINs) |
| DB-H4 | Phone numbers as TEXT — no E.164 enforcement, suppression check breaks on format drift | DATA_MODEL §6.6 (`phone_e164` DOMAIN) |
| DB-H5 | Encrypted phone blocking suppression check (lookup against ciphertext impossible) | DATA_MODEL §6.8 (HMAC sidecar column) |
| DB-H6 | Materialized counters missing — every dashboard hit recomputes from millions of rows | DATA_MODEL §6.9 (`mv_establishment_stats`) |
| DB-H7 | No connection pooler — Aurora serverless + Vercel/Fly = thundering herd | DATA_MODEL §6.10 (RDS Proxy + Prisma `?pgbouncer=true`) |
| DB-H8 | No statement_timeout / lock_timeout per role | DATA_MODEL §6.11 |
| DB-H9 | `unsubscribes` PK ordering wrong (low-cardinality first) | DATA_MODEL §6.2 + §3.12 covering index |
| DB-H10 | Squawk rules not pinned | DATA_MODEL §6.13 |
| DB-H11 | Pagination contract not enforced (offset paginations risk seq-scan) | DATA_MODEL §6.14 (cursor-only) |
| DB-H12 | Inbox listing N+1 risk (last message body) | DATA_MODEL §6.15 (denormalized + trigger) |

### AI Security Deep Dive (5 critical, 8 high, 7 medium)

| # | Finding | Where addressed |
|---|---|---|
| AI-1 | Indirect injection via RAG ingestion → poisoned chunks reach prompt unfenced | AI_STRATEGY §3.3 (retrieved chunks fenced in `<untrusted_doc>`); ingest-time injection signature scan |
| AI-2 | Markdown image rendering → zero-click data exfil via crafted URLs | AI_STRATEGY §5.1 (strip markdown image syntax + `exfil_url` flag in classifier) |
| AI-3 | `establishment_id` nullable on `ai_documents`/`ai_embeddings` + missing FORCE RLS on `ai_documents`/`ai_conversations` → cross-tenant leak path | DATA_MODEL §3.9 (FORCE RLS added; explicit org_wide flag) |
| AI-4 | Phone receptionist transcripts = PII goldmine; no recording consent flow; no PII redaction | AI_STRATEGY §11 (consent prompt, Presidio redaction, retention) |
| AI-5 | Per-tenant cost cap bypassed on phone (mid-call) and batch jobs (sentiment, evals) | AI_STRATEGY §8.2 (single `chargeAndCheck()` helper at every call site, mid-call enforcement) |
| AI-H1 | System-prompt extraction defense missing | AI_STRATEGY §5.1 (`system_prompt_leak` flag) |
| AI-H2 | Multi-turn chatbot context-window pollution (no per-turn re-fencing) | AI_STRATEGY §3.3 (re-fence on every turn; fork on jailbreak) |
| AI-H3 | Adversarial reviews exploit auto-publish (5⭐ rating + negative body) | AI_STRATEGY §5.3 (rating-sentiment mismatch gate) |
| AI-H4 | Brand-voice cache cross-pollination risk | AI_STRATEGY §3.1 (per-tenant marker in every cached prefix) |
| AI-H5 | Forensics gap — `retrieved_chunk_ids` insufficient for explainability/dispute | DATA_MODEL §3.9 (added `rendered_prompt_hash`, `model_fingerprint`, etc); AI_STRATEGY §12 |
| AI-H6 | RAG document hardening: PDF JS, ZIP-bombs, OCR-hidden instructions | AI_STRATEGY §4.6 (sandboxed parser, content-ratio check) |
| AI-H7 | Hallucinated medical/legal/financial claims — tenant liability | AI_STRATEGY §5.1 (domain-specific claim flags); §5.3 (regulated_domain → always pending_review) |
| AI-H8 | Vishing / caller-ID spoofing on phone receptionist | AI_STRATEGY §11.2 (STIR/SHAKEN attestation or OTP-back verification) |

---

## 7. Recommended Order of Implementation (Phase 0 additions)

Add to Weeks 1–2 of the roadmap:

1. **Day 1**: RLS canonical policy + cross-tenant test suite (CR-2)
2. **Day 2**: Envelope encryption module for `connections.access_token` (CR-3)
3. **Day 3**: Database role split (`app_tenant_user` / `app_admin_reader` / `app_admin_writer`) (CR-1)
4. **Day 4**: Webhook idempotency middleware + `webhook_deliveries` table (CR-9)
5. **Day 5**: OAuth state JWT + `oauth_state_consumed` table (CR-10)
6. **Day 6-7**: Aurora ACU 0.5–16 + private subnet + SG ingress matrix (CR-15, H10)
7. **Day 8**: IAM role catalog + Checkov gate (H12)
8. **Day 9**: Slug entropy bump (10-char base32) + signed redirect + edge rate limit (CR-4)
9. **Day 10**: WebAuthn enforcement on admin (CR-5)

Phase 1 picks up the AI safety items (CR-6, 11, 12, 13) since they ship with the AI features themselves.
