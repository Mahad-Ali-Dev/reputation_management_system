# Autonomous completion run — progress log

Branch: `fix/auth-billing-email-qr-redesign`
Mandate (user, before leaving): complete the product — fix all bugs, find broken
links/sections/tabs, best coding practices, security hardening (all attack classes),
UI changes where needed, and ReviewBoost feature parity per the `tasks/` specs.
"Don't stop until I'm back."

## Operating rules I'm following
1. **Every commit is gated on `next build` passing** (not just `tsc` — `tsc` missed
   the `"use server"` export rule and the RSC boundary crashes; `next build` catches them).
2. Work in small, verified batches; commit green progress frequently so nothing is lost.
3. Read-only discovery first, then targeted fixes; never break the running build.
4. Prioritize: build/runtime bugs → security/tenant-isolation → broken links/tabs →
   feature parity (ReviewBoost + tasks specs) → UI polish.

## Status — RUN COMPLETE (paused for your direction)
12 commits on `fix/auth-billing-email-qr-redesign`, each verified `tsc` + `next build` + full
test suite green. Tests 918 → 995. Heavy autonomous spawning stopped here: the high-value,
verifiable work is done; remaining items are credential-dependent or low-priority (below).

### Commits this run
705248a bugs/links/RBAC/security · 3500245 invite+meeting-requests · 1191a0c CRM adapters ·
8a827ac WhatsApp channel · 8ee1011 Gmail 2-way · c9f65b8 MIME header-injection fix ·
16ef860 QA links+a11y · cfd0872 functional dead-ends · 78326b0 WhatsApp connect + honest status

### NEW migrations to apply in prod (`prisma migrate deploy` applies all pending)
- 20260609000000_meeting_requests
- 20260609010000_gmail_sync
- 20260609020000_connections_provider_whatsapp  (ALSO fixes a latent gmail CHECK-constraint
  blocker — without it the Gmail connect would 23514 in prod)

### Remaining (intentionally left for your call)
- Facebook ad/promoted-post comment moderation (Meta Ads API — needs an approved app).
- WhatsApp embedded-signup OAuth (connect today is a manager paste-form for phone_number_id +
  token, which works; OAuth needs Meta App Review).
- `scheduled_request` scheduler stub (module 07 — confirm nothing relies on it).
- UI redesign visual review (compiles + token-driven, never eyeballed — run screenshot tooling).
- New integrations (CRM/WhatsApp/Gmail) are code-complete + unit-tested but need each provider's
  app credentials configured before they go live.

## Discovery results (7-agent sweep)
**Build baseline: GREEN locally** — `tsc` 0 errors, `pnpm build` 45/45 pages, 918 tests pass
(only failure is the RLS suite needing a live DB — env, not code).

Triaged findings → fix batches:
- **CRITICAL runtime bug:** `app/reviews/page.tsx:430` — inline `onClick` in a Server
  Component (crashes /reviews for reviews with a platform deep-link). [Batch 1]
- **Broken links/tabs (4):** onboarding `google_business authorize` 404; `/phone/calls`
  index missing; docs `/docs/quickstart` 404; widget inbox tab key `livechat`→`live-chat`. [Batch 1]
- **RBAC gaps (high):** `lib/{reviews,outreach,establishments,auto-reply,ai,surveys,hardware}/
  actions.ts` use a local auth-only `requireOrg()` — viewers/members can publish replies,
  send paid SMS/email, delete locations. Swap to `requireRole()`. [Batch 1]
- **Security hardening:** SSRF DNS-rebind in `lib/ai/crawl.ts`; dead-code SQLi in
  `components/reviews-live-feed.tsx`; email-attr injection in `lib/outreach/dispatch.ts`;
  inbox assignee not membership-checked. [Batch 1]
- **Invite flow incomplete:** invites created but no `/accept-invite` handler. [Batch 2]
- **ReviewBoost parity gaps:** WhatsApp Business channel, Gmail/Yahoo 2-way mailbox sync,
  CRM adapters (Salesforce/Zoho/Wix/WooCommerce are `ready:false` stubs), Facebook ad-comment
  moderation, chat-widget meeting-request queue. [Batches 3+]
- **Tenant isolation:** strong, no cross-tenant IDOR found. ✅
- **Ops note:** `vercel.json` has 20 crons but deploy is VPS — confirm the VPS scheduler
  actually hits the cron endpoints, or digests/auto-reply/sync won't run.

## OVERNIGHT BUILD v2 (Google-grade UI + agentic onboarding + integrations)
Mandate: Google-product-quality UI (app + marketing), Material-3 design system, fully agentic
onboarding (business name + website → agent builds the dashboard), improve modules (AI KB etc.)
+ change layouts, add ALL missing integrations, continuous bug-fix. Skills: senior-fullstack,
senior-backend, senior-frontend. Build-gated, commit green, loop till user returns.
Plan: (1) design-system foundation → (2) app relayout → (3) marketing redesign →
(4) agentic onboarding → (5) module improvements → (6) integrations → (7) bug sweeps.

## Log
(Newest first — updated as batches land.)
- Wave 1 (overnight) launched: Google/M3 design-system foundation + architecture blueprint
  (agentic onboarding + module layouts + integration gaps) + deep bug audit. Build-gated.
- DEPLOY DONE by user: prod live (HTTP 200), all 25 migrations applied (schema up to date),
  all 13 commits running. Permission tug-of-war resolved (stale .prisma client + chown).
- WhatsApp connect flow + honest status page launched (build-gated). Final substantive wave.
- **Functional dead-end fixes COMMITTED + pushed** (`cfd0872`) — verified green. autopilot/
  connections deep-links fixed; geo-post now creates a real reviewable Social DRAFT instead of
  faking "scheduled" into a no-op queue; low-NPS internal alert now actually notifies (in-app +
  owner email). 11 commits ahead of main, all green.
- Functional dead-end fixes launched: autopilot/connections deep-links, geo-post "fake success"
  publish dead-end, low-NPS internal alert that never notifies (build-gated).
- **Final QA fixes COMMITTED + pushed** (`16ef860`) — verified green. 7 safe fixes: broken
  /settings→/settings/account link + 6 a11y aria-labels on unlabeled form controls. QA also
  surfaced real functional bugs (now being fixed) + low-priority notes (status-page fake data,
  scheduled_request stub) left for follow-up.
- Final QA sweep launched: full-app broken-link/tab + a11y + dead-code audit → safe fixes (build-gated).
- **Hardening pass COMMITTED + pushed** (`c9f65b8`) — verified green. Security audit of all 5 new
  surfaces (WhatsApp webhook, Gmail OAuth, cron, public meeting-request, accept-invite) = clean;
  correctness audit caught + fixed a real HIGH-sev MIME header-injection (CRLF) bug in
  lib/gmail/mime.ts. tsc 0, next build, 995 tests.
- Hardening pass launched: security + correctness audit-and-fix of this session's NEW
  webhooks / OAuth callbacks / public endpoint / integration libs (build-gated).
- **Gmail 2-way sync COMMITTED + pushed** (`8ee1011`) — verified green (prisma generate, tsc 0,
  next build, 995 tests). Connect + cron-poll sync + MIME reply send; fixed a post-connect
  redirect 404 (/settings/connections → /connections). Needs Gmail API + scopes on the Google
  app + the syncCursor migration in prod.
- Gmail 2-way mailbox sync launched (connect + cron-poll sync + send, build-gated).
- **WhatsApp Business channel COMMITTED + pushed** (`8a827ac`) — verified green (tsc 0, next
  build, 967 tests). Webhook + ingest + outbound send mirroring Meta. Follow-up: WhatsApp
  OAuth connect callback (to persist Connection externalId=phone_number_id) before live.
- WhatsApp Business inbox channel launched (webhook + ingest + outbound send, build-gated).
- **CRM adapters COMMITTED + pushed** (`1191a0c`) — verified green (tsc 0, next build, 954
  tests). Salesforce/Zoho/Wix/WooCommerce contact-sync adapters vs the existing contract,
  registered in adapters/index.ts (ready stays runtime-gated like hubspot). Live OAuth needs
  each provider's app credentials configured.
- **Parity Wave A COMMITTED + pushed** — verified green (tsc 0, next build 45/45, tests pass).
  Built: secure `/accept-invite` flow (token validation + atomic single-use consume +
  callbackUrl login, 8 unit tests) and the chat **meeting-request queue** (MeetingRequest
  model + migration + RLS, public widget capture endpoint, /support/meetings queue UI +
  nav). Fixed two build-breakers the agents introduced: null-narrowing in acceptInvite, and
  a `"use server"` non-function export (MEETING_STATUSES → constants.ts). NOTE: the
  meeting_requests migration must be applied in prod (`prisma migrate deploy`).
- Parity Wave A launched: /accept-invite flow + chat meeting-request queue (build-gated).
- **Batch 1 COMMITTED + pushed** (`705248a`) — verified green (tsc 0, next build 45/45,
  918 tests). Fixed: /reviews onClick crash, 4 broken links, RBAC role-gating on 7 action
  files, SSRF DNS-rebind, dead SQLi component deleted, email-attr escaping, inbox assignee check.
- Batch 1 launched: reviews crash + broken links + RBAC + security hardening (build-gated).
- Discovery sweep complete (7 agents). Baseline green. Findings triaged above.
- Run start: discovery workflow launched.

## Already fixed earlier this session (on this branch)
- Subscription sync-on-return; email Resend sandbox guard; 500-QR batch timeout;
  AI-training crawl hardening; Account-settings missing sections (Notifications / API /
  Delete) + scroll-spy nav; signed outbound webhooks; notification-prefs gating;
  Auth signup hardening + self-heal + error logger; RSC boundary crashes on
  /ai/training /analytics /hardware; `use server` build break.
- Pending prod ops (user): chown .env/.next to `repulabs`, regenerate AUTH_SECRET,
  verify Google OAuth redirect URI + consent-screen, run `prisma migrate deploy`,
  verify Resend domain, register Stripe webhook.
