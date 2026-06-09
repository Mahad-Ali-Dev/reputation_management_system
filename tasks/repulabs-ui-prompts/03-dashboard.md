# RepuLabs UI — 03 · Dashboard

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
recharts for charts. All states: default/hover/focus-visible/active/disabled/
loading(skeleton)/empty.

APP SHELL: 240px left sidebar (white, --pri-50 active item) + 64px top bar (search,
date-range, notifications, avatar) + 1280px max content on --bg. Render inside it.

---

## SCREEN: Dashboard (home / overview)
The at-a-glance command center. Header: greeting + business name, date-range picker,
"Request reviews" primary CTA.

- **KPI row** (4 StatCards, tabular-nums, delta vs prior period + tiny sparkline):
  Average Rating (e.g. 4.7★), Total Reviews (1,284, +6%), Response Rate (92%),
  NPS (68).
- **Rating trend** — line/area chart of average rating over time, range-aware.
- **Review volume by source** — small stacked bar or donut (Google/Yelp/Facebook
  with SourcePills + counts).
- **Sentiment breakdown** — positive/neutral/negative split bar with %.
- **Recent reviews feed** — list of 5–6: avatar, name, SourcePill, StarRating,
  snippet, time-ago, "Needs reply" badge; "View all" link to inbox.
- **Active campaigns** — compact summary card: campaign name, sent/opened/converted,
  status chip, link to campaigns.

Two-column responsive grid (charts left, feed right) collapsing to one column under
1024px. Include loading skeletons for every card and a first-run empty state
(no data yet → connect-platforms nudge).

## OUTPUT
1) Short rationale. 2) Complete self-contained React+TS+Tailwind Dashboard using the
shared components. 3) States & assumptions note.
