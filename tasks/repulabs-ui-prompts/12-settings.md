# RepuLabs UI — 12 · Settings

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
All states: default/hover/focus-visible/active/disabled/loading/saved/error.

APP SHELL: 240px left sidebar + 64px top bar + 1280px content on --bg. Render in it.

---

## SCREEN: Settings
A calm, well-organized settings area with a left sub-nav (sections) + right content
panel. Each section is a stack of Cards with grouped fields and a sticky "Save
changes" footer that appears only when something changed (dirty state).

Sections:
  • **Profile** — your name, email, avatar upload, password change, 2FA toggle.
  • **Business profile** — business name, category, address, phone, website, hours,
    timezone, default review link.
  • **Branding** — logo upload, brand color picker (drives widgets + emails), email
    sender name/reply-to, footer text; live mini-preview of a branded email.
  • **Notifications** — granular toggles in a matrix (New review, Negative review,
    Weekly report, Campaign completed) × channel (Email / SMS / In-app).
  • **Review settings** — minimum rating to auto-publish to widgets, smart routing
    (low ratings → private feedback form), auto-reply templates.
  • **Danger zone** — export data, delete account (destructive, confirm-by-typing).

Include field-level validation, "saved" confirmation toast, loading skeleton, and the
destructive confirm modal. Responsive: sub-nav becomes a top tab bar / select on
mobile.

## OUTPUT
1) Short rationale. 2) Complete self-contained React+TS+Tailwind Settings layout
(sub-nav + sections + sticky save bar + danger confirm). 3) States & assumptions note.
