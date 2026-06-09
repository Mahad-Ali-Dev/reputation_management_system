# RepuLabs — Complete UI Design Specification & Build Brief
### Hand-off document for Frontend / Figma designers & developers

This is a build-ready specification, not a loose prompt. It defines the design system,
grid, breakpoints, typography ramp, component anatomy (with pixel measurements),
responsive behavior, motion, accessibility, and a detailed layout spec for **every
page**. Build it exactly. Where a value isn't given, follow the nearest rule in the
system rather than inventing.

Stack target: React + TypeScript + Tailwind CSS, lucide-react icons, recharts for
charts, Radix primitives for menus/dialogs/tabs. Equivalent Figma auto-layout is fine
for design-only delivery.

---

## 0. PRODUCT & DESIGN PRINCIPLES

**Product.** RepuLabs is a reputation-management SaaS for local businesses (dental,
med-spa, home services, restaurants, clinics). It collects & showcases reviews,
monitors sentiment across Google/Yelp/Facebook, runs SMS+email review-request
campaigns, and reports analytics. Primary users: busy, non-technical owners and
office managers.

**North star:** calm, premium, trustworthy, effortless. Reference quality: Linear,
Stripe, Vercel, Attio, Raycast.

**Six principles (apply to every decision):**
1. **Whitespace is a feature.** When in doubt, add space, not elements.
2. **One loud color.** Brand blue is the only saturated hue; everything else is slate/
   neutral. Semantic colors appear only on status.
3. **Hierarchy through type & space, not lines & boxes.** Group with whitespace;
   borders are hairlines, used sparingly.
4. **Quiet surfaces, soft depth.** Low-spread layered shadows; never harsh.
5. **Motion clarifies, never decorates.** Short, ease-out, purposeful.
6. **Density on demand.** Default to comfortable spacing; power features (tables,
   inbox) may go denser but stay legible.

---

## 1. GRID, BREAKPOINTS & PAGE FRAME

**Breakpoints (min-width, mobile-first):**
| Token | Min width | Target |
|-------|-----------|--------|
| base  | 0px       | phones (design at 375) |
| sm    | 640px     | large phones |
| md    | 768px     | tablets (sidebar collapses below this) |
| lg    | 1024px    | small laptops |
| xl    | 1280px    | desktop (primary design target) |
| 2xl   | 1536px    | large desktop |

**Primary design canvas: 1440px wide.** Verify at 1440, 1280, 1024, 768, 375.

**App frame (authed pages):**
- Left sidebar: **240px** fixed (collapsible rail **72px** optional on lg; off-canvas
  drawer below md).
- Top bar: **64px** tall, sticky, full content width.
- Content region: fills remaining width, **max-width 1280px**, centered, with
  **horizontal padding: 32px (xl) / 24px (lg–md) / 16px (base)**.
- Vertical content rhythm: page top padding **32px**, gap between major sections
  **32px (desktop) / 24px (mobile)**.

**Content column grid inside the content region:**
- Desktop (≥lg): **12-column** grid, **24px gutter**.
- Tablet (md): **8-column**, 24px gutter.
- Mobile (base–sm): **4-column**, 16px gutter, most layouts collapse to a single
  stacked column.

---

## 2. SPACING SCALE (8px base)

Use ONLY these steps. Name them by value.
`2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96`

Usage guide:
- 4–8: icon↔label gaps, chip internal padding, tight inline.
- 12–16: input padding, list-row vertical padding, gaps inside a card.
- 20–24: card padding, gaps between cards in a group.
- 32: gap between page sections; content gutter (desktop).
- 48–64: hero/empty-state breathing room, marketing bands.

---

## 3. COLOR SYSTEM (exact tokens — define once, never hard-code elsewhere)

**Canvas / surfaces**
```
--bg:        #fbfaf6   /* app canvas (warm off-white) */
--bg-2:      #f4f8f5   /* tinted band / auth background */
--surface:   #ffffff   /* cards, panels, modals, sidebar, top bar */
--surface-2: #faf9f4   /* subtle inset / alternate row */
--surface-3: #f3f5f0   /* hover fill, skeleton base, chips */
```
**Brand blue (only saturated hue)**
```
--pri:     #2457ff   /* primary CTA, active nav, links, focus ring, selected */
--pri-50:  #eff6ff   /* active-nav fill, tinted info box, AI-suggestion box */
--pri-100: #dbeafe   /* hover on tinted, chart fill */
--pri-700: #1b3fd1   /* button hover/pressed, on-tint text */
--pri-900: #1a347f   /* deepest, rare */
```
**Text**
```
--text:        #1a1f2e   /* headings, primary values */
--text-muted:  #5b6472   /* body, secondary, descriptions */
--text-subtle: #8a929e   /* placeholder, disabled, meta, captions */
--text-on-pri: #ffffff   /* text on blue */
```
**Lines**
```
--border:        rgba(16,24,40,0.08)   /* card & section hairlines */
--border-strong: rgba(16,24,40,0.14)   /* inputs, table dividers, focus-adjacent */
```
**Semantic (desaturated; status only)**
```
--success #16a34a / bg #ecfdf3 / border #abefc6
--warning #d97706 / bg #fffaeb / border #fde68a
--danger  #dc2626 / bg #fef3f2 / border #fecdca
--info    = --pri / bg --pri-50
```
**Rating:** filled star `#f5a623`, empty star `#e6e8eb`.

**Color usage rules**
- CTAs & primary actions: `--pri`. Secondary actions: `--surface` + `--border` +
  `--text`. Tertiary: ghost (no fill, `--text-muted`, hover `--surface-3`).
- Links & active states: `--pri`. Visited = same.
- Status chips: semantic bg + text + border trio. Never use semantic colors for
  decoration.
- Never `#000`, never pure-saturated red/green fills, never two accent hues on one
  screen, never gradients on text.

---

## 4. TYPOGRAPHY

**Family:** `"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`.
(Geist acceptable alternative.) Load weights **400, 500, 600, 700**.
`font-feature-settings: "cv11", "ss01"; -webkit-font-smoothing: antialiased;`

**Type ramp** — each row: role · desktop size/line-height · weight · tracking ·
mobile size (if it scales) · where used.
| Role | Desktop | Weight | Tracking | Mobile | Used for |
|------|---------|--------|----------|--------|----------|
| Display | 44/48 | 700 | -0.03em | 32/36 | marketing hero, big empty states |
| H1 | 30/36 | 600 | -0.02em | 24/30 | page titles |
| H2 | 24/30 | 600 | -0.02em | 20/26 | section headers |
| H3 | 18/26 | 600 | -0.015em | 18/26 | card titles, modal titles |
| Body-lg | 16/24 | 400 | -0.01em | 16/24 | lead paragraph, important body |
| Body | 14/21 | 400 | 0 | 14/21 | default UI text, table cells |
| Body-strong | 14/21 | 500 | 0 | — | emphasized inline, active tab |
| Label | 13/16 | 500 | 0 | — | form labels, buttons |
| Overline | 12/16 | 600 | 0.06em UPPERCASE | — | table headers, group nav headers, eyebrows |
| Caption | 12/16 | 400 | 0 | — | meta, timestamps, helper, badge text |
| Mono/num | inherit | — | tabular-nums | — | ALL metrics, money, counts, dates in tables |

**Type rules**
- Color: headings `--text`; body `--text-muted`; meta/disabled `--text-subtle`.
- Hierarchy comes from size + weight + color ONLY. No serif, no decorative fonts.
- Max line length ~70ch for paragraphs.
- KPI big numbers: H1/Display size, 600, `--text`, tabular-nums, with a Caption/Label
  description above or below in `--text-muted`.
- Buttons use Label (13/16, 500). Never ALL-CAPS except Overline.

---

## 5. SHAPE, ELEVATION, ICONS

**Radius:** controls/inputs/buttons **8px**; cards **12px**; large cards/modals/
drawers **16px**; pills (chips/badges/avatars/toggles) **9999px**; insets (code box,
nested) **8px**.

**Border:** 1px, `--border` for surfaces, `--border-strong` for inputs/dividers.

**Shadow tiers:**
```
sm: 0 1px 2px rgba(16,24,40,.04)                                    /* resting cards */
md: 0 1px 2px rgba(16,24,40,.04), 0 8px 24px rgba(16,24,40,.06)     /* dropdowns, popovers, raised */
lg: 0 1px 2px rgba(16,24,40,.04), 0 16px 40px rgba(16,24,40,.08)    /* modals, drawers */
```
Resting cards = border + sm. Floating layers = md/lg (and a backdrop for modals:
`rgba(16,24,40,.40)` + 2px blur).

**Icons:** lucide-react, stroke 1.75px. Sizes: 16 (inline/buttons), 18 (nav, default),
20 (section headers), 24 (feature/empty-state). Icon color matches adjacent text;
active nav icon = `--pri`. Icon-only buttons require `aria-label`.

---

## 6. CORE COMPONENT SPECS (anatomy + measurements + states)

> Build these once; every page consumes them. Each lists: size, padding, radius, and
> the full state set.

**6.1 Button**
- Heights: sm **32px**, md **40px** (default), lg **48px**. Horizontal padding 12/16/20.
  Radius 8. Label 13/500. Icon 16, gap 8.
- Variants: **Primary** (`--pri` bg, white text; hover `--pri-700`; active darker;
  focus 2px `--pri` ring + 2px offset). **Secondary** (`--surface` bg, `--border-strong`,
  `--text`; hover `--surface-3`). **Ghost** (transparent, `--text-muted`; hover
  `--surface-3`). **Danger** (`--danger` bg, white). **Icon** (square, 32/40).
- States: default/hover/active/focus-visible/disabled (50% opacity, no pointer)/
  loading (spinner replaces icon, label dims, width locked).

**6.2 Input / Textarea / Select**
- Height 40 (textarea min 96). Padding 10×12. Radius 8. Border `--border-strong`.
  Body 14, text `--text`, placeholder `--text-subtle`.
- Label above (Label style, 8px gap). Optional helper Caption below (`--text-subtle`).
- States: default; hover border darkens; focus = 2px `--pri` ring + border `--pri`;
  error = `--danger` border + `--danger` helper text + alert icon; disabled =
  `--surface-3` bg, `--text-subtle`; with leading/trailing icon (16, 12px inset).

**6.3 Card**
- `--surface`, radius 12, border `--border`, shadow sm, padding 24 (20 on mobile).
- Optional header (H3 + optional action/menu, 16px bottom gap, hairline divider
  optional), body, footer (hairline top, right-aligned actions).

**6.4 StatCard (KPI)**
- Card, padding 20. Top: Overline label (`--text-muted`). Center: big number (H1,
  tabular-nums, `--text`). Trailing: delta chip (▲/▼ + % , `--success`/`--danger` bg
  tint). Bottom-right: tiny sparkline (40px tall, `--pri` line). Hover: shadow → md.

**6.5 Badge / Chip**
- Pill, height 22–24, padding 2×10, Caption 12/500. Variants: neutral (`--surface-3`/
  `--text-muted`), semantic (bg+text+border trio), source-platform (brand glyph +
  name). "Needs reply" / status dots = 6px dot + label.

**6.6 Table**
- Header row: Overline labels, `--text-muted`, `--surface-2` bg, sortable carets,
  sticky on scroll. Row height 56 (52 dense). Cell padding 16, Body 14, hairline
  `--border` between rows. Row hover `--surface-3`. Selected `--pri-50`. Checkbox
  column 48. Right-aligned numerics (tabular-nums). Footer: pagination (page size +
  prev/next + range "1–20 of 1,284").
- Mobile: collapse to stacked cards (label:value pairs) below md.

**6.7 Tabs / SegmentedControl**
- Tabs: underline style, active = `--text` + 2px `--pri` underline; inactive
  `--text-muted`; 16px gap; hairline track. Segmented: pill track `--surface-3`,
  active segment `--surface` + sm shadow.

**6.8 Modal / Drawer**
- Modal: centered, max-width 480 (sm) / 640 (md) / 800 (lg), radius 16, shadow lg,
  padding 24, backdrop blur. Header (H3 + close icon), body, footer (Cancel ghost +
  primary, right-aligned). Drawer: right side, width 420–560, full height, same
  internals, slides in 200ms.
- Destructive confirm: danger primary; "type to confirm" for account/data deletion.

**6.9 DropdownMenu / Tooltip / Toast**
- Menu: `--surface`, radius 8, shadow md, item height 36, padding 8×12, hover
  `--surface-3`, danger items `--danger`. Tooltip: `--text` bg, white Caption, radius
  6, 6×8 padding, 200ms delay. Toast: bottom-right stack, `--surface`, radius 12,
  shadow md, icon + message + optional action, auto-dismiss 4s, success/error variants.

**6.10 Avatar / StarRating / SourcePill**
- Avatar: 24/32/40, pill, image or initials on `--pri-100`/`--pri-900`. Stacked group
  overlaps -8px, "+N" chip.
- StarRating: 5 stars, 16px (inline) / 20px (detail); filled `#f5a623`. Interactive
  variant has hover preview + keyboard support.
- SourcePill: brand glyph (Google/Yelp/Facebook) + name; neutral chip.

**6.11 EmptyState / Skeleton / ProgressMeter**
- EmptyState: centered, 24px feature icon in a `--surface-3` circle, H3 title, Body
  `--text-muted` line, primary CTA. Max-width 360, vertical padding 64.
- Skeleton: `--surface-3` blocks, 1.2s shimmer, match final layout (rows/cards/chart
  placeholders). Respect reduced-motion (static).
- ProgressMeter: 8px track `--surface-3`, fill `--pri`; near-limit (≥80%) amber;
  over-limit red; value as tabular-nums caption.

---

## 7. RESPONSIVE BEHAVIOR (global rules)

- **Sidebar:** ≥md visible (240px); <md hidden, opens as off-canvas drawer from
  hamburger in top bar with a scrim. Optional 72px icon-rail at lg.
- **Top bar:** search collapses to an icon below md (opens full-width overlay); date-
  range and bell remain; avatar stays.
- **Content padding:** 32 → 24 → 16 down the breakpoints.
- **Multi-column layouts:** 2–3 columns at ≥lg → stack to 1 column below lg (charts
  before feeds; KPIs become 2×2 then 1×4).
- **Tables:** become stacked label/value cards below md.
- **Two-pane (inbox, widgets, settings):** master-detail side-by-side at ≥lg → single
  pane with list → push-to-detail navigation (back button) below lg.
- **Modals:** become bottom sheets (full-width, slide up, radius top 16) below md.
- **Touch targets:** min 44×44 on touch breakpoints.
- **Charts:** maintain min 220px height; legends wrap or move below; reduce tick
  density on small widths.

---

## 8. MOTION & INTERACTION

- Durations: micro (hover/press) **150ms**; enter/exit (modal, drawer, toast)
  **200–250ms**; page/section mount fade-up **250ms** (translateY 8px → 0).
- Easing: `cubic-bezier(.2,.8,.2,1)` (ease-out) for enters; `ease-in` for exits.
- Hover: bg/shadow/color transitions only — no layout shift. Press: 1–2px nudge or
  slight darken.
- Skeleton shimmer 1.2s loop. Number counters may tween on first load (≤600ms).
- **prefers-reduced-motion:** disable transforms & shimmer; keep instant opacity.
- Loading: buttons → inline spinner; sections → skeleton; never blank flashes.

---

## 9. ACCESSIBILITY (WCAG 2.2 AA — required)

- Contrast ≥4.5:1 text, ≥3:1 large text/UI. Verify muted text on tinted surfaces.
- Semantic landmarks: `<nav> <header> <main> <aside>`. One `<h1>` per page; logical
  heading order.
- All controls keyboard-reachable; visible focus ring (2px `--pri`, 2px offset) — never
  remove outlines without replacement.
- Icon-only buttons: `aria-label`. Inputs: `<label for>` + errors via
  `aria-describedby` + `aria-invalid`.
- Modals: focus trap, `Esc` closes, return focus to trigger, `role="dialog"
  aria-modal`. Menus/tabs: Radix or equivalent ARIA patterns.
- Status not by color alone (add icon/text). Live regions for toasts (`aria-live`).
- Respect reduced motion. Charts: provide accessible table/`aria-label` summary.

---

## 10. CONTENT & DATA (use realistic samples, never lorem ipsum)

- Business: "Summit Dental Studio". Locations: Downtown, Westside, Northgate.
- Reviewers: real-sounding names + initials avatars. Sources: Google, Yelp, Facebook.
- Numbers: Avg rating 4.7, 1,284 reviews, 92% response rate, NPS 68, 820/1,000
  requests sent. Dates relative ("2h ago", "Yesterday", "Mar 14").
- Review snippets: believable ("Front desk was incredibly helpful and the cleaning was
  painless.").
- Voice: warm, plain, confident. Buttons are verbs ("Request reviews", "Send invites").
  No jargon, no emoji in UI.

---

## 11. PAGE-BY-PAGE LAYOUT SPEC

> Each page: purpose · layout (grid/columns) · sections top→bottom · components used ·
> responsive collapse · states. All authed pages render inside the App Shell (§1, §4).

### 11.1 Auth (Login / Sign up / Forgot / Reset) — NO app shell
- Frame: full viewport, `--bg-2`. Centered column, brand mark (32px) above an
  AuthCard (`--surface`, radius 16, shadow md, width 400, padding 32).
- Optional split: ≥lg two-column — left 5-star testimonial panel on `--pri-900`
  gradient-free solid with a quote + avatar; right the AuthCard. Below lg the panel
  hides.
- Login sections: title H2 → email Input → password Input (show/hide toggle) → row
  (Remember toggle | Forgot link) → primary Button full-width → "or" divider →
  Google secondary Button → footer Caption "New here? Create account".
- Sign up adds name + business name + password strength bar + terms Caption.
- Forgot: email → Send (full-width) → success card (check icon, "Check your email").
- Reset: new + confirm password → Save → success → redirect note.
- States: inline validation on blur, submit disabled until valid, button loading,
  auth-error banner (`--danger` bg) at top of card.

### 11.2 Onboarding wizard — focused, NO sidebar
- Frame: `--bg`, top progress bar (3 segments, current `--pri`), centered card
  (width 560), Back (ghost) + Continue (primary) footer, "Skip" ghost link.
- Step 1 Connect: 3 platform cards in a row (stack on mobile), each logo + benefit +
  Connect→Connected(check) button; ≥1 required.
- Step 2 Business: 2-col form (name, category | address full-width | phone, website),
  map placeholder.
- Step 3 Team: repeatable rows (email Input + role Select + remove icon), "Add
  another", Send invites.
- Finish: centered success card (large check, H2, Body, "Go to dashboard" primary).
- States: per-step validation, Continue disabled until valid, connect/send loading.

### 11.3 Dashboard
- Header row: left H1 "Good morning, [name]" + Body-muted business name; right
  DateRangePicker + "Request reviews" primary.
- Grid (12-col):
  - KPI row: 4 StatCards, 3 cols each (→ 2×2 at md → 1×4 at base).
  - Main split: left 8 cols = Rating-trend Card (area chart, ~320px tall) stacked over
    a 2-up row (Volume-by-source donut Card + Sentiment-split Card). Right 4 cols =
    "Recent reviews" Card (scrollable list of 6 rows: avatar, name, SourcePill,
    StarRating, snippet 1-line, time-ago, "Needs reply" badge) + "View all" link.
  - Full-width: "Active campaigns" summary Card (name, sent/opened/converted
    tabular-nums, status chip, manage link).
- Responsive: right column drops below the charts under lg; KPIs reflow as above.
- States: skeletons per card; first-run empty state (illustration + "Connect a
  platform to see your reputation" CTA).

### 11.4 Reviews Inbox — master/detail
- Layout ≥lg: left list pane fixed **380px**, right detail pane fills. Below lg: list
  full-width → tap row → detail view with back arrow.
- Toolbar (sticky, above panes): search Input (grow) + filter chips (Source, Rating,
  Status, Date) + sort Select + segmented "All / Needs reply / Flagged".
- List pane: rows height ~84 (avatar 40 | name + SourcePill + StarRating | snippet
  1-line `--text-muted` | time-ago top-right | unread dot + "Needs reply" badge).
  Checkbox on hover/selection; selected row `--pri-50` left-border 2px `--pri`. Sticky
  bulk bar appears on selection (count + Mark replied / Flag / Assign / clear).
- Detail pane: header (avatar, name, SourcePill, StarRating, date, "Open on Google"
  link, ⋯ menu) → full review text (Body-lg) → divider → reply composer: tone Select +
  "Suggest reply" button → AI draft in `--pri-50` box (editable, Insert/Regenerate) →
  Textarea → char/SMS counter → footer (Save draft ghost | Send primary). Reply
  history above composer if exists.
- States: skeletons (list + detail), empty list state, "Select a review" placeholder
  in detail, send loading + success toast, error.

### 11.5 Campaigns (List / Builder / Analytics)
**List:** Header H1 + "New campaign" primary. Table: Name | Channel chips | Status
chip | Audience (num) | Sent | Open % | Reviews | Updated | ⋯. Row click → analytics.
Empty state CTA.
**Builder:** Two-column ≥lg — left form (max 640), right sticky LivePreview (phone
frame for SMS / email frame for Email). Form as 4 stacked Card sections (or stepper):
(1) Basics: name, channel segmented. (2) Audience: source/list/upload + filter, live
"≈ 312 recipients" caption. (3) Message: template Textarea with merge-tag chips
({{first_name}} etc.), tone presets, "Improve with AI" ghost; email adds subject +
block list; SMS shows segment/char count; preview updates on input. (4) Schedule: send
now / datetime / drip-delay radio. Sticky footer: Save draft | Send test | Schedule
(confirm modal showing recipients + time). Preview drops below form under lg.
**Analytics:** KPI row (Sent/Delivered/Opened/Clicked/Reviews) → horizontal funnel
(5 stages with conversion %) → delivery-over-time line → recipients Table (name,
contact, status chip, sent time).

### 11.6 Sentiment Monitoring
- Header: H1 + DateRangePicker + source chips.
- Summary row: 3 StatCards (Positive/Neutral/Negative %, delta, semantic accent) +
  overall sentiment score (big number + gauge).
- Full-width: Sentiment-over-time stacked area (3 bands), hover tooltip with counts.
- Two-col ≥lg: left "Themes & keywords" Card — ranked list rows (theme name, mention
  count, sentiment chip, sparkline, expand → example snippets). Right "By source" Card
  — horizontal bars per platform + SourcePills.
- Alert rules Card (full-width): list of rules (condition text + toggle + edit/delete)
  + "New alert rule" → modal (metric Select, operator, threshold, window, channel
  Email/SMS).
- States: skeletons, "Not enough data yet" empty state, modal validation.

### 11.7 Analytics & Reports
- Header: H1 + DateRangePicker + "Compare to previous" toggle + location filter +
  Export menu (PDF/CSV) + "Schedule report".
- KPI row: 5 StatCards with period-over-period deltas.
- Charts grid (2-col ≥lg, 1-col below): Rating trend (line) | Review volume (bar) |
  Volume by source (stacked) | Response-time distribution (histogram) | Reviews vs
  requests (dual line). Comparison overlay (dashed prior period) when toggle on.
- Breakdown Table (full-width): by location or source — Name | Rating | Reviews |
  Response rate | Avg response time | trend sparkline; sortable.
- Schedule-report modal: frequency, recipients (multi-email), format, include-checklist.
- Print-friendly variant for PDF (hide controls, stack charts, brand header).

### 11.8 Widgets / Showcase — configurator (two-pane)
- Left controls panel (360, scroll): Widget-type gallery (5 thumbnails: Carousel,
  Grid, Wall, Floating badge, Rating-summary) → Style accordion (Theme segmented,
  Accent color swatch, Radius slider, toggles for photo/date/source, Min-rating
  Select, Source filter chips, Max-reviews stepper, Autoplay). Right preview pane:
  device toggle (desktop/mobile) + the live widget rendered on a neutral mock-site
  frame, updating instantly.
- Below preview: Embed Card — code box (mono, `--surface-3`) with generated
  `<script>`/iframe + "Copy code" (copied toast) + install steps + "Email to developer".
- Saved widgets: small Table (name, type, created, edit/duplicate/delete).
- Responsive: preview stacks under controls below lg.

### 11.9 Locations (List / Detail)
**List:** Header + "Add location" primary. Summary strip: 3 mini-stats (Total
locations, Group avg rating, Lowest performer callout). Cards grid (3-col ≥lg → 2 →
1): each card = name, address Caption, status chip, avg rating + StarRating, total
reviews, response rate, connected-source glyph row. Row → detail.
**Detail:** Header with location switcher Select + breadcrumb. Tabs: Overview
(mini-dashboard: KPIs + recent reviews + trend) | Profile (form: name/address/phone/
hours/category/map) | Sources (per-platform connect status) | Team (assigned members)
| Campaign defaults (default template). Add/edit via right Drawer with validation.

### 11.10 Team & Roles
- Header + "Invite member" primary + search.
- Members Table: Avatar+Name+Email | Role chip | Locations chips/"All" | Status
  (Active/Invited/Suspended dot) | Last active | ⋯ (Edit role, Resend, Remove). Pending
  invites row tint `--surface-2` + dashed "Invited" chip.
- Invite Drawer: multi-email Input, Role Select (each option with access description),
  location assignment checklist, Send (loading) + success toast.
- Permissions matrix Card: Table rows = capabilities (View reviews, Reply, Manage
  campaigns, Manage billing, Manage team, Manage settings) × columns = roles; cells
  check/dash. Read-only for default roles.
- Remove-member confirm modal (danger). Table → stacked cards on mobile.

### 11.11 Integrations
- Header: H1 + search + category chips (All / Review platforms / Messaging / CRM /
  Automation). Connected summary strip (X connected · Y need attention warning).
- Cards grid (3→2→1): logo (40) + name (H3) + 1-line desc + state control:
  not-connected = Connect (primary-outline); connected = green "Connected" chip +
  "Synced 5m ago" caption + ⋯ (Configure/Sync now/Disconnect); needs-attention = amber
  "Reconnect". Include Google, Yelp, Facebook, Twilio, SendGrid/Mailgun, Zapier,
  HubSpot, Webhook, + dashed "Request an integration" card.
- Configure Drawer: connection details, synced-locations checklist, sync-frequency
  Select, "Test connection" button (result chip), Disconnect (danger confirm).
- States: skeleton grid, no-search-results, connect loading + success toast.

### 11.12 Settings — sub-nav + content
- Layout ≥lg: left sub-nav (200, sticky: Profile, Business profile, Branding,
  Notifications, Review settings, Danger zone) + right content (max 720). Below lg:
  sub-nav becomes a top tab bar / Select.
- Each section = stacked Cards with grouped fields + helper Captions. Sticky bottom
  Save bar appears only on dirty state (Discard ghost | Save primary).
- Profile: avatar upload, name, email, change-password subcard, 2FA toggle.
- Business profile: name, category, address, phone, website, hours editor, timezone,
  default review link (copy button).
- Branding: logo upload (preview), brand color picker (drives widgets+emails), sender
  name + reply-to, footer text, live branded-email mini-preview.
- Notifications: matrix Table — events × channels (Email/SMS/In-app) toggles.
- Review settings: min auto-publish rating Select, smart-routing toggle (low ratings →
  private feedback form), auto-reply templates list.
- Danger zone: Card with `--danger` accent — Export data button + Delete account
  (type-to-confirm modal).
- States: field validation, "Saved" toast, skeleton, destructive confirm.

### 11.13 Billing
- Current-plan Card (full-width): plan name (H2) + price/cycle + renewal date + "Manage
  plan"/"Upgrade" primary + "Switch to annual –20%" secondary. Trial/past-due banner
  above (warning/danger) when relevant.
- Usage Card: ProgressMeters (Review requests 820/1,000, SMS credits, Locations 3/5,
  Seats) — amber ≥80%, red over-limit + upgrade nudge.
- Plan comparison: 3 columns (Starter/Growth/Scale), monthly/annual toggle on top,
  feature checklist rows, current plan highlighted (2px `--pri` border + "Current"
  chip), per-plan CTA. Stacks on mobile.
- Payment method Card: card brand glyph + •••• 4242 + expiry + "Update" (modal),
  billing email, billing address.
- Invoices Table: Date | Amount (tabular-nums) | Status chip (Paid/Open/Failed) |
  Download PDF; pagination.
- Modals: upgrade/downgrade confirm (shows proration + new total), update-card,
  cancel-plan (retention message + danger confirm).

### 11.14 System / Utility
- **404:** centered, big "404" Display, friendly line, "Back to dashboard" primary.
- **500 / error boundary:** reassuring copy, Retry + Contact support.
- **⌘K command palette:** centered overlay (width 560, shadow lg), search Input +
  grouped results (Navigation, Recent reviews, Quick actions: "Request reviews",
  "Invite teammate"), keyboard nav + empty state.
- **Notifications panel:** dropdown/drawer from bell — grouped (Today/Earlier) rows
  (icon, text, time, unread dot), "Mark all read", empty state.
- **Account menu:** avatar dropdown (name+email header, Profile, Settings, Billing,
  Theme toggle, Sign out).
- **Maintenance / coming-soon:** centered brand mark + message.

---

## 12. DELIVERY EXPECTATIONS

1. **Theme layer first:** all tokens as CSS variables + Tailwind config + base
   typography + focus-ring utility. Light mode now; structure tokens so a dark set can
   be added later.
2. **Component library second:** every component in §6, typed, with documented props
   and all states; plus a kitchen-sink page demonstrating each state.
3. **Pages third:** build §11 in order, each self-contained, consuming shared
   components only — never redefine a primitive per page.
4. **Verify** at 1440 / 1280 / 1024 / 768 / 375; check keyboard nav, focus order,
   contrast, and reduced-motion on representative pages.
5. **Consistency over novelty:** identical spacing, radius, shadow, and color usage
   across all pages. When a spec gap appears, follow the nearest rule here, document
   the assumption, and keep it consistent.
```

This brief is exhaustive on purpose — hand it over whole, or have devs read §0–§10
once and then work page-by-page from §11.
