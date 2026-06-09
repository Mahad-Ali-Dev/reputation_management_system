# RepuLabs UI — 05 · Review Requests / Campaigns

## SHARED CONTEXT (keep at top of every screen prompt)
ROLE: Senior product designer + front-end engineer building premium SaaS UI at the
calibre of Linear, Vercel, Stripe, Attio. Restraint, whitespace, hairline borders,
soft layered shadows, purposeful motion. Ship pixel-perfect, accessible React +
TypeScript + Tailwind.

PRODUCT: RepuLabs — reputation-management SaaS for local businesses. Collects/showcases
reviews, monitors sentiment across Google/Yelp/Facebook, automates SMS+email review
campaigns, reports analytics. Users: busy non-technical owners + office managers.
Tone: calm, trustworthy, premium, effortless. Not loud, not corporate-stiff.

COLOR TOKENS (exact, never invent):
  --bg #fbfaf6 · --bg-2 #f4f8f5 · --surface #ffffff · --surface-2 #faf9f4 · --surface-3 #f3f5f0
  --pri #2457ff · --pri-50 #eff6ff · --pri-100 #dbeafe · --pri-700 #1b3fd1 · --pri-900 #1a347f
  --text #1a1f2e · --text-muted #5b6472 · --text-subtle #8a929e
  --border rgba(16,24,40,.08) · --border-strong rgba(16,24,40,.14)
  success #16a34a/#ecfdf3 · warning #d97706/#fffaeb · danger #dc2626/#fef3f2 · star #f5a623
TYPOGRAPHY: Inter/Geist, system-ui fallback. H1 30/600/-0.02em · H2 24/600 · H3 18/600
  · Body 14/400 · Label 13/500 (UPPERCASE 0.04em for form labels) · Caption 12/400.
  tabular-nums for metrics. Hierarchy via size+weight+color only.
SHAPE: radius 8px (12–16 large cards, pills for chips). 8px spacing grid, generous.
  Shadows soft+layered. Borders barely visible hairlines.
A11Y: WCAG AA, semantic HTML, aria-labels on icon buttons, keyboard nav, visible
  2px --pri focus ring, labels tied to inputs, respect prefers-reduced-motion.
TECH: React+TS, Tailwind tokens, lucide-react icons (no emojis), realistic data,
recharts for the funnel. All states: default/hover/focus-visible/active/disabled/
loading/empty/error.

APP SHELL: 240px left sidebar + 64px top bar + 1280px content on --bg. Render in it.

---

## SCREEN: Review Requests / Campaigns (3 connected views)

**A. Campaign list** — header with "New campaign" primary CTA; table/cards of
campaigns: name, channel (SMS/Email chips), status (Draft/Scheduled/Active/Completed),
audience size, sent, open rate, conversion (reviews generated), date. Row actions
(edit, duplicate, pause, archive). Empty state with a "Create your first campaign"
prompt.

**B. Campaign builder** — a clean multi-step or single-scroll form with a LIVE
PREVIEW pane on the right (phone mockup for SMS / email frame for Email):
  1. Basics — campaign name, channel (segmented SMS / Email / Both).
  2. Audience — select source list / upload contacts / filter by last-visit; show
     estimated recipient count.
  3. Message — template editor with merge tags ({{first_name}}, {{business}},
     {{review_link}}), tone presets, and an AI "improve message" button. Email adds
     subject + simple body blocks. Live preview updates as you type; SMS shows
     segment/character count.
  4. Schedule — send now / schedule date-time / drip delay after visit.
  Sticky footer: Save draft · Send test · Schedule/Send (with confirm modal).

**C. Campaign analytics** (per campaign) — KPI row (Sent, Delivered, Opened,
Clicked, Reviews) + a horizontal conversion FUNNEL chart, delivery-over-time line,
and a recipients table with per-row status.

Include loading skeletons, empty states, validation, and the send-confirm modal.
Responsive: builder preview moves below the form on mobile.

## OUTPUT
1) Short rationale. 2) Complete self-contained React+TS+Tailwind for all three views
(list, builder w/ live preview, analytics). 3) States & assumptions note.
