# Bug Backlog

Living list of UX bugs, dead buttons, and rough edges found during the
post-deploy walk-through. Triaged by impact. Strike-through means fixed.

Last updated: 2026-05-17

---

## P0 — Blocks user from completing a real task

### ~~Magic-link email looks generic / unbranded~~ ✅ FIXED 2026-05-17
- New template at `lib/email/templates.ts` with proper branded layout
- Hidden preheader, gradient logo mark, brand color tokens, plain-text fallback
- Resend subject changed to "Your sign-in link for Repulabs"

### ~~Logo in marketing TopNav / Footer looked tiny next to wordmark~~ ✅ FIXED 2026-05-17
- `<Logo>` component rebuilt with calibrated wordmark sizing (`size * 0.62`)
- Default size bumped 32 → 36; tightened gap to read as a single logotype
- Marketing top-nav + footer now use the shared component instead of inline `<Image>`

### ~~Dashboard "New request" / "Export" buttons did nothing~~ ✅ FIXED 2026-05-17
- "New request" now `<Link href="/outreach/send">`
- "Export" hidden until export API ships
- Time-range seg (24h/7d/30d/12mo) marked `aria-disabled` — still decorative,
  needs real per-range data loaders (P1)

---

## P1 — Functional gap: button or feature visible but inert

### Time-range segmented controls don't filter
- **Locations:** `/dashboard`, `/hardware`, `/analytics`, probably others
- **What it looks like:** `[ 24h | 7d (active) | 30d | 12mo ]` — clicking does nothing
- **Fix:** wire each tab to a query param (e.g. `?range=30d`), re-query data scoped to that window
- **Effort:** 4–6h to do across the app cleanly (extract a `<RangeFilter>` server component)

### Reviews / Surveys / Phone — many buttons inside `<button type="button">` are stubs
- **17 page files** still contain decorative `type="button"` elements
- **Files:** see grep below — `app/hardware/page.tsx`, `app/login/page.tsx`,
  `app/connections/page.tsx`, `app/support/analytics/page.tsx`,
  `app/establishments/[id]/page.tsx`, `app/dashboard/page.tsx`,
  `app/establishments/new/page.tsx`, `app/surveys/new/page.tsx`,
  `app/subscription/page.tsx`, `app/support/comments/page.tsx`,
  `app/ai/training/page.tsx`, `app/reviews/page.tsx`,
  `app/establishments/page.tsx`, `app/social/posts/form.tsx`,
  `app/outreach/send/form.tsx`, `app/s/[token]/form.tsx`
- **Fix approach:** triage each file — some buttons are real form-submit
  buttons (fine), some are filter/UI chips (fine), some are CTAs that need
  to be `<Link>` or have `onClick`
- **Effort:** 1 day per major surface

### Admin → Tenant detail: no "change plan" or "suspend" buttons
- **Location:** `/admin/tenants/[id]`
- **Currently shows:** Impersonate only
- **Missing:** change plan (trial → pro → suspended), force-cancel subscription, mark as deleted
- **Effort:** 4h (add 3 server actions in `lib/admin/tenants.ts`, render UI)

### Admin → Audit log: filters limited, no CSV export
- **Location:** `/admin/audit`
- **Currently:** filter by org/action/actor only
- **Missing:** date range, pagination, CSV download
- **Effort:** 3h

### `/api/devices/[id]/qr` has no PDF format
- **Status:** PNG/SVG download buttons fixed and work; PDF button removed
- **Fix path (when wanted):** add `pdf-lib` dep, write a template with logo + QR + business name
- **Effort:** 2h

---

## P2 — Polish / nice-to-have

### Empty states across the app feel like nothing happened
- When an org has zero reviews, zero campaigns, zero phone calls — pages
  render an empty table with no "here's what to do next" CTA
- **Fix:** add `<EmptyState>` component with illustration + primary CTA per
  page; ~30 minutes per page

### Loading states
- Most pages have no Suspense skeletons; on slow connections users see a
  blank flash while the server renders
- **Fix:** wrap async page bodies in `<Suspense fallback={<Skeleton />}>`
- **Effort:** 2h

### Toast notifications for server actions
- Server-action submits navigate / refresh silently — no "Saved!" feedback
- **Fix:** wire `react-hot-toast` (or shadcn `Sonner`) + emit toasts from
  client-component wrappers around forms
- **Effort:** 3h

### Error pages
- 404, 500 use Next defaults (ugly)
- **Fix:** add `app/not-found.tsx` and `app/error.tsx` with brand styling
- **Effort:** 1h

### Form validation feedback
- Many forms (outreach send, survey new, etc.) submit and either succeed or
  throw — no inline field-level errors
- **Fix:** use server-action return values + `useFormState` per form
- **Effort:** 1 day across all forms

---

## P3 — Email templates beyond magic-link

We have **one** branded email (magic-link) and templates scaffolded for two
more (team invite, review request). Need to actually wire them up + add:

- [ ] **Daily digest** — `lib/digest/actions.ts` builds the data; needs the email shell
- [ ] **Review notifications** (new 1-star review → instant alert)
- [ ] **Stripe receipt** (currently Stripe sends generic) — wrap with our brand
- [ ] **Survey campaign** — `lib/surveys/actions.ts` has the trigger, needs template
- [ ] **Subscription canceled** confirmation
- [ ] **Trial expiring** reminder (3 days before)

All can extend `lib/email/templates.ts` with the same `emailShell({ ... })`
helper. Each template is ~30 min once you know the data shape.

---

## P3 — Admin polish (not blocking but rough)

### Tenant detail page metadata header
- The `<code>slug</code> · plan PRO · trial ends 2026-05-18 · stripe cus_...`
  row is dense and hard to scan. The chips visually conflict with each other.
- **Fix:** redesign as a 4-card stats strip OR a more spaced inline meta row

### Audit log row formatting
- Mono-font everywhere makes it hard to differentiate columns at a glance
- Long action names (`device.self_service_created`) get cut off on narrow screens
- **Fix:** truncate long actions with tooltip, mix font weights

### Org list "Apply" button next to seg filter
- Looks like a primary action but only re-submits the filter
- **Fix:** auto-apply on segment click (drop the button)

---

## How to work through this

Each P0/P1 item is independently shippable. Recommended cadence:

1. **One session, one P1 item.** Fix it, ship it, verify in browser.
2. After a P0/P1 lands, run `pnpm preflight` locally before pushing.
3. For UX-heavy fixes (empty states, toast notifications), do them in
   batches of ~5 pages so the design language stays consistent.
4. Track progress by striking items in this doc — keeps shipping log-able.

---

## Confirmed working (audited 2026-05-17)

- ✅ `/api/health` returns ok with all 4 deps connected
- ✅ HTTPS + auto-renewal
- ✅ Admin login + impersonation
- ✅ QR code PNG/SVG download
- ✅ All admin server actions wired (upsertFeatureFlag, deleteFeatureFlag,
     saveProviderApp, disableProviderApp, refundHardwareOrder, markShipped)
- ✅ Magic-link sign-in (Resend delivery)
