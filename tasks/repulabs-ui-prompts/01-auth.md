# RepuLabs UI — 01 · Authentication

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
All states: default/hover/focus-visible/active/disabled/loading/error.

---

## SCREEN: Authentication
Design three centered screens on the --bg-2 tinted canvas with the RepuLabs brand
mark above a --surface card (radius 16, md shadow, max-width ~420px):

1. **Log in** — email + password fields, "Remember me" toggle, "Forgot password?"
   link, primary "Sign in" button, divider, "Continue with Google" secondary button,
   footer "New to RepuLabs? Create account".
2. **Sign up** — name, business name, email, password (with strength hint), primary
   "Create account", Google option, terms/privacy caption, footer link to log in.
3. **Forgot password** — email field, "Send reset link" button, success confirmation
   state, "Back to login" link.

Include: inline field validation + error messages, button loading state, disabled
submit until valid, and the success/confirmation state for forgot-password. Optional
right-side testimonial/social-proof panel on wide screens (≥1024px) showing a
5-star quote — collapses on mobile. Fully responsive 360px+.

## OUTPUT
1) Short rationale. 2) Complete self-contained React+TS+Tailwind components for all
three screens (shared AuthCard wrapper). 3) States & assumptions note.
