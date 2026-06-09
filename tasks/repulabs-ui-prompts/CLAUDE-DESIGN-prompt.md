# RepuLabs — Claude Design Prototype Prompts

For **Claude Design** (claude.ai design tool / "Claude Design by Anthropic Labs").
It generates visual, clickable prototypes from a text description — no codebase
access. Use these to preview the RepuLabs UI in the browser.

## How to use (in order)
1. Open Claude Design → top-right **"Set up design system"** → paste **PART A** below.
   This makes every prototype use the right colors/typography automatically.
2. New prototype → pick **High fidelity** → name it `RepuLabs App` → Create.
3. In the prototype, paste **PART B** (the full app prompt) to generate the core
   screens with working navigation.
4. To refine or add a screen, paste any **PART C** snippet.

---

## PART A — Design system setup
> Paste into "Set up design system".

Design system name: RepuLabs.
Style: clean, premium, minimal SaaS — like Linear, Stripe, and Attio. Calm,
trustworthy, lots of whitespace, hairline borders, soft layered shadows, one accent
color. Light mode.

Colors:
- App background: #fbfaf6 (warm off-white). Secondary tint band: #f4f8f5.
- Surfaces (cards, panels, sidebar, top bar, modals): #ffffff.
- Subtle fill / hover / skeleton: #f3f5f0.
- Primary brand (only saturated color — CTAs, active nav, links, focus): #2457ff.
  Tint: #eff6ff. Hover/pressed: #1b3fd1.
- Text: headings #1a1f2e, body #5b6472, muted/meta #8a929e.
- Borders: very light hairlines, rgba(16,24,40,0.08).
- Status (use only for status, desaturated): success #16a34a on #ecfdf3,
  warning #d97706 on #fffaeb, danger #dc2626 on #fef3f2. Rating star #f5a623.

Typography:
- Font: Inter (or Geist). Headings semibold (600), tight letter-spacing.
- Sizes: page title 30, section header 24, card title 18, body 14, label 13,
  caption 12. Use tabular figures for all numbers, metrics, and money.
- Hierarchy from size + weight + color only. No decorative fonts.

Shape & spacing:
- Corner radius: 8px controls/buttons, 12px cards, 16px modals, pills for chips/badges.
- 8px spacing grid, generous spacing (prefer 24–32px gaps). Card padding 24.
- Shadows soft and subtle, never harsh. Never pure black.

Components: buttons (primary blue / secondary outline / ghost), inputs with labels,
cards, KPI stat cards with a delta and tiny sparkline, status badges/chips, sortable
tables, tabs, modals, drawers, dropdown menus, toasts, avatars, 5-star ratings,
platform pills (Google/Yelp/Facebook), empty states, skeleton loaders, progress bars.
Icons: simple line icons (Lucide style), no emoji.

---

## PART B — Full app prototype
> Paste into the High-fidelity prototype after creating it.

Build a high-fidelity, clickable prototype for **RepuLabs**, a reputation-management
SaaS for local businesses. It collects and showcases reviews, monitors sentiment
across Google/Yelp/Facebook, runs SMS + email review-request campaigns, and reports
analytics. Users are busy, non-technical business owners and office managers. Make it
feel calm, premium, and effortless. Use realistic demo data for "Summit Dental
Studio" (avg rating 4.7, 1,284 reviews, 92% response rate, NPS 68).

App shell on every screen:
- Left sidebar (white, 240px): logo "RepuLabs" top; nav items Dashboard, Reviews,
  Campaigns, Sentiment, Analytics, Widgets, Locations, Integrations, Team, Settings,
  Billing; account block at the bottom. Active item has a light blue (#eff6ff) fill,
  rounded, with blue text/icon.
- Top bar (white, 64px): global search, date-range picker, notifications bell, avatar.
- Content area on the #fbfaf6 canvas, centered, max 1280px, generous padding.
Make the sidebar links navigate between the screens below.

Screens (clickable):
1. Dashboard — a row of 4 KPI stat cards (Average Rating, Total Reviews, Response
   Rate, NPS), each with a delta and small sparkline; a rating-trend line/area chart;
   a review-volume-by-source donut; a sentiment split bar; a "Recent reviews" list
   (avatar, name, source pill, star rating, one-line snippet, time-ago, "Needs reply"
   badge); and an active-campaign summary card.
2. Reviews Inbox — two panes: left a filterable list of reviews (search + filter chips
   for source/rating/status), right a detail panel with the full review and a reply
   box that includes an "AI-suggested response" shown in a light blue box you can edit,
   plus Send and Save draft buttons.
3. Campaigns — a table of campaigns (name, channel chips SMS/Email, status, audience,
   sent, open rate, reviews) with a "New campaign" button; clicking opens a campaign
   builder with a form on the left (channel, audience, message template with merge
   tags, schedule) and a live phone/email preview on the right.
4. Analytics & Reports — headline KPI cards with period-over-period deltas, a grid of
   charts (rating trend, review volume, volume by source), and a sortable breakdown
   table; date-range and Export controls in the header.
5. Settings — a left sub-nav (Profile, Business profile, Branding, Notifications) with
   grouped form cards on the right and a sticky "Save changes" bar.
6. Billing — current-plan card, usage meters (e.g. 820/1,000 review requests sent), a
   3-tier plan comparison with the current plan highlighted in blue, and an invoices
   table.

Include hover states, a visible blue focus ring on inputs/buttons, and make it fully
responsive (sidebar collapses to a drawer on mobile; multi-column layouts stack to one
column). Keep everything visually consistent — same buttons, cards, spacing, and the
single blue accent throughout.

---

## PART C — Add/refine individual screens (paste as needed)
- "Add a Sentiment Monitoring screen: positive/neutral/negative stat cards, a
  sentiment-over-time stacked area chart, a ranked themes & keywords list with mention
  counts and sparklines, and an alert-rules card with toggles."
- "Add a Widgets screen: a gallery of embeddable review-widget styles (carousel, grid,
  wall, floating badge) on the left, a live preview on a mock website on the right, and
  an embed-code box with a Copy button."
- "Add a Locations screen: cards for multiple business locations (name, address, status,
  avg rating, total reviews, response rate) with an 'Add location' button."
- "Add a Team screen: a members table (avatar, name, role chip, status, last active),
  an Invite drawer, and a roles-and-permissions matrix."
- "Add an Integrations screen: a grid of connectable services (Google, Yelp, Facebook,
  Twilio, SendGrid, Zapier, HubSpot) each with Connect / Connected / Reconnect states."
- "Add Auth screens: login, sign up, and forgot-password, centered on the tinted
  background with the RepuLabs logo and a 5-star testimonial panel on the right."
- "Show the loading state for the dashboard using skeleton placeholders."
- "Show the empty state for Reviews Inbox when there are no reviews yet."

## Tips
- High fidelity mode (not Wireframe) gives the polished look you want.
- Generate the core app (PART B) first, review it in the browser, then add screens one
  at a time with PART C so each comes out clean.
- If a screen feels busy, tell it: "add more whitespace and lighten the borders."
- The full written spec (for reference or for Codex) is in
  `DESIGN-SPEC-handoff.md` in this folder.
