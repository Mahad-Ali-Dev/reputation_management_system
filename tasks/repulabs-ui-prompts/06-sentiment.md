# RepuLabs UI — 06 · Sentiment Monitoring

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
recharts. All states: default/hover/focus-visible/active/disabled/loading/empty/error.

APP SHELL: 240px left sidebar + 64px top bar + 1280px content on --bg. Render in it.

---

## SCREEN: Sentiment Monitoring
A calm analytics view that turns review language into trends and alerts.

- **Header:** title, date-range, source filter chips (Google/Yelp/Facebook/All).
- **Sentiment summary row:** three soft StatCards — Positive / Neutral / Negative
  with % and delta, color-coded by semantic tokens (desaturated). Overall sentiment
  score gauge or large number.
- **Sentiment over time:** stacked area chart (positive/neutral/negative bands) with
  range awareness; hover tooltip with counts.
- **Themes & keywords:** ranked list (preferred over a noisy word cloud) of detected
  topics — e.g. "wait time", "staff friendliness", "pricing", "cleanliness" — each
  with mention count, sentiment chip, and a sparkline trend. Click expands example
  review snippets.
- **Source breakdown:** sentiment split per platform (small bars + SourcePills).
- **Alert rules:** card listing rules ("Notify me when negative sentiment > 20% in
  a week"), toggle on/off, "New alert rule" button opening a small modal (condition
  + threshold + channel email/SMS).

Include loading skeletons, an empty state (not enough data to analyze yet), and the
alert-rule modal with validation. Responsive grid collapses to one column on mobile.

## OUTPUT
1) Short rationale. 2) Complete self-contained React+TS+Tailwind Sentiment screen +
alert-rule modal. 3) States & assumptions note.
