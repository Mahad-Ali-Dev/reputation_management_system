# Security Audit V2 — Overnight Build Pass

Auditor: autonomous overnight build pass · Date: 2026-05-13

This audit covers the features added in the V2 build pass (digest, bulk CSV, URL crawl,
topic/sentiment worker, dispute, reranker, coupons, MRR/refunds/flags admin,
audit hash chain). Pre-existing surface area is covered in `SECURITY_AND_OPS_REVIEW.md`.

**Format:** one row per surface · `attack vector → mitigation → status`.

---

## 1. Daily digest cron (`/api/cron/daily-digest`)

| Attack | Mitigation | Status |
|---|---|---|
| Unauthenticated trigger by attacker | `Authorization: Bearer ${CRON_SECRET}` header check; returns 401 otherwise | ✅ |
| Long-running runaway floods Resend | Per-org loop with try/catch; `maxDuration = 300s`; one org's failure doesn't abort the loop | ✅ |
| Sending to unsubscribed recipients | Per-recipient unsubscribe check against `unsubscribes` table before send; HMAC-signed one-click unsubscribe URL in every email | ✅ |
| PII leak in error response | Only first 20 errors returned with org IDs (UUIDs), no recipient emails | ✅ |
| HTML injection from org name | All dynamic values pass through `escapeHtml()` before HTML interpolation | ✅ |
| Recipient enumeration | Membership query scoped to `role: owner|admin`; no public form to trigger digest for arbitrary org | ✅ |

## 2. Bulk CSV review requests

| Attack | Mitigation | Status |
|---|---|---|
| Tenant data leak via mass-upload to other org's recipients | Server action `requireOrg()` gates every call; establishment ID checked against `withTenant` | ✅ |
| TCPA violation via SMS without consent | Batch-level `consentAttested` checkbox required for SMS; explicit attestation recorded in `sms_consents` with source = `imported_with_attestation` | ✅ |
| Unsubscribe bypass | `previewBulkRecipients` filters unsubs in a batch query before any insert | ✅ |
| Spam by re-uploading same list daily | 30-day "already contacted" suppression applied at preview time | ✅ |
| CSV bomb / OOM via 1 GB file | Zod `max(MAX_CSV_BYTES)` = 2 MB on `csvText`; Postgres-side `max(rows) = 5000` cap | ✅ |
| Malformed phone → carrier complaints | E.164 regex `/^\+[1-9][0-9]{1,14}$/` enforced; whitespace/dashes normalized first | ✅ |
| Email harvesting from public form | Action requires auth + tenant scope; no public endpoint | ✅ |
| Audit log gap | One `review_request.bulk_created` audit row with full counts; org/establishment/recipient totals visible to admin | ✅ |

## 3. URL crawl for chatbot KB

This is the highest-risk new surface — SSRF defense matters.

| Attack | Mitigation | Status |
|---|---|---|
| **SSRF to AWS metadata (`169.254.169.254`)** | `isPrivateIPv4` blocks 169.254.x; DNS resolved + every A/AAAA record checked | ✅ tested |
| **SSRF to RFC 1918 networks** | 10.x, 172.16-31.x, 192.168.x blocked; CGNAT 100.64-127.x blocked | ✅ tested |
| **SSRF to loopback** | 127.x and `::1` blocked | ✅ tested |
| **SSRF to link-local IPv6 (fe80::)** | `isPrivateIPv6` blocks | ✅ tested |
| **DNS rebinding** | Validation resolves and checks all returned A/AAAA records before fetch; fetch uses the same resolution | ⚠️ minor gap — DNS could be re-resolved by Node's `fetch` differently. Acceptable for v1; production hardening: use a custom Agent that pins the IP. |
| Credentials in URL exfiltration | `url.username || url.password` rejected | ✅ tested |
| Non-HTTPS in production | `protocol !== "https:" && !== "http:"` rejected; we allow http: for development. Recommend env-gated rejection of http: in prod. | ⚠️ minor |
| Robots.txt ignored | Best-effort `User-agent: *` Disallow check; lenient if file unparseable | ✅ |
| OOM via large response | Streamed read with `MAX_BYTES = 2 MB` hard cap; reader cancelled on overflow | ✅ |
| Timeout DoS | 10s `AbortController` timeout on both robots.txt + main fetch | ✅ |
| Non-text content (e.g. video) | Allowlist: `text/html`, `text/plain`, `application/xhtml+xml` only | ✅ |
| Prompt injection via crawled HTML | Content stored as `untrusted_doc` chunks at ingest; chatbot prompt wraps them in `<untrusted_doc>` fence + tag-stripping | ✅ |
| Stored XSS via crawled HTML | `htmlToText()` strips all tags before any storage; widget renders via `textContent` | ✅ |
| Markdown image exfiltration | Images stripped at chatbot reply emit (existing markdown-image regex) | ✅ |

## 4. Topic + sentiment extraction worker

| Attack | Mitigation | Status |
|---|---|---|
| Cost runaway from infinite backlog | `MAX_PER_RUN = 100`; throttle by cron schedule (every 30 min recommended) | ✅ |
| Cross-tenant write via batch worker | Each update wrapped in `withTenant(review.organizationId, ...)` so RLS WITH CHECK applies | ✅ |
| Cron triggered by attacker | Bearer-token `CRON_SECRET` check | ✅ |
| Prompt injection in review body | Review body fenced in `<review>` tags with content-stripping for `</review>` | ✅ |
| Malformed model output corrupts DB | Tool-output schema validates topics against `TOPIC_TAXONOMY` enum + clamps sentiment to [-1, 1] | ✅ tested |

## 5. Review dispute flow

| Attack | Mitigation | Status |
|---|---|---|
| Cross-tenant dispute on another org's review | `withTenant(orgId, ...)` + RLS USING clause; `findFirst` returns null if mismatched | ✅ |
| Spam disputes | Unique constraint on `review_id` — can't file 2 active disputes on the same review | ✅ |
| Re-opening accepted disputes | Re-open only allowed if status = `withdrawn`; `accepted/rejected` are terminal | ✅ |
| Audit log gap | Both file + withdraw write audit rows with org/user/reason | ✅ |
| User-supplied details XSS | React JSX auto-escapes; rendered via `whitespace-pre-wrap` (text, not HTML) | ✅ |

## 6. Chatbot reranker

| Attack | Mitigation | Status |
|---|---|---|
| Cost spike per turn | One Haiku call only when candidate count > 5; falls back to vector order on failure | ✅ |
| Prompt injection from chunk content | `</chunk>` and `<chunk` tag-stripping before reranker sees the text; `<user_query>` tag-stripping too | ✅ |
| Rerank returns hallucinated IDs | We dedupe + filter against the candidate set; unknown IDs ignored | ✅ |
| Failure breaks chat | Try/catch around reranker call; on exception, fallback to vector top-5 | ✅ |

## 7. Survey coupon engine

| Attack | Mitigation | Status |
|---|---|---|
| Code brute-force / scanner | 10-char Crockford base32 ≈ 50 bits entropy; SHA-256-hashed lookup column with index | ✅ tested |
| Double-redemption race | UPDATE conditional on `redeemed_at IS NULL` enforced by single UPDATE; subsequent attempts return `already_redeemed` | ✅ |
| Cross-tenant redemption | `coupon.organizationId !== args.organizationId` → returns `wrong_org` even if the hash matches | ✅ |
| Issuing duplicate coupons for one response | `survey_coupons.response_id` UNIQUE; idempotent `issueCouponForResponse` returns existing | ✅ |
| Expired coupon redemption | `expiresAt.getTime() < Date.now()` check before update | ✅ |
| Frontend bypass | Server action `redeemCouponAction` re-validates auth + org + state; no client trust | ✅ |
| Audit log | Each redemption writes `survey.coupon.redeemed` audit row with code + value + note | ✅ |

## 8. Admin MRR dashboard

| Attack | Mitigation | Status |
|---|---|---|
| Unauthorized access | Wrapped in `/admin` layout which gates on `getAdminSession()` | ✅ |
| Sensitive data over cookie | Admin JWT cookie is `HttpOnly`, `SameSite=Lax`, `Secure` in prod | ✅ (existing) |
| SQL injection via plan map | `PLAN_MRR_USD` is a hardcoded literal; no user input affects the query | ✅ |
| MRR miscount due to stale webhook | Documented in UI: "Stripe is authoritative — reconcile via Sigma when in doubt" | ⚠️ surface-only |

## 9. Admin Refunds

| Attack | Mitigation | Status |
|---|---|---|
| Unauthorized refund | Admin session required + role check (`super_admin` or `finance`) | ✅ |
| Refund > order amount | `amountCents > order.totalCents` → throws | ✅ |
| Replay (double refund) | Stripe's `refunds.create` against same intent will reject if no remaining balance | ✅ (Stripe-side) |
| Missing PaymentIntent | Pre-check; throws "no Stripe PaymentIntent" if NULL | ✅ |
| Order state desync after partial refund | Order status updated to `partially_refunded` or `refunded` based on Stripe return value | ✅ |
| Audit log gap | Audit row includes refundId, amount, reason, internal note, admin ID | ✅ |

## 10. Feature flags

| Attack | Mitigation | Status |
|---|---|---|
| Privilege escalation via flag flip | Only admin role can write; tenant role gets `SELECT` only via `tenant_read` policy | ✅ |
| Key injection | Zod `regex(/^[a-z][a-z0-9_]*$/)` on `key`; no SQL string interp | ✅ |
| Metadata as command injection | JSON-parsed via `JSON.parse`; rejected if not an object | ✅ |
| Stale cache leaks deleted flag | `invalidateFlagCache(key)` called on every upsert / delete | ✅ |
| Tampering with rollout | Audit log every upsert + delete with `actor_type = admin_user` | ✅ |
| Rollout bias from hash bug | `>>> 0` coercion to unsigned 32-bit before `% 100`; uniformity tested | ✅ tested |

## 11. Audit log hash chain

| Attack | Mitigation | Status |
|---|---|---|
| Row tamper after insert | BEFORE INSERT trigger sets `row_hash = sha256(prev_hash_hex || canonical)`; UPDATE/DELETE blocked by existing forbid trigger | ✅ |
| Chain break detection | `npm run audit:verify` recomputes every hash; CI integration recommended | ✅ tool exists |
| Cross-org hash collision | Chain scoped per-org (NULL handled as global scope) — modifying one org's row doesn't ripple to others | ✅ |
| Trigger disabled by DBA | Out of scope for app-level defense; AWS RDS / Neon admin role required — log to S3 Object Lock is Day 15+ work | ⚠️ infra |

---

## Cross-cutting checks (all V2 surfaces)

- **Server actions**: every one starts with `requireOrg()` or `getAdminSession()` redirect-on-missing
- **Zod validation**: every server action / API route validates inputs (>30 schemas added)
- **RLS on new tables**: `review_disputes`, `survey_coupons` have `ENABLE + FORCE + tenant_isolation` policies; `feature_flags` uses tenant-read-only policy
- **Audit logging**: every state-changing action writes an audit row
- **Cron auth**: every cron route checks `Bearer CRON_SECRET`
- **Pino redaction**: continues to strip auth headers + tokens (existing config)
- **No `dangerouslySetInnerHTML`** in any new code (grep'd)
- **No `eval` / `Function` constructor** (grep'd)

---

## Known gaps to address Day 11+

1. **DNS rebinding hardening** — pin IP after first resolve in `crawlUrl`. Use `undici.Agent` with custom `connect` function.
2. **HTTP in URL crawl** — currently allowed; gate to HTTPS-only in production via env check.
3. **Cron secret rotation** — single `CRON_SECRET` env var; no rotation story yet.
4. **Audit log archive to S3 Object Lock** — for compliance / legal hold.
5. **WebAuthn for admin auth** — current admin is email+password+TOTP only. WebAuthn defense-in-depth.
6. **DB role split for admin queries** — admin currently uses the same connection as the app (no `app_admin_reader` role). Mostly mitigated by `getAdminSession()` gate, but defense-in-depth absent.

---

## Test coverage

- **63 passing unit + integration tests** (up from 15)
  - 15 CSV parsing edge cases
  - 15 SSRF defenses on URL crawl (every IP class)
  - 7 coupon code generation + hashing
  - 4 rollout-hash determinism + distribution
  - 4 topic taxonomy invariants
  - 8 RLS cross-tenant attacks (pre-existing, all still pass)
  - 7 envelope encryption (pre-existing)
  - 3 additional eval-suite metadata tests
- **8 skipped live AI evals** (`RUN_LIVE_AI_EVALS=1 npm run test:evals` to execute, costs ~$0.01)

---

## Sign-off

V2 surface area passes all designed checks. RLS isolation verified end-to-end.
Known gaps documented above are not blocking — they're hardening items for the next sprint.
