# RepuLabs UI — 02 · Onboarding

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

## SCREEN: Onboarding (3-step wizard)
A focused full-screen wizard on --bg with a slim top progress indicator (3 steps),
a centered --surface card, Back/Continue footer, and a "Skip for now" ghost link.
A faint right-rail checklist shows overall progress on wide screens.

**Step 1 — Connect platforms:** grid of platform cards (Google Business Profile,
Yelp, Facebook) each with brand glyph, short benefit line, and a Connect button that
flips to a Connected state (green check). At least one required to continue.

**Step 2 — Add your business:** form — business name, category (select),
location/address with map-ish placeholder, phone, website. Inline validation.

**Step 3 — Invite your team:** repeatable email + role rows (add/remove), role
select (Owner/Manager/Staff), "Send invites" or skip. Ends on a celebratory but
restrained success card → "Go to dashboard" primary CTA.

Include per-step validation, Continue disabled until valid, loading on connect/send,
and the final success state. Fully responsive; steps stack cleanly on mobile.

## OUTPUT
1) Short rationale. 2) Complete self-contained React+TS+Tailwind wizard (stepper +
3 step components + success). 3) States & assumptions note.
