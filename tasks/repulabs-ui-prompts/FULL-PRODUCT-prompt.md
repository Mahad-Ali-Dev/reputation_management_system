# RepuLabs — FULL PRODUCT UI Prompt (every page, single prompt)

> One comprehensive, ready-to-use prompt. Paste into v0 / Lovable / Cursor / Claude.
> Designs the entire product: design system + shared components + every page.

---

# ROLE
You are a senior product designer + front-end engineer who builds SaaS interfaces
that win Awwwards and get featured on Mobbin — the calibre of Linear, Vercel,
Stripe, Raycast, and Attio. You design with restraint: generous whitespace, a tight
type scale, near-invisible hairline borders, soft layered shadows, and motion that
clarifies rather than decorates. You ship pixel-perfect, accessible, production-ready
React + TypeScript + Tailwind CSS, with a single consistent design system applied to
every screen.

# PRODUCT
RepuLabs is a B2B reputation-management SaaS for local businesses (dental, med-spa,
home services, restaurants, clinics). It collects and showcases reviews, monitors
brand sentiment across Google / Yelp / Facebook, automates review-request campaigns
over SMS + email, and reports analytics. Users are busy, non-technical owners and
office managers. The UI must feel calm, trustworthy, premium, and effortless — never
cluttered, loud, or enterprise-heavy.

Tone: confident, clean, quietly powerful. NOT playful, NOT corporate-stiff.

---

# 1) COLOR SYSTEM — use these EXACT tokens, never invent colors
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
  --border:        rgba(16,24,40,.08)   hairline, barely visible
  --border-strong: rgba(16,24,40,.14)   inputs, dividers needing presence
Semantic (desaturated, status-only — blue stays the one "loud" color):
  --success #16a34a / bg #ecfdf3 · --warning #d97706 / bg #fffaeb · --danger #dc2626 / bg #fef3f2
Rating gold: #f5a623 filled / #e6e8eb empty.
Never: pure black (#000), heavy/long shadows, saturated non-brand fills, gradients
on text, more than one accent hue per screen.

# 2) TYPOGRAPHY
Typeface: one geometric/grotesk sans — Inter or Geist, system-ui fallback.
  font-family: "Inter", ui-sans-serif, system-ui, -apple-system, sans-serif;
Scale (px / weight / tracking / line-height):
  Display 44 / 700 / -0.03em / 1.05   marketing & big empty states
  H1      30 / 600 / -0.02em / 1.15    page titles
  H2      24 / 600 / -0.02em / 1.2     section headers
  H3      18 / 600 / -0.015em / 1.3    card titles
  Body-lg 16 / 400 / -0.01em / 1.5     lead paragraphs
  Body    14 / 400 / 0 / 1.5           default UI text
  Label   13 / 500 / 0 / 1.4           form labels, table headers (UPPERCASE + 0.04em + --text-muted)
  Caption 12 / 400 / 0 / 1.4           meta, timestamps, helper text
Numerals: tabular-nums for ALL metrics, tables, money, usage.
Rules: hierarchy from size + weight + color only. No decorative/serif fonts. Body is
--text-muted; headings are --text. Max ~70ch line length.

# 3) SHAPE, SPACING, ELEVATION
Radius: 8px default; 12–16px large cards/modals; 9999px pills (badges/chips/avatars/toggles).
Spacing: strict 8px grid (4 8 12 16 24 32 48 64). Lean generous. Card padding 20–24.
  Section gaps 32–48.
Shadows (layered, soft):
  sm 0 1px 2px rgba(16,24,40,.04)
  md 0 1px 2px rgba(16,24,40,.04), 0 8px 24px rgba(16,24,40,.06)
  lg 0 1px 2px rgba(16,24,40,.04), 0 16px 40px rgba(16,24,40,.08)   modals/popovers
Resting cards: border + sm shadow. Reserve md/lg for floating layers.

# 4) APP SHELL (used by all authed pages)
- Left sidebar (240px): --surface, right hairline. Logo top; nav groups with
  Label-style group headers; account block pinned bottom. Active item = --pri-50 fill,
  8px radius, --pri icon+text, 500 weight. Hover = --surface-3. Collapses to off-canvas
  drawer under 768px (hamburger in top bar).
  Nav: Dashboard · Reviews · Campaigns · Sentiment · Analytics · Widgets · Locations ·
       Integrations · Team · Settings · Billing.
- Top bar (64px): --surface, bottom hairline. Global search (⌘K), contextual
  date-range picker, notifications bell (dot), avatar menu.
- Content: max-width 1280px, centered, 32px gutters, --bg canvas.

# 5) MOTION
150–250ms ease-out on hover/press; gentle 8px fade-up on mount; 1.2s skeleton shimmer
on load; 200ms modal/drawer fade+scale. Respect prefers-reduced-motion (opacity only).
No bounce, parallax, or decorative animation inside the app.

# 6) ACCESSIBILITY (non-negotiable)
WCAG 2.2 AA contrast. Semantic HTML. aria-labels on icon-only buttons. Full keyboard
nav + logical focus order. Visible focus-visible ring: 2px --pri, 2px offset. Fields
linked to <label> + error via aria-describedby. Respect reduced motion.

# 7) TECH
React + TypeScript functional components. Tailwind with tokens defined once in a theme
layer. No heavyweight UI kit (Radix primitives OK for menus/dialogs/tabs a11y). Icons:
lucide-react only — no emojis. Charts: recharts (or lightweight equiv). Realistic
reputation-management data everywhere — no lorem ipsum.

---

# 8) SHARED COMPONENT LIBRARY (build FIRST, reuse on every page)
Each typed + reusable, with all states (default / hover / focus-visible / active /
disabled / loading / error where applicable):
AppShell · Button (primary/secondary/ghost/danger/icon; sizes sm/md/lg; loading) ·
Input · Textarea · Select · Toggle · Checkbox · Radio · SegmentedControl ·
Card (+header/body/footer) · StatCard (label/value/delta/sparkline) ·
Badge/Chip (neutral + semantic + source-platform) · Tabs ·
Table (sortable header, row hover, selection, pagination) · Modal · Drawer ·
DropdownMenu · Tooltip · Toast · Avatar (+stacked group) · StarRating (display +
interactive) · SourcePill (Google/Yelp/Facebook glyph) · EmptyState · Skeleton ·
Pagination · DateRangePicker · ProgressMeter.

---

# 9) PAGES — design EVERY page below, consistently, using the shared library
For each page include all states: default · hover · focus-visible · active · disabled ·
loading (skeleton) · empty · error. Use believable domain data throughout.

## A. PUBLIC / AUTH (no app shell — centered on --bg-2)
A1. Login — email, password, remember toggle, forgot link, primary Sign in, "Continue
    with Google", footer to sign up. Inline validation + loading.
A2. Sign up — name, business name, email, password (strength hint), terms caption,
    Google option, footer to login.
A3. Forgot password — email → "Send reset link" → success confirmation state.
A4. Reset password — new password + confirm, success → go to login.
A5. Optional right-side 5-star testimonial panel on ≥1024px (collapses on mobile).

## B. ONBOARDING (focused full-screen, slim 3-step progress)
B1. Connect platforms — Google/Yelp/Facebook cards with Connect → Connected (check).
B2. Add business — name, category, address (map placeholder), phone, website.
B3. Invite team — repeatable email + role rows, Send invites / skip.
B4. Success card → "Go to dashboard".
Per-step validation, Continue disabled until valid, connect/send loading.

## C. DASHBOARD (home)
Header: greeting + business name, date-range, "Request reviews" CTA.
- KPI row (4 StatCards w/ delta + sparkline): Avg Rating 4.7★, Total Reviews 1,284
  (+6%), Response Rate 92%, NPS 68.
- Rating trend (line/area). Volume by source (stacked/donut + SourcePills).
- Sentiment split bar. Recent reviews feed (avatar, name, SourcePill, StarRating,
  snippet, time-ago, "Needs reply"). Active-campaign summary card.
Two-col grid → one col under 1024px. Skeletons + first-run empty state.

## D. REVIEWS INBOX (two-pane workspace)
- Toolbar: search, filter chips (Source/Rating/Status/Date), sort, "All / Needs reply
  / Flagged" segmented control.
- List pane: rows w/ avatar, name, SourcePill, StarRating, snippet, time-ago, unread
  dot + "Needs reply" badge; checkbox + sticky bulk-action bar (Mark replied/Flag/Assign).
  Selected row = --pri-50.
- Detail pane: full review (reviewer/source/rating/date, link to source), full text,
  reply composer with textarea, AI-suggested-response button (draft shown in --pri-50
  box, editable), tone selector, char/SMS hint, Send / Save draft, reply history.
Skeletons (list + detail), empty list + no-selection placeholder, error. Panes stack
to list→detail nav on mobile.

## E. CAMPAIGNS (3 views)
E1. List — "New campaign" CTA; rows: name, channel chips (SMS/Email), status
    (Draft/Scheduled/Active/Completed), audience, sent, open rate, conversion, date;
    row actions (edit/duplicate/pause/archive). Empty state.
E2. Builder — form + LIVE PREVIEW (phone for SMS / email frame):
    (1) Basics: name, channel segmented. (2) Audience: source list/upload/filter,
    estimated recipients. (3) Message: template editor w/ merge tags
    ({{first_name}},{{business}},{{review_link}}), tone presets, AI "improve" button;
    email adds subject + blocks; SMS char/segment count; preview updates live.
    (4) Schedule: now / date-time / drip delay. Sticky footer: Save draft · Send test
    · Schedule/Send (confirm modal).
E3. Analytics — KPI row (Sent/Delivered/Opened/Clicked/Reviews) + horizontal funnel +
    delivery-over-time line + recipients table w/ per-row status.

## F. SENTIMENT MONITORING
Header: date-range + source chips. Summary row: Positive/Neutral/Negative StatCards
(% + delta, semantic color) + overall score. Sentiment-over-time stacked area.
Themes & keywords ranked list (mention count, sentiment chip, sparkline; expand to
example snippets). Source breakdown bars. Alert rules card (toggle + "New alert rule"
modal: condition + threshold + channel). Skeletons + not-enough-data empty state.

## G. ANALYTICS & REPORTS
Header: date-range, "Compare to previous period" toggle, location filter, Export
(PDF/CSV), "Schedule report". Headline KPIs w/ period-over-period deltas. Charts grid
(rating trend, volume over time, volume by source, response-time distribution, reviews
vs requests) with comparison overlay. Leaderboard/breakdown table (by location/source,
sortable, inline sparkline). Schedule-report modal (frequency, recipients, format,
include checklist). Print-friendly PDF layout. Skeletons + empty state.

## H. WIDGETS / SHOWCASE (configurator)
Widget-type gallery (Carousel, Grid, Wall, Floating badge, Rating-summary badge).
Style controls: theme, accent, radius, show/hide photo/date/source, min-rating filter,
source filter, max reviews, autoplay. Live preview in a mock website frame with
desktop/mobile toggle, updates instantly. Embed panel: generated <script>/iframe in a
code box + "Copy code" (copied toast) + install instructions. Saved-widgets list
(edit/duplicate/delete). Skeleton + empty state.

## I. LOCATIONS (multi-location)
I1. List — "Add location" CTA + search; summary strip (total locations, group avg
    rating, lowest performer). Cards/table: name, address, status chip, avg rating +
    StarRating, total reviews, response rate, connected-source icons. Row → detail.
I2. Detail — tabbed: Overview (mini-dashboard), Profile (name/address/phone/hours/
    category/map), Connected sources, Team, Campaign defaults. Location switcher +
    breadcrumbs. Add/edit-location drawer w/ validation. Skeletons + empty state.

## J. TEAM & ROLES
"Invite member" CTA + search. Members table: avatar+name+email, role chip
(Owner/Admin/Manager/Staff), assigned locations chips, status (Active/Invited/
Suspended), last active, row actions (edit role/resend/remove); pending invites
visually distinct. Invite drawer: multi-email, role select w/ access descriptions,
location assignment, Send (validation + loading). Roles & permissions matrix
(capabilities × roles, check/dash). Remove-member confirm modal + toasts. Table →
stacked cards on mobile.

## K. INTEGRATIONS
Header: search + category chips (Review platforms/Messaging/CRM/Automation). Connected
summary strip (count + "needs attention" warning). Cards grid w/ logo, name, desc, and
state-driven control: Not connected → Connect; Connected → green chip + last-sync +
⋯ menu (Configure/Sync now/Disconnect); Needs attention → amber Reconnect. Include
Google/Yelp/Facebook/Twilio/Mailgun/SendGrid/Zapier/HubSpot/Webhook + "Request
integration" card. Configure drawer: details, synced locations, sync frequency, test
connection, disconnect (danger confirm). Skeleton + no-results state + connect toast.
Grid 3→2→1.

## L. SETTINGS (left sub-nav + content; sticky Save bar on dirty state)
Profile (name/email/avatar/password/2FA) · Business profile (name/category/address/
phone/website/hours/timezone/review link) · Branding (logo upload, brand color picker
driving widgets+emails, sender name/reply-to, footer; live branded-email mini-preview)
· Notifications (matrix: New review/Negative review/Weekly report/Campaign completed ×
Email/SMS/In-app) · Review settings (min auto-publish rating, smart routing low→
private feedback, auto-reply templates) · Danger zone (export data, delete account
confirm-by-typing). Field validation, saved toast, skeleton, destructive confirm.
Sub-nav → top tabs/select on mobile.

## M. BILLING
Current-plan card (plan, price, cycle, renewal, limits; Upgrade + "annual save 20%";
trial/past-due banners). Usage meters w/ tabular-nums (Requests 820/1,000, SMS
credits, Locations 3/5, Seats); near-limit amber, over-limit red + nudge. Plan
comparison (Starter/Growth/Scale, feature checklist, current highlighted w/ --pri
border, monthly/annual toggle, per-plan CTA). Payment method (brand+last4+expiry,
Update card modal, billing email/address). Invoices table (date/amount/status chip/
download PDF + pagination). Modals: upgrade/downgrade confirm (proration + new total),
update-card, cancel-plan (retention-aware destructive confirm). Skeletons + empty
invoices + banners.

## N. SYSTEM / UTILITY PAGES (don't forget these)
N1. 404 Not found — friendly, on-brand, back-to-dashboard CTA.
N2. 500 / error boundary — reassuring, retry + contact support.
N3. Empty global search results + ⌘K command-palette overlay (recent, quick actions).
N4. Notifications panel/dropdown (grouped: new review, negative alert, campaign done,
    teammate joined; mark all read; empty state).
N5. Account/avatar menu (profile, settings, billing, theme, sign out).
N6. Maintenance / coming-soon placeholder.

---

# 10) OUTPUT FORMAT
1. Design rationale (6–8 sentences: philosophy, hierarchy, why it reads premium).
2. Theme layer (globals.css / tailwind config) defining every token + base type +
   focus-ring utility.
3. Shared component library (typed, documented props), then a kitchen-sink page.
4. Every page A–N as its own complete, self-contained component with realistic data
   and all states, in the order listed.
5. A short "states & assumptions" note per page.

Build foundation + components first, then pages in order. Keep every page visually and
structurally consistent — reuse the exact same primitives, spacing, and tokens; do not
redefine components per page. White space is a feature: if a section feels busy, remove
something. Where a page's data or purpose is genuinely ambiguous, make the sensible
premium-SaaS choice and note the assumption rather than stopping.
