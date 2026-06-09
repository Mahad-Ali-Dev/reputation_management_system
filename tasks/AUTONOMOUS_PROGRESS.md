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

## Status
- [x] Launched discovery sweep (7 read-only agents): routes/links, RSC/build risks,
      app-sec, authz/tenant-isolation, ReviewBoost parity, tasks/ spec gaps, build baseline.
- [ ] Triage findings → fix batches (in progress as results land).
- [ ] Per-batch: fix → `tsc` + `next build` + tests → commit.
- [ ] Loop until dry / user returns.

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

## Log
(Newest first — updated as batches land.)
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
