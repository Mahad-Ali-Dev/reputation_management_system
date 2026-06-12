# Bug Backlog

Living list of UX bugs, dead buttons, and rough edges found during the
post-deploy walk-through. Triaged by impact. Strike-through means fixed.

Last updated: 2026-06-11

---

## External assessment fixes — 2026-06-11 ✅

Source: third-party "Repulabs Functionality & Security Assessment" (June 2026,
13 bugs: 10 high / 2 medium / 1 low — `outputs/sas-report.txt`). All 13 fixed.
Typecheck clean; `next build` passes; 1054 tests pass (RLS suite still needs a
live DB); 13/13 verified end-to-end against a local production build
(`.pdf-build/verify-bugfixes.mjs`, screenshots in `outputs/bugfix-verify/`).

**Root-cause theme:** most "crash with digest" reports were server actions that
`throw` on expected failures (entitlement, validation, unmigrated tables) while
submitted from bare `<form action>` — production masks thrown messages and
takes down the whole page. Those actions now return typed `{ok|error}` results
rendered inline (`useActionState`).

- ✅ **001 (low)** 2FA/SSO dead toggles (`app/settings/security/page.tsx`) — fake `.tg` switch replaced with explicit "Coming soon" chip (2FA) and "Upgrade to Scale" link (SSO).
- ✅ **002 (high)** Google connect → raw `{"error":"establishmentId_required"}` (`app/api/connections/google/authorize/route.ts`) — param now optional for browser entry points (onboarding setup steps, `/connections` hub): single-location orgs auto-resolve their establishment; 0/2+ locations redirect to `/establishments?connect=google` with a picker banner. Misconfigured client id also redirects instead of raw JSON.
- ✅ **003 (high)** Autopilot toggle dead (`lib/autopilot/config-actions.ts`) — `toggleAutopilot`/`saveAutopilotConfig` return typed results (entitlement/role/migration mapped to clear messages — production masked the old thrown `AutopilotNotEntitledError`, so the UI showed nothing).
- ✅ **004 (high)** 5★ auto-reply toggle crashed page, digest 1899587870 (`lib/auto-reply/toggle.ts`) — TWO bugs: (a) throwing action + bare form → whole-page crash; now result-returning + inline error via `useActionState`. (b) the real thrower: `AUTO_REPLY_RANDOMIZED_SENTINEL = -1` violates `auto_reply_rules_delay_chk (0..1440)` → **new migration `20260611000000_auto_reply_delay_sentinel` (NOT yet applied — run `prisma migrate deploy`)**.
- ✅ **005 (med)** Establishment Settings tab inert (`app/establishments/[id]/page.tsx`) — was a bare `<button>`; now links to the new `app/establishments/[id]/settings/page.tsx` (edit name/category/timezone/address via `updateEstablishment` + danger zone).
- ✅ **006 (high)** Test AI chat always "Something went wrong" (`app/api/ai/kb-test/route.ts`, `lib/ai/chatbot.ts`) — root cause: retrieval hard-failed on missing `VOYAGE_API_KEY`/unmigrated embeddings, killing every turn. Retrieval is now fail-soft (answers via the honest fallback with zero chunks); route pre-flights `ANTHROPIC_API_KEY` (clear 503) and 401s cleanly on expired sessions. Verified live: with no Voyage key the chat answers.
- ✅ **007 (high)** Library upload "Couldn't save to library" (`lib/social/library.ts`) — `isMissingRelation` only matched raw PG codes (42P01/42703) but Prisma surfaces **P2021/P2022**, so the designed "storage not set up" fail-soft never fired (prod DB lacks the master migration). Fixed matcher (+ same fix in `lib/social/{publish,metrics,dispatch,connections,best-time}.ts`, `lib/auto-reply/managed-rule.ts`); audit write moved out of the asset transaction. **Prod still needs the master migration for uploads to land.**
- ✅ **008 (high)** Add-Contact inputs lose focus per keystroke (`app/contacts/_components/modal.tsx`) — Modal's mount effect depended on `[onClose]` (new closure every parent render) → re-ran `panelRef.focus()` on every keystroke. Effect now runs once; `onClose` tracked via ref. Also fixes the Bulk-Request dialog.
- ✅ **009 (high)** KB PDF upload crashed page, digest 1149675588 (`lib/ai/actions.ts`) — `uploadAiDocument`/`ingestAiDocumentFromUrl` return results; new client island `app/ai/_components/kb-add-forms.tsx` renders them + pre-checks file size; `serverActions.bodySizeLimit` raised 2mb→10mb so ≤8MB PDFs reach the action's friendly error instead of a framework 413 crash.
- ✅ **010 (high)** Server-Components error on /outreach send (`app/outreach/_components/send-tab.tsx`) — in-transaction `.catch(()=>[])` on the unmigrated `outreach_templates` read couldn't contain the failure (a failed query aborts the whole PG transaction, 25P02) so sibling queries died too. Templates read isolated in its own tenant transaction, fail-soft to `[]`. `createReviewRequest`/`resendReviewRequest` also converted to result contracts (TCPA/unsubscribed messages were masked in prod); history-tab resend now uses a client `ResendButton`.
- ✅ **011 (high)** Bulk CSV submit crashed page, digest 3852383719 (`lib/outreach/bulk-actions.ts`) — result contract + new `app/outreach/bulk/bulk-send-form.tsx` island; a phone number pasted under the Email channel now explains the mismatch inline.
- ✅ **012 (high)** /analytics client-side crash — current (rebuilt) page verified clean: 200, full render, zero uncaught client exceptions (crash was in the pre-redesign build). Hardened the one unvalidated DB-JSON cast (`pickFactors` in `app/analytics/page.tsx`) that could crash the score panel on malformed snapshots.
- ✅ **013 (med)** Monthly/Annual toggle stuck (`app/subscription/page.tsx`) — was static server markup with `is-active` hardcoded. New `BillingPeriodSection` client island + dual-variant Pro pricing ($89/mo annual ↔ $111/mo monthly).

**Deploy checklist for these fixes**
1. `prisma migrate deploy` against prod (founder-run): `20260611000000_auto_reply_delay_sentinel` + the pending master-delta migration (content library et al.).
2. Set `VOYAGE_API_KEY` (KB retrieval quality) — chat degrades gracefully without it but can't cite documents.
3. ~~Observed (not in report): marketing home prices Pro at **$59.99/mo** vs `/subscription`'s **$89/mo**~~ — RESOLVED 2026-06-12: founder set the price to **A$79/mo (AUD)**; marketing, /subscription, settings overview, admin MRR, and the AI assistant's product knowledge all updated. ⚠️ The Stripe Price behind `STRIPE_PRO_PRICE_ID` must be (re)created as **A$79.00 AUD monthly recurring** — the UI now states A$79 AUD, so a stale USD price would mischarge.

---

## Bugs / vulns / UI pass — 2026-06-10 ✅

Triggered by a 3-domain audit (security / runtime bugs / UI consistency) over the
post-2026-06-04 code (new social OAuth, auth/billing/email/QR branch). All fixes
typecheck-clean; 1051 tests pass (+9 new SSRF tests); key surfaces runtime-verified.

**Critical / high bugs**
- ✅ **Google sign-up broken on `/signup`** (`app/signup/page.tsx`) — still used the broken `next-auth/react` client `signIn("google")` (bakes wrong base URL into the bundle) that `/login` was already converted away from. Now routes through the `googleSignIn` server action like login. Blocked the primary OAuth sign-up path.
- ✅ **Admin Revenue always $0** (`app/admin/mrr/page.tsx`) — `PLAN_MRR_USD` keyed by `pro_monthly`/`pro_annual`, but `Subscription.plan` stores the Stripe **price id** (`lib/billing/sync.ts`). Now keyed off `STRIPE_PRO_PRICE_ID` (single-tier Pro) with a `price_*` fallback + friendly `planLabel`.
- ✅ **All local-dev hydration broken by CSP** (`middleware.ts`) — the middleware CSP omitted `'unsafe-eval'`; browsers enforce the intersection of it and the `next.config.mjs` CSP, so eval was blocked and the Next dev runtime couldn't hydrate ANY client component (command palette, drawers, etc. all dead in dev). Now allows `'unsafe-eval'` in **development only**; production CSP unchanged (still strict).
- ✅ **Dashboard "Composite rating −100%"** (`app/dashboard/page.tsx`) — the composite-rating KPI chip showed `reviews7dDeltaPct` (a review-**volume** delta), reading as if the rating cratered. Moved the volume delta to the "Reviews · 7d" card (labeled "vs prior"); composite rating now shows its sample size ("N reviews").

**Vulnerability**
- ✅ **Blind SSRF via outbound webhook URL** (`lib/notifications/webhook.ts`, set in `lib/account/actions.ts` `saveWebhook`) — the tenant-set webhook URL was fetched with no host validation (cloud metadata / loopback / internal reachable) and followed redirects. Extracted the proven crawler guard into shared **`lib/net/ssrf.ts`** (scheme + credentials + private-IP-after-DNS + DNS-rebind pinning); dispatch now vets the host, refuses redirects (`redirect:"manual"`), and `saveWebhook` rejects internal targets up front. Tests: `tests/net/ssrf.test.ts` (9).
  - Residual (LOW, deferred): the webhook signing secret is still stored plaintext in `settings.api.webhookSecret` (needs a migration/format-detection to envelope-encrypt; DB-read-only blast radius).

**UI polish / completeness**
- ✅ **Brand 404 / 500 pages** — added `app/not-found.tsx`, `app/error.tsx`, `app/global-error.tsx` (shared `components/error-screen.tsx`) using the existing `not-found.svg`/`error.svg` illustrations + Sentry capture. Replaces Next's raw defaults.
- ✅ **Real ⌘K command palette** (`components/command-palette.tsx`) — replaces the two formerly-decorative search affordances (topbar input + sidebar "Search… ⌘K") with a working keyboard-driven jump menu (20 destinations + actions, keyword synonyms, a11y listbox). Wired into `app-shell.tsx` + `sidebar-nav.tsx`.
- ✅ **Dead topbar "Help" button** (`components/topbar.tsx`) → links to `/docs`.
- ✅ **`/establishments` fake-disabled CTA** — removed the misleading `aria-disabled="true"` on a still-navigable link (kept the visual de-emphasis).
- ✅ **`/subscription` plan enum** (`app/subscription/page.tsx`) — reconciled the never-written `standard|pro|scale` cast to the real `org.plan` values (`pro|trial|free|past_due|suspended`); trial users now correctly read as on the Pro tier; "Manage billing"/cancel/auto-renew gated on an actual paid plan.

**Still open / recommended next (from the UI audit)**
- Time-range segmented filters (`.seg`) on `/dashboard`, `/hardware`, `/analytics` are still decorative — needs a `<RangeFilter>` + `?range=` data plumbing (4–6h).
- Three parallel component systems (shadcn `components/ui/*` vs `.btn`/`.ds-card` vs the orphaned `components/repulabs-ui/*`); consolidating onto one (lead with `/phone/*`) is the biggest remaining consistency lever.
- `loading.tsx` skeletons missing on ~12 high-traffic routes (primitives exist in `components/skeleton.tsx`).

---

## Security & correctness pass — 2026-06-04 ✅

5-domain parallel audit (tenant-isolation / API-auth / billing / server-actions / crypto-injection). Tenant-isolation audit found **no** cross-tenant IDOR or SQL injection. Fixed this session (all typecheck-clean; 153 tests pass, RLS suite needs a live DB):

- ✅ **Forgeable unsubscribe links** (`app/u/route.ts`) — was `!==` (timing) + hardcoded `"fallback-secret-do-not-use"`. Now `getHmacSecret()` + `timingSafeEqual`.
- ✅ **Twilio webhooks failed OPEN** (`lib/phone/twilio-verify.ts`, `app/api/webhooks/twilio/sms-status`) — accepted unsigned requests if `TWILIO_AUTH_TOKEN` unset + signed with internal host. Now fail-closed in prod (`isProductionRuntime()`) + forwarded host.
- ✅ **Refund double-spend** (`lib/admin/refunds.ts`) — no prior-refund subtraction. Now Stripe-sourced remaining-balance check + cumulative status + idempotency key.
- ✅ **Auto-reply safety bypass** (`lib/auto-reply/executor.ts`) — safety block was only logged; cron auto-published flagged replies. Now durable `auto_reply_blocked:` prefix the publish cron excludes.
- ✅ **OAuth state not org-bound** (`lib/oauth/state.ts` + 6 callbacks) — now asserts `claims.orgId === sessionOrgId`.
- ✅ **Admin login unthrottled** (`/api/admin/login`) — wired `login_attempt` limiter (per-email + per-IP).
- ✅ **Shopify HMAC skippable** — now mandatory + `timingSafeEqual`.
- ✅ **`saveConnection` org-blind lookup** — explicit `organizationId` filter (defense-in-depth).
- ✅ **SSRF in KB crawler** (`lib/ai/crawl.ts`) — followed redirects unvalidated; now manual redirect loop re-validating each hop. (Residual: DNS-rebinding via resolved-IP pinning still TODO.)
- ✅ **Missing audit rows** — `deleteContact`/`deleteFaq`/`deletePhoneNumber`/`deleteSocialPost` now audit-logged.
- ✅ **QR signature could brick activated stands** (`lib/hardware/actions.ts`) — `/r/[slug]` recomputes the HMAC expiry from `device.activatedAt`, but `refreshDeviceRedirect` re-signed with a fresh `Date.now()` (signature **never** verified → every scan dead-ended at `/not-activated?reason=signature`), and `activateDevice` + self-service gen + `updateDeviceRedirectUrl` used two separate clock reads (intermittent second-boundary failure). All four now sign over the exact `activatedAt` that's persisted. New regression test: `tests/hardware/activation-flow.test.ts` (10 tests) locks the full slug→code→sign→verify→redirect chain.

### Entitlement enforcement (new) — `lib/billing/entitlements.ts`
Canonical `PLAN` enum + `planAllowsPaidFeatures()` / `assertEntitled()` / `isOrgEntitled()`. Entitled = `pro` OR (`trial` && not expired); `past_due`/`suspended`/`free` blocked. **Gated so far:** outreach single + bulk send, AI assistant route (402), AI KB URL-ingest, auto-reply executor (skips). **Not yet gated (follow-up):** customer-facing chatbot/widget, phone outbound campaigns, AI reply-generate on the reviews page, social AI caption. The `/subscription` display page still casts to a `standard|scale` enum that's never written — cosmetic reconcile pending.

### Intra-tenant RBAC (new) — `lib/auth/rbac.ts`
`roleAtLeast()` + `requireRole(min)` (owner>admin>manager>member>viewer). **Applied:** team invite/remove (admin; owner required to grant/remove owner+admin), account + security settings (admin), billing checkout/portal routes (admin), destructive deletes contact/faq/phone/social (admin). **Not yet applied (follow-up):** establishment delete, device retire/delete, provider/connection management, content-create actions → `manager+` (reviews reply, surveys, social posts, faqs upsert, auto-reply rules, templates). RLS still enforces org isolation regardless.

---

## P0 — Blocks user from completing a real task

### ~~Magic-link email looks generic / unbranded~~ ✅ FIXED 2026-05-17
- New template at `lib/email/templates.ts` with proper branded layout
- Hidden preheader, gradient logo mark, brand color tokens, plain-text fallback
- Resend subject changed to "Your sign-in link for Repulabs"

### ~~Logo in marketing TopNav / Footer looked tiny next to wordmark~~ ✅ FIXED 2026-05-17
- `<Logo>` component rebuilt with calibrated wordmark sizing (`size * 0.62`)
- Default size bumped 32 → 36; tightened gap to read as a single logotype
- Marketing top-nav + footer now use the shared component instead of inline `<Image>`

### ~~Dashboard "New request" / "Export" buttons did nothing~~ ✅ FIXED 2026-05-17
- "New request" now `<Link href="/outreach/send">`
- "Export" hidden until export API ships
- Time-range seg (24h/7d/30d/12mo) marked `aria-disabled` — still decorative,
  needs real per-range data loaders (P1)

---

## P1 — Functional gap: button or feature visible but inert

### Time-range segmented controls don't filter
- **Locations:** `/dashboard`, `/hardware`, `/analytics`, probably others
- **What it looks like:** `[ 24h | 7d (active) | 30d | 12mo ]` — clicking does nothing
- **Fix:** wire each tab to a query param (e.g. `?range=30d`), re-query data scoped to that window
- **Effort:** 4–6h to do across the app cleanly (extract a `<RangeFilter>` server component)

### Reviews / Surveys / Phone — many buttons inside `<button type="button">` are stubs
- **17 page files** still contain decorative `type="button"` elements
- **Files:** see grep below — `app/hardware/page.tsx`, `app/login/page.tsx`,
  `app/connections/page.tsx`, `app/support/analytics/page.tsx`,
  `app/establishments/[id]/page.tsx`, `app/dashboard/page.tsx`,
  `app/establishments/new/page.tsx`, `app/surveys/new/page.tsx`,
  `app/subscription/page.tsx`, `app/support/comments/page.tsx`,
  `app/ai/training/page.tsx`, `app/reviews/page.tsx`,
  `app/establishments/page.tsx`, `app/social/posts/form.tsx`,
  `app/outreach/send/form.tsx`, `app/s/[token]/form.tsx`
- **Fix approach:** triage each file — some buttons are real form-submit
  buttons (fine), some are filter/UI chips (fine), some are CTAs that need
  to be `<Link>` or have `onClick`
- **Effort:** 1 day per major surface

### Admin → Tenant detail: no "change plan" or "suspend" buttons
- **Location:** `/admin/tenants/[id]`
- **Currently shows:** Impersonate only
- **Missing:** change plan (trial → pro → suspended), force-cancel subscription, mark as deleted
- **Effort:** 4h (add 3 server actions in `lib/admin/tenants.ts`, render UI)

### Admin → Audit log: filters limited, no CSV export
- **Location:** `/admin/audit`
- **Currently:** filter by org/action/actor only
- **Missing:** date range, pagination, CSV download
- **Effort:** 3h

### `/api/devices/[id]/qr` has no PDF format
- **Status:** PNG/SVG download buttons fixed and work; PDF button removed
- **Fix path (when wanted):** add `pdf-lib` dep, write a template with logo + QR + business name
- **Effort:** 2h

---

## P2 — Polish / nice-to-have

### Empty states across the app feel like nothing happened
- When an org has zero reviews, zero campaigns, zero phone calls — pages
  render an empty table with no "here's what to do next" CTA
- **Fix:** add `<EmptyState>` component with illustration + primary CTA per
  page; ~30 minutes per page

### Loading states
- Most pages have no Suspense skeletons; on slow connections users see a
  blank flash while the server renders
- **Fix:** wrap async page bodies in `<Suspense fallback={<Skeleton />}>`
- **Effort:** 2h

### Toast notifications for server actions
- Server-action submits navigate / refresh silently — no "Saved!" feedback
- **Fix:** wire `react-hot-toast` (or shadcn `Sonner`) + emit toasts from
  client-component wrappers around forms
- **Effort:** 3h

### Error pages
- 404, 500 use Next defaults (ugly)
- **Fix:** add `app/not-found.tsx` and `app/error.tsx` with brand styling
- **Effort:** 1h

### Form validation feedback
- Many forms (outreach send, survey new, etc.) submit and either succeed or
  throw — no inline field-level errors
- **Fix:** use server-action return values + `useFormState` per form
- **Effort:** 1 day across all forms

---

## P3 — Email templates beyond magic-link

We have **one** branded email (magic-link) and templates scaffolded for two
more (team invite, review request). Need to actually wire them up + add:

- [ ] **Daily digest** — `lib/digest/actions.ts` builds the data; needs the email shell
- [ ] **Review notifications** (new 1-star review → instant alert)
- [ ] **Stripe receipt** (currently Stripe sends generic) — wrap with our brand
- [ ] **Survey campaign** — `lib/surveys/actions.ts` has the trigger, needs template
- [ ] **Subscription canceled** confirmation
- [ ] **Trial expiring** reminder (3 days before)

All can extend `lib/email/templates.ts` with the same `emailShell({ ... })`
helper. Each template is ~30 min once you know the data shape.

---

## P3 — Admin polish (not blocking but rough)

### Tenant detail page metadata header
- The `<code>slug</code> · plan PRO · trial ends 2026-05-18 · stripe cus_...`
  row is dense and hard to scan. The chips visually conflict with each other.
- **Fix:** redesign as a 4-card stats strip OR a more spaced inline meta row

### Audit log row formatting
- Mono-font everywhere makes it hard to differentiate columns at a glance
- Long action names (`device.self_service_created`) get cut off on narrow screens
- **Fix:** truncate long actions with tooltip, mix font weights

### Org list "Apply" button next to seg filter
- Looks like a primary action but only re-submits the filter
- **Fix:** auto-apply on segment click (drop the button)

---

## How to work through this

Each P0/P1 item is independently shippable. Recommended cadence:

1. **One session, one P1 item.** Fix it, ship it, verify in browser.
2. After a P0/P1 lands, run `pnpm preflight` locally before pushing.
3. For UX-heavy fixes (empty states, toast notifications), do them in
   batches of ~5 pages so the design language stays consistent.
4. Track progress by striking items in this doc — keeps shipping log-able.

---

## QR / hardware feature pass (2026-05-17)

### Shipped ✅

- **`/hardware/edit/[deviceId]`** — new page: edit redirect URL, view current QR, download PNG/SVG, soft-delete with confirmation
- **`updateDeviceRedirectUrl`** server action — validates URL, re-signs slug HMAC, audit-logs before/after, revalidates
- **`deleteDevice`** server action — soft-delete (status=deleted + clear redirectUrl), audit-logged
- **QR card buttons** (Get QR / Analytics / Edit / Delete) — all four now have working handlers
- **`?selected=<deviceId>`** query param — focuses the QR + analytics panels on a specific device
- **`#qr-panel`** anchor — scrolls to the panel when clicking Get QR
- **`/activate`** flow — now accepts an **optional pasted Google review URL** as step 3; precedence: pasted > Place ID > Google search fallback
- **Audit log** records `redirectSource` so admins can see how each device was configured (pasted_url / place_id / search_fallback)

### Future: Google Places autocomplete (Phase 2)

Currently users either pick an existing establishment (and rely on its `googlePlaceId`) or paste their Google review URL. A nicer UX is type-ahead search of Google Maps for the business:

- **API to enable:** Google Places API → enable in the same Cloud Console project as Auth/OAuth
- **Cost:** ~$17 per 1,000 sessions for Autocomplete (Place Details is separate)
- **UI:** `/activate` step 2 gets a `<Combobox>` that calls `places.autocomplete` on each keystroke
- **Selection writes:** `establishment.googlePlaceId` + auto-fills the review URL on step 3
- **Effort:** ~4-6 hours including client-side debouncing, error handling, and per-tenant rate limiting

This is a real upgrade but the current paste-URL flow covers the use case for v1.

---

## 4-Agent code audit findings (2026-05-17 second pass)

Parallel audit across pages / API routes / server actions / cross-cutting code quality.
Fixed items struck-through; backlog items grouped by severity.

### P0 — fixed this session ✅

- **`lib/outreach/actions.ts:129` createReviewRequest** — status branch was `data.scheduleHours > 0 ? "queued" : "queued"` (identical both branches). Now correctly returns `"scheduled"` for future and `"queued"` for immediate dispatch. Effect: scheduled review requests were silently treated like immediate ones; cron picked them up at the wrong time.
- **`app/support/analytics/page.tsx:138` Export button** — removed (no export API exists yet)
- **`app/reviews/page.tsx:63` Draft pending button** — now `<Link href="/reviews?reply=pending">`
- **`app/establishments/page.tsx:208` Filter button** — removed (no filter UI implemented)
- **`app/support/comments/page.tsx:74` Draft pending button** — now `<Link href="/support/comments?status=needs_reply">`
- **`lib/hardware/provision.ts:62`** — `https://Repulabs.io/activate-needed` placeholder replaced with `${NEXT_PUBLIC_APP_URL}/not-activated`
- **`app/not-activated/page.tsx:26`** — hardcoded "Repulabs.io" text → "Repulabs workspace" with correct nav path

### ~~P0 — updateSecurityPrefs silent failure~~ ✅ FIXED 2026-06-04

- **`lib/account/actions.ts` updateSecurityPrefs** — ⚠️ **silent failure**: wrote an audit log but never persisted the security preferences anywhere (and the v2 account-page redesign had also left the action orphaned — the Security card was static `ToggleRowDisplay` placeholders with no form).
  - ✅ Added `settings Json? @map("settings")` to the `Organization` model
  - ✅ New migration `20260604120000_org_settings` — `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS settings jsonb;`
  - ✅ `updateSecurityPrefs` now does a read-merge-write into `settings.security` inside the tenant txn (RLS-scoped), so independent setting groups never clobber each other
  - ✅ Wired a real session-timeout form into the Security section, repopulated from saved prefs, honestly labeled that enforcement ships with the Phase 0 session-policy update
  - **Note:** enforcement of `sessionTimeoutMinutes` is still deferred to Phase 0 (Auth.js session-policy); this fix makes the preference persist durably rather than vanish. 2FA/SSO remain coming-soon display rows (no fake-persist of unenforced toggles).
  - **Deploy:** needs `pnpm db:migrate:deploy` on the VPS to apply the new migration.

### P1 — Missing audit logs (compliance gap)

- **`lib/contacts/actions.ts:85-92` deleteContact** — Contact deletion writes no audit row.
- **`lib/faqs/actions.ts:70-78` deleteFaq** — FAQ deletion writes no audit row.
- **`lib/phone/actions.ts:130-140` deletePhoneNumber** — Phone number release writes no audit row.

Each is a ~5-line fix: add `tx.auditLog.create({ ... })` before the delete, capture `beforeData` from the row. Use `device.self_service_created` style action naming.

### P1 — Admin login rate limit (brute-force risk)

- **`app/api/admin/login/route.ts`** — no `checkRateLimit("login_attempt", email)` call. Already-defined limiter (10 attempts / 5 min per email) just needs wiring.
- **Effort:** 15 minutes, ~5 lines.

### P1 — Hardware page device card buttons inert

- **`app/hardware/page.tsx:686-704`** — "Get QR", "Analytics", "Edit", "Delete" on each device card are decorative.
  - Get QR: should scroll to / open the same DeviceQrPanel
  - Analytics: link to a per-device analytics page (doesn't exist yet — needs route)
  - Edit: open a server-action form to rename / re-assign establishment
  - Delete: confirm dialog + server action to soft-delete + revoke slug
- **Effort:** 4-6h for all four properly (one new route + 2 server actions).

### Confirmed clean (no issues found by audit)

- All cron routes verify `CRON_SECRET` before doing work
- Stripe + Twilio webhook routes verify HMAC signatures with raw body
- All AI routes use `checkRateLimit()`
- All Prisma queries use real schema field names (`postedAt`, `respondedAt`, etc.)
- No `@ts-ignore` / `@ts-nocheck` / `as any` masking type errors in production code
- No missing `await` on critical async paths
- All authenticated API routes correctly call `auth()` and check session
- No imports of non-existent functions

---

## Confirmed working (audited 2026-05-17)

- ✅ `/api/health` returns ok with all 4 deps connected
- ✅ HTTPS + auto-renewal
- ✅ Admin login + impersonation
- ✅ QR code PNG/SVG download
- ✅ All admin server actions wired (upsertFeatureFlag, deleteFeatureFlag,
     saveProviderApp, disableProviderApp, refundHardwareOrder, markShipped)
- ✅ Magic-link sign-in (Resend delivery)
