# Build Pass V7 — Bug Fix Report

Date: 2026-05-14
Pass type: Multi-lens audit (fullstack + backend + architect + secops + qa)
TypeScript: `npx tsc --noEmit` → clean
Prisma client: regenerated against new `digest_runs` model

This pass focused on correctness, security, and tenant isolation. Frontend
design polish is intentionally deferred to a separate session.

---

## CRITICAL (6 fixed)

### 1. Twilio webhook signature verification

Voice routes (`/api/voice/incoming|respond|status|outbound`) and
`/api/webhooks/twilio/sms-status` were accepting unsigned POSTs in production
unless `NODE_ENV === "production"`. A leaked webhook URL could be replayed by
anyone.

Fix: new `lib/phone/twilio-verify.ts` parses the form body, recomputes
`HMAC-SHA1(URL + sorted-form-params)` with `TWILIO_AUTH_TOKEN`, and fails closed
whenever the env var is configured. Each route now early-returns 403 when the
signature is absent or wrong, regardless of `NODE_ENV`.

### 2. Coupon double-redeem race

`lib/surveys/coupons.ts` used `prisma.surveyCoupon.update()` after a
non-atomic `redeemedAt` null-check. Two POS terminals scanning the same code
within the same millisecond could both pass the null-check and both succeed.

Fix: race-safe conditional UPDATE via `updateMany({ where: { id, redeemedAt: null }})`
returning a `count`. Loser of the race sees `count === 0` and returns
`already_redeemed`. Also wrapped the whole flow in `withTenant`.

### 3. Outbound phone dispatch race

`/api/cron/dispatch-outbound` claimed targets via plain `update({ status:
"calling" })`. Two concurrent cron invocations could both claim the same row.

Fix: changed to `updateMany({ where: { id, status: "queued" }, data: ... })`.
Loser of the race gets `count === 0` and `continue`s to the next target.

### 4. Fail-closed secrets in production

`AUTH_SECRET` was falling back to `"fallback-secret-do-not-use"` in
`lib/outreach/actions.ts` and `"dev-secret"` in `lib/digest/actions.ts`. Both
were used to HMAC-sign unsubscribe tokens — an attacker who guessed the
fallback string could forge `t=...&s=...` links and unsubscribe arbitrary
addresses.

Similarly, four cron routes accepted requests with no `CRON_SECRET` set rather
than refusing them.

Fix: new `lib/secrets.ts` with `getHmacSecret()`, `getUnsubscribeSecret()`,
`getCronSecret()`, and `verifyCronRequest()`. All four throw in production
(`NODE_ENV=production` OR `VERCEL_ENV ∈ {production, preview}`) when the env
var is missing. Dev keeps a localhost-only fallback that prints one warning.
Applied across `lib/outreach/actions.ts`, `lib/digest/actions.ts`,
`/api/cron/dispatch-outbound`, `/api/cron/daily-digest`,
`/api/cron/extract-topics`, and `/api/cron/sync-reviews`.

### 5. Direct prisma calls bypassing RLS

A multi-file sweep found tenant-scoped tables being written via the global
`prisma` client instead of `withTenant()`, which leaves the queries running
under the BYPASSRLS owner role. With RLS as the primary tenant fence, this is
the difference between "rejected by Postgres" and "silently accepted."

Files fixed:

- `lib/account/actions.ts` — `organization.update` + `auditLog.create` now share one `withTenant` transaction
- `lib/onboarding/actions.ts` — also fixed a latent bug where `advanceOnboardingTo` claimed to take the max but actually used `{ set }`; replaced with `GREATEST(...)` in raw SQL inside `withTenant`
- `lib/surveys/coupons.ts` — `issueCouponForResponse` + `redeemCoupon`
- `lib/notifications/actions.ts` — `markNotificationRead` now also filters by `userId`
- `lib/hardware/actions.ts` — `organization`, `hardwareOrder`, and device activation. Activation now uses race-safe `updateMany({ where: { id, status: "unactivated", organizationId: null }})`.
- `lib/outreach/actions.ts` — `dispatchReviewRequest` takes `orgId` and runs all `reviewRequest` reads + status updates inside `withTenant`
- `lib/outreach/suppression.ts` — all four functions (`isUnsubscribed`, `recordUnsubscribe`, `hasSmsConsent`, `recordSmsConsent`)
- `lib/outreach/bulk.ts` — `previewBulkRecipients` folds the unsubscribe lookup + recent-contact lookup into one tenant transaction
- `lib/outreach/ai-generate.ts` — `organization.findUnique` lookup
- `lib/surveys/actions.ts` — response insert + token consume now race-safe via `updateMany({ where: { tokenHash, consumedAt: null }})` and emit `token_already_used` on race-loss
- `lib/uploads/actions.ts` — audit log
- `lib/billing/actions.ts` — checkout + portal session
- `app/api/ai/chatbot/converse/route.ts` — visitor sliding-window count

Direct `prisma.` calls that remain are intentional and commented (global
catalogs, public token lookups by hash, cron-discovery queries).

### 6. CRON_SECRET fail-closed across all 4 cron routes

(rolled into #4 above)

---

## HIGH (5 fixed)

### 7. `markNotificationRead` per-user filter

Any member of an org could clear another member's bell. Added
`OR: [{ userId }, { userId: null }]` (the null clause preserves org-wide
broadcasts).

### 8. OAuth callback `establishmentId` ownership

`/api/connections/google/callback` read `establishmentId` from a cookie the
user controls. Even though RLS scopes the new `connections` row, Postgres FK
checks run as the table owner and can see all establishments — so the FK alone
wouldn't block linking to a foreign org's establishment.

Fix: validated UUID shape + verified ownership inside `withTenant` before
proceeding with the token exchange.

### 9. Stripe webhook atomic subscription + org update

The webhook ran `subscription.upsert(...)` and `organization.update(...)` as
two separate statements. A failure between them left the org plan
out-of-sync with the subscription row.

Fix: both writes are inside a single `prisma.$transaction`. The stale-event
ordering check also moved inside the transaction so a sibling webhook firing
the same instant can't race-clobber.

### 10. Stripe `past_due` handling

Both `invoice.payment_succeeded` and `invoice.payment_failed` were TODO
no-ops. New `handleInvoicePaymentResult()` flips the org's plan to `past_due`
on failure and back to `pro` on success.

Also extended the `organizations_plan_chk` CHECK constraint to allow
`past_due` (migration `20260515120000_v7_fixes`).

### 11. Daily-digest idempotency

New `digest_runs` table with `UNIQUE (organization_id, day)` claim-or-fail
semantics. A duplicate cron firing (QStash retry, Vercel dual-region) can't
re-send. Tracked in `started_at` / `completed_at` / `recipients_sent` /
`error_summary` for ops visibility.

### 12. Non-null assertion crashes

- `app/r/[slug]/route.ts` used `device.activatedAt!` — a corrupted "active"
  row without an activation timestamp would crash. Now treated as inactive.
- `lib/digest/actions.ts` used `m.user!.email!` after a non-asserting filter.
  Replaced with a `flatMap` that narrows the type via the return path.

---

## MEDIUM (7 fixed)

### 13. Missing indexes

Migration `20260515120000_v7_fixes` adds:
- `idx_phone_campaign_targets_org (organization_id, status, scheduled_for DESC)` — the campaigns dashboard was seq-scanning
- `idx_phone_bookings_call (call_id) WHERE call_id IS NOT NULL` — post-call summary path
- `idx_social_comments_assigned (organization_id, assigned_to, status) WHERE assigned_to IS NOT NULL` — "assigned to me" filter

### 14. Reflective CORS on chatbot widget

`/api/ai/chatbot/converse` was setting `Access-Control-Allow-Origin: <Origin>`
for **any** origin. Tightened to only reflect origins that match the widget's
`originAllowlist`. OPTIONS preflight still reflects (browsers strip the auth
header from preflights, so we can't authenticate there; the subsequent POST
is still gated by JWT + origin check).

### 15. SVG removed from logo upload allowlist

SVG is XML and can embed `<script>` + JS event handlers. When served from the
Blob CDN, it executes with the user's session if opened in a new tab. Removed
from `org_logo`, `email_template_logo`, `survey_template_logo`. Customers
needing vector crispness should export a high-DPI PNG.

### 16. ElevenLabs + Twilio API timeouts

Outbound HTTP calls to ElevenLabs (`cloneVoice`, `synthesizeAndCache`,
`listVoices`, `deleteVoice`) and Twilio (`placeOutboundCall`, `endCall`,
`sendSms`) had no `AbortController` timeout. A hung TLS handshake could pin
the serverless function open until Vercel's 300-second cap.

Fix: `fetchWithTimeout` wrapper, 15-20s default depending on endpoint.

### 17. Admin flag role check

`upsertFeatureFlag` / `deleteFeatureFlag` accepted any admin role. Flags ship
code paths — should be `super_admin` or `engineering` only. Added role gate
throwing `forbidden` for `support` / `finance` roles.

### 18. N+1 inserts replaced with `createMany`

- `lib/phone/campaign-actions.ts` — campaign targets (could be 5,000 rows)
- `lib/contacts/actions.ts` — CSV contact import
- `lib/outreach/bulk-actions.ts` — bulk review-request CSV send

Three places that previously did `for (const r of rows) await tx.X.create(...)`
are now single `createMany` round-trips.

### 19. RLS-aware tenant-bound advance step

`advanceOnboardingTo(step)` documentation claimed "take the max so we never
go backwards" but the code did `{ set: step }`. Switched to a single
`UPDATE ... SET step = GREATEST(COALESCE(step, 0), $1)` raw SQL inside
`withTenant` — no read-then-write race window, semantics match the docstring.

---

## Verification

- `npx prisma generate` — succeeded (DigestRun + plan-constraint changes picked up)
- `npx tsc --noEmit` — 0 errors

---

## Migration to apply on next deploy

```
prisma/migrations/20260515120000_v7_fixes/migration.sql
```

Contains:
- `organizations_plan_chk` constraint update (adds `past_due`)
- 3 new indexes (`phone_campaign_targets`, `phone_bookings`, `social_comments`)
- New `digest_runs` table

Schema changes in `prisma/schema.prisma`:
- New `DigestRun` model

---

## Out of scope (intentionally deferred)

- Frontend design polish — running in a separate session per founder request
- WebAuthn / TOTP for admin sessions — Day-15 work per SECURITY_AND_OPS_REVIEW
- Sharding daily digest by establishment timezone — V8 candidate
- Real-time TTS streaming over Twilio Media Streams — V8 candidate
