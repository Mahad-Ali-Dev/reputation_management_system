# RepuLabs UI — MAIN / Foundation Prompt

> Run this FIRST. It establishes the design system + shared component library that
> every screen prompt (01–13) reuses. Paste into v0 / Lovable / Cursor / Claude.

---

# ROLE
You are a senior product designer + front-end engineer who builds SaaS interfaces
that win Awwwards and get featured on Mobbin — the calibre of Linear, Vercel,
Stripe, Raycast, and Attio. You design with restraint: generous whitespace, a tight
type scale, near-invisible hairline borders, soft layered shadows, and motion that
clarifies rather than decorates. You ship pixel-perfect, accessible, production-ready
React + TypeScript + Tailwind CSS.

# PRODUCT
RepuLabs is a B2B reputation-management SaaS for local businesses (dental, med-spa,
home services, restaurants, clinics). It collects and showcases reviews, monitors
brand sentiment across Google / Yelp / Facebook, automates review-request campaigns
over SMS + email, and reports analytics. Users are busy, non-technical owners and
office managers. The UI must feel calm, trustworthy, premium, and effortless —
never cluttered, loud, or enterprise-heavy.

Tone: confident, clean, quietly powerful. NOT playful, NOT corporate-stiff.

# COLOR SYSTEM — use these EXACT tokens, never invent colors
Canvas / background:
  --bg:        #fbfaf6   warm off-white app canvas
  --bg-2:      #f4f8f5   cool tint section band
  --surface:   #ffffff   cards, panels, modals
  --surface-2: #faf9f4
  --surface-3: #f3f5f0   subtle fills, hover, skeletons
Brand blue:
  --pri:     #2457ff   primary — CTAs, active nav, links, focus ring
  --pri-50:  #eff6ff   tinted bg, active-nav fill
  --pri-100: #dbeafe
  --pri-700: #1b3fd1   hover / pressed, on-tint text
  --pri-900: #1a347f
Text:
  --text:        #1a1f2e   near-black slate — headings
  --text-muted:  #5b6472   secondary body, captions
  --text-subtle: #8a929e   placeholder, disabled, meta
Borders / lines:
  --border:      rgba(16,24,40,.08)   hairline, barely visible
  --border-strong: rgba(16,24,40,.14)  inputs, dividers that need presence
Semantic (desaturated, status-only — blue stays the one "loud" color):
  --success: #16a34a   --success-bg: #ecfdf3
  --warning: #d97706   --warning-bg: #fffaeb
  --danger:  #dc2626   --danger-bg:  #fef3f2
Star/rating gold: #f5a623 (filled), #e6e8eb (empty).

Never: pure black (#000), heavy/long shadows, saturated non-brand fills,
gradients on text, more than one accent hue per screen.

# TYPOGRAPHY
Typeface: one geometric/grotesk sans — Inter or Geist, with system-ui fallback.
  font-family: "Inter", ui-sans-serif, system-ui, -apple-system, sans-serif;
Type scale (px / weight / tracking / line-height):
  Display   44 / 700 / -0.03em / 1.05   — marketing & big empty states only
  H1        30 / 600 / -0.02em / 1.15   — page titles
  H2        24 / 600 / -0.02em / 1.2    — section headers
  H3        18 / 600 / -0.015em / 1.3   — card titles
  Body-lg   16 / 400 / -0.01em / 1.5    — lead paragraphs
  Body      14 / 400 / 0 / 1.5          — default UI text
  Label     13 / 500 / 0 / 1.4          — form labels, table headers (often UPPERCASE
                                          + 0.04em tracking + --text-muted)
  Caption   12 / 400 / 0 / 1.4          — meta, timestamps, helper text
Numerals: use tabular-nums for all metrics, tables, and money.
Rules: hierarchy comes from size + weight + color only. Never use decorative or
serif fonts. Body text is --text-muted; headings are --text. Max ~70ch line length.

# SHAPE, SPACING, ELEVATION
Radius: 8px default (0.5rem); 12–16px large cards/modals; 9999px pills for
  badges/chips/avatars/toggles.
Spacing: strict 8px grid (4 8 12 16 24 32 48 64). Lean generous — prefer 24/32
  gaps to 8/12. Card padding 20–24px. Section gaps 32–48px.
Shadows (layered, soft):
  sm: 0 1px 2px rgba(16,24,40,.04)
  md: 0 1px 2px rgba(16,24,40,.04), 0 8px 24px rgba(16,24,40,.06)
  lg: 0 1px 2px rgba(16,24,40,.04), 0 16px 40px rgba(16,24,40,.08)  — modals, popovers
Use borders + sm shadow for resting cards; reserve md/lg for floating layers.

# APP LAYOUT
- Left sidebar (240px): --surface, right hairline border. Logo top; nav groups with
  Label-style group headers; account block pinned bottom. Active item = --pri-50
  fill, 8px radius, --pri icon + text, 500 weight. Hover = --surface-3 fill.
  Collapses to an off-canvas drawer under 768px (hamburger in top bar).
- Top bar (64px): --surface, bottom hairline. Global search (⌘K) left-center,
  contextual date-range picker, notifications bell (with dot), avatar menu right.
- Content: max-width 1280px, centered, 32px gutters, --bg canvas. Cards over dense
  tables where it lowers cognitive load. Group with whitespace, not rules.

# MOTION
150–250ms ease-out on hover/press; gentle 8px fade-up on mount; 1.2s skeleton
shimmer on load; 200ms modal/drawer fade+scale. Respect prefers-reduced-motion
(disable transforms, keep opacity). No bounce, parallax, or decorative animation
inside the app.

# ACCESSIBILITY (non-negotiable)
WCAG 2.2 AA contrast. Semantic HTML. aria-labels on icon-only buttons. Full
keyboard navigation + logical focus order. Visible focus-visible ring:
2px --pri with 2px offset. Form fields linked to <label> + error text via
aria-describedby. Respect reduced motion.

# TECH
React + TypeScript functional components. Tailwind CSS with tokens defined once in
a theme layer. No heavyweight UI kit (Radix primitives OK for a11y of menus/dialogs/
tabs). Icons: lucide-react only — no emojis in UI. Charts: recharts (or lightweight
equivalent). Realistic reputation-management data everywhere — no lorem ipsum.

# YOUR TASK (this prompt)
Produce the FOUNDATION the rest of the product is built on:

1. Design rationale (6–8 sentences: philosophy, hierarchy, why it reads premium).
2. Theme layer: globals.css (or tailwind config) defining every token above as CSS
   variables, base typography, and the focus-ring utility.
3. Shared component library — each as a complete, typed, reusable component with all
   interactive states (default / hover / focus-visible / active / disabled / loading
   / error where applicable):
     • AppShell (sidebar + topbar + responsive drawer + content slot)
     • Button (primary / secondary / ghost / danger / icon, + sizes sm/md/lg, loading)
     • Input, Textarea, Select, Toggle, Checkbox, Radio (with label + error states)
     • Card (+ header/body/footer slots) and StatCard (KPI: label, value, delta, spark)
     • Badge / Chip (neutral + semantic + source-platform variants)
     • Tabs, Table (sortable header, row hover, selection, pagination)
     • Modal, Drawer, DropdownMenu, Tooltip, Toast
     • Avatar (+ stacked group), StarRating (display + interactive), SourcePill
       (Google / Yelp / Facebook with brand glyph), SegmentedControl
     • EmptyState, Skeleton, Pagination
4. A one-screen "kitchen sink" page rendering every component in its key states so
   the system is visible at a glance.

# OUTPUT FORMAT
- Rationale first.
- Then theme layer (one code block).
- Then components (grouped logically, typed, documented props).
- Then the kitchen-sink page.
Keep everything consistent and reuse-ready. Screens 01–13 will import these exact
components — do not redefine primitives later.
