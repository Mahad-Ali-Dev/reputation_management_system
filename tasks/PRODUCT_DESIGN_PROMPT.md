# Repulabs — Master Product-Design Prompt (for GPT / image-gen or a design tool)

Use this to generate **high-fidelity UI mockups for the entire product**, each screen in **two states: (1) EMPTY/onboarding and (2) POPULATED with realistic data**, all in one cohesive premium design language, reusing the existing illustration kit.

---

## ROLE
You are a senior product designer crafting a premium, cohesive B2B SaaS UI for **Repulabs**, a reputation-management platform for local & multi-location businesses (reviews, AI replies, review requests, QR/NFC stands, AI phone receptionist, unified inbox, surveys, social, local SEO, analytics, autopilot). Output **clean, modern, pixel-precise 1440×900 desktop screens** (and 390×844 mobile variants where asked). Marketing-grade polish, but real product UI — not abstract art.

## BRAND & DESIGN SYSTEM (strict)
- **Canvas:** warm paper — linear `#fbfaf6 → #f4f8f5 → #eef7f4` with a faint teal radial glow top-right. White (`#ffffff`) panels/cards on top.
- **Accent (hero):** royal blue `#2457ff` (tints `#eff6ff`, `#dbeafe`; deep `#1b3fd1`). **Secondary:** teal `#12b998` (use in progress fills, "live" states, success). Pair blue→teal in gradients.
- **Ink:** `#0f172a` (headings), `#1e293b`, `#475569` (body), `#64748b`/`#94a3b8` (muted). **Lines:** `#eef1f6`/`#e2e8f0`.
- **State:** success `#16a34a`, gold/ochre `#d6a63a`, alert/rose `#e14d62`.
- **Type:** Geist/Inter-style sans. Tight display headings (−0.02em tracking), comfortable body. Tabular numbers for KPIs.
- **Components:** soft layered card shadows (`0 1px 2px` + `0 12px 28px −14px rgba(15,23,42,.10)`), 12–16px radii, blue-tint active pills, gradient primary buttons (blue→deep-blue) with soft blue glow, chips/badges, generous whitespace, 8px spacing rhythm.
- **Sidebar:** white, blue-tint active item, slate icons. **Topbar:** search + notifications + org switcher + avatar.

## ILLUSTRATION KIT (reuse — do NOT invent new art styles)
Flat-vector, soft-depth, blue+teal. Use these in empty states / heroes:
`dashboard-welcome, reviews-empty, contacts-empty, surveys-empty, messages-empty, social-empty, listings-empty, qr-stands-empty, phone-empty, insights-empty, integrations-empty, requests-empty, disputes-empty, billing-empty, responses-empty, onboarding-steps, upgrade, success, error, not-found, ai-assistant, settings, login-hero, home-hero, feat-reviews, feat-ai-phone, feat-qr-nfc, feat-inbox, feat-surveys, feat-analytics, feat-autopilot, kb-brain, autopilot-hero, seo-hero, voice-review, comments-empty, livechat-empty, automations-empty, calendar-empty`.

## GLOBAL LAYOUT
App shell = left sidebar (nav groups: Overview, Reputation [Reviews, Requests, Disputes, Surveys], Engage [Inbox, Social, Phone], Intelligence [AI KB, Analytics, Autopilot], Setup [Establishments, Devices, Connections, Settings]) + topbar + warm-canvas content area with a page header (kicker + title + description + primary action) and cards.

## SCREENS — generate EACH in BOTH states (empty + populated)
For every screen, produce: **(A) Empty state** — page header + the matching illustration centered in a card + a one-line value prop + primary CTA + 2–3 "getting started" steps. **(B) Populated state** — realistic data, the real components below.

1. **Dashboard** — empty: `dashboard-welcome` + setup checklist. populated: visibility-health hero banner (blue→indigo, score ring + status-dot metrics), KPI strip (rating, reviews, response rate, requests sent — tabular numbers + trend deltas), rating-trend line chart, review-velocity, recent-activity timeline, AI briefing card, getting-started rail.
2. **Reviews feed** — empty: `reviews-empty`. populated: filter bar (platform/rating/status), Google-style review cards (avatar, stars, body, source badge), AI-draft reply composer with "approve & publish", sentiment chips.
3. **Review Requests / Outreach** — empty: `requests-empty`. populated: campaign list, send-via (SMS/email/QR) tabs, recipient table, template editor with merge-tags, schedule, deliverability stats.
4. **AI Knowledge Base** — empty: `kb-brain` + Auto-Setup wizard. populated: brain-readiness ribbon (score %), 4 tabs (Business info, Voice & style, Pricing, Test), knowledge-gap queue.
5. **Disputes** — empty: `disputes-empty`. populated: flagged reviews, AI dispute-argument drafts, status pipeline (draft→submitted→won/lost).
6. **Surveys** — empty: `surveys-empty`. populated: survey builder, NPS/CSAT cards, response table, smart-routing (happy→review, unhappy→private), insights.
7. **Unified Inbox** — empty: `messages-empty`. populated: 3-pane (conversation list / thread / context), channel chips (FB/IG/SMS/Google/webchat), AI-suggest reply, comments + moderation + live-chat + automations tabs.
8. **Social** — empty: `social-empty`. populated: 3-col composer (write / per-platform preview / schedule), content calendar (drag), library grid, AI captions + creatives.
9. **Contacts (CRM)** — empty: `contacts-empty`. populated: table (name/email/phone/tags/last-activity), segments, profile drawer with timeline, import/export.
10. **Analytics / Reports** — empty: `insights-empty`. populated: KPI tiles, rating trend, local-rank (3-pack), competitor compare, exec-summary, weekly-report cards.
11. **Autopilot** — empty: `autopilot-hero` + enable wizard. populated: loop cards (auto-reply, auto-request, auto-post) with on/off + guardrails, action ledger, ROI estimate.
12. **Connections** — empty: `integrations-empty`. populated: provider grid (Google/Meta/Twilio/GA4/DataForSEO) with connect/health status, accordion config.
13. **Establishments** — empty: `listings-empty`. populated: location cards (name, address, rating, completeness), add-business flow.
14. **Devices / Hardware** — empty: `qr-stands-empty`. populated: device list, QR-with-center-logo preview, NFC config card, batch generator (admin).
15. **Phone / Voice** — empty: `phone-empty`. populated: number provisioning, call log, AI-receptionist transcript→review.
16. **Settings / Team / Billing** — populated: profile, team roles (RBAC), plan card (`upgrade` illustration on free), usage meters, invoices.
17. **Onboarding** — `onboarding-steps`: multi-step wizard (business → connect → first request).
18. **Auth (login/signup)** — split: dark-navy hero (glow + stat card) + warm-canvas form. Use `login-hero`/`home-hero`.
19. **Marketing home** — premium long-form: hero (`home-hero`) + feature bento (`feat-*`) + how-it-works timeline + integrations + pricing + social proof + CTA.
20. **System states** — 404 (`not-found`), error (`error`), success (`success`), loading skeletons.

## OUTPUT
- One artboard per screen-state, labeled `<screen> — empty` / `<screen> — populated`. 1440×900 desktop; add 390×844 mobile for Dashboard, Reviews, Inbox.
- Consistent shell, spacing, and palette across ALL. Realistic copy + numbers (a dental/cafe/auto-shop tenant). No lorem ipsum. No stock photos — use the flat illustration kit.
- Keep it clean and uncluttered: clear hierarchy, lots of whitespace, one primary action per screen.
