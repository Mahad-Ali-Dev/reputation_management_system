# Overnight build — architecture blueprint (from Wave 1 Plan agent)

## Agentic onboarding orchestrator (business name + website → auto-built dashboard)
- Entry: `app/onboarding/page.tsx` + `onboarding-form.tsx` (2 fields). Dashboard redirects to
  `/onboarding` when `onboardingStep===0` and no establishment.
- `startOnboarding()` server action (NEW `lib/onboarding/orchestrator-actions.ts`, "use server"):
  requireRole("admin") + assertEntitled + rate-limit + SSRF-validate URL → create run → enqueue step 1.
- Substrate: REUSE `ScheduledJob` + `drainDueScheduledJobs()` (lib/scheduler/dispatch.ts) +
  `HANDLERS` registry. Add `onboarding_step` kind; each step does work in `withTenant` then enqueues
  the next step (chained step machine). QStash for fast first steps; minute-cron as retry safety net.
- NEW model `OnboardingRun` (+migration): org-scoped, status (running|needs_user|done|failed),
  steps Json checklist, partial-unique active run per org = idempotency anchor.
- Steps: A provision Establishment · B crawl+profile→seed AI KB (refactor `auto-setup.ts:scanAndBuild`
  into `runAutoSetup({orgId,userId,url})` w/o requireOrg/redirect) · C brand voice · D detect+suggest
  platform connections (OAuth = suggest only, can't auto-consent) · E seed default templates + a
  DISABLED starter campaign · F widget key + dashboard briefing + onboardingStep=99.
- AUTO: crawl, extract, KB ingest, brand voice, templates, widget, suggestions. NEEDS USER: Google/
  Meta/Gmail OAuth (deep-link, run→needs_user, dashboard still usable).
- Progress UX: `/onboarding` polls `GET /api/onboarding/status` (1.5s) → vertical checklist.
- Idempotency (active-run unique + per-step skip-if-done + dedupeKey), withTenant isolation,
  requireRole(admin) to start, fail-soft per step (continue non-dependent steps).

## Module relayouts (Google-product quality)
- **dashboard**: two-tier command center — sticky 'Today' KPI row + ONE prioritized action queue
  (merge SetupProgress + GettingStarted).
- **reviews**: inbox-style two-pane (list left + reply/detail drawer right) with AI-draft/approve/dispute inline.
- **support/inbox**: ONE Unified Inbox — channel rail (All·Comments·DMs·Live chat·WhatsApp·Email) →
  thread list → conversation pane w/ AI-assist. Fold chat-automation/meetings/blacklist/customers in.
- **ai/training (AI KB)**: three tabs — Knowledge (sources incl. auto-setup doc + re-scan), Behavior
  (personality/voice), Test (chat + gaps).
- **analytics**: drop the standalone onboarding-wizard (folded into orchestrator); report tabs
  (Reputation · Requests funnel · ...).
- **surveys**: lifecycle — Campaigns → Builder (templates as picker) → Results → Incentives tab.
- **social**: ONE workspace, view toggle (Calendar|Queue|Published) + composer drawer + Engagement tab (SocialComment).
- **settings**: sectioned shell (Workspace·Team·Billing·Brand·Notifications·Security·Data) left-nav + pane.
- **connections**: three bands — Suggested-from-your-website (orchestrator candidates) · Connected (live sync) · All providers.

## Integration gaps (to complete)
- Facebook Pages (ready:false) — OAuth route + comment fetch/reply + post; needs Meta App Review.
- Facebook/Instagram AD comments — Graph Ads API → normalize into SocialComment.
- Instagram Business (ready:false) — Meta review; comment/DM + publish.
- WhatsApp OAuth — Meta Embedded Signup authorize/callback (paste-form exists today) + adapter.
- X/Twitter (ready:false) — paid API; PKCE flow + adapter.
- LinkedIn (ready:false) — OAuth route + adapter (company page).
- No-op contact adapters (most of registry) — implement per provider you ship.
- mailchimp + klaviyo — callbacks exist, add adapters (syncs:contacts).
- GBP place auto-detection — Places lookup for orchestrator Step D.
- api-key providers (activecampaign/convertkit/brevo/omnisend/squarespace…) — reusable paste-credential
  connection form (envelope-encrypted).

## Audit findings (verify before fixing — some may be false positives)
- HIGH inline async "use server" closures in form actions (app/ai/page, reviews/[id], establishments)
  — NOTE: inline form-action "use server" closures are a VALID Next 15 pattern; verify before changing.
- HIGH missing force-dynamic on auth API routes (billing/checkout) + OAuth callbacks.
- HIGH RBAC: settings mutations missing admin check (lib/account/actions) — re-verify (we added requireRole).
- MED fire-and-forget no error handling (app/api/r/pick/[slug]).
- MED webhook idempotency validation.
- MED AI KB extraction/auto-refresh quality (lib/ai/ingest.ts).
- LOW N+1 in analytics/reviews dispute.

## Build sequencing
Wave 0 foundations (OnboardingRun model+migration, scheduler kind, runAutoSetup refactor, flag) →
orchestrator core (auto path) → connect suggestions/UX → module relayouts → integrations → bug fixes.
