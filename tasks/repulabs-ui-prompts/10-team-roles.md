# RepuLabs UI — 10 · Team & Roles

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

## SCREEN: Team & Roles
Manage who can access RepuLabs and what they can do.

- **Header:** "Invite member" primary CTA + search.
- **Members table:** avatar + name + email, role chip (Owner/Admin/Manager/Staff),
  assigned locations (chips / "All"), status (Active/Invited/Suspended), last active,
  row actions (edit role, resend invite, remove). Pending invites visually distinct
  (dashed/“Invited” chip).
- **Invite drawer/modal:** email(s) input (multi), role select with a short
  description of each role's access, location assignment, "Send invite" — with
  validation and loading.
- **Roles & permissions matrix:** a clean table — rows = capabilities (View reviews,
  Reply to reviews, Manage campaigns, Manage billing, Manage team, Manage settings),
  columns = roles, cells = check / dash. Read-only for default roles; if custom roles
  are supported, an "Edit role" affordance + create-custom-role flow.

Include loading skeleton, empty state (just you so far → invite teammates),
confirmation modal for removing a member, and toasts on invite sent / role changed.
Responsive: table → stacked cards on mobile.

## OUTPUT
1) Short rationale. 2) Complete self-contained React+TS+Tailwind Team screen
(members table + invite drawer + permissions matrix). 3) States & assumptions note.
