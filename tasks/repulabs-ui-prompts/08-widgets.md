# RepuLabs UI — 08 · Widgets / Showcase

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
TECH: React+TS, Tailwind tokens, lucide-react icons (no emojis), realistic data.
All states: default/hover/focus-visible/active/disabled/loading/empty/error.

APP SHELL: 240px left sidebar + 64px top bar + 1280px content on --bg. Render in it.

---

## SCREEN: Widgets / Review Showcase
Lets owners create embeddable review widgets for their own website. A two-pane
configurator: controls left, live preview right.

- **Widget type gallery** (top or left): cards for layouts — Carousel, Grid, Wall/
  Masonry, Single "Floating badge", Star-rating summary badge. Selecting one updates
  the preview.
- **Style controls (left panel):**
    • Theme (Light/Dark/Auto) • Accent color • Corner radius • Show/hide reviewer
    photo, date, source logo • Minimum rating filter (e.g. only 4★+) • Source filter
    (Google/Yelp/Facebook) • Max reviews • Autoplay speed (carousel).
- **Live preview (right):** renders the actual widget with realistic reviews on a
  neutral mock website frame; updates instantly as controls change. A device toggle
  (desktop/mobile) frames the preview.
- **Embed panel:** generated `<script>` / iframe snippet in a code box with a
  one-click "Copy code" button (show copied toast), plus install instructions and a
  "Send to developer" option.
- **Saved widgets list:** small section/table of previously created widgets with
  edit/duplicate/delete.

Include loading skeleton, empty state (no widgets yet), copy-success toast, and full
responsiveness (preview drops below controls on mobile).

## OUTPUT
1) Short rationale. 2) Complete self-contained React+TS+Tailwind Widget configurator
(controls + live preview + embed panel). 3) States & assumptions note.
