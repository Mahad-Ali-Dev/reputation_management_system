# RepuLabs UI Redesign — Codex Kickoff

You (Codex) have full access to this codebase. Follow this plan exactly.
**Goal: produce VISUAL PREVIEWS of a new clean UI for human review BEFORE touching
any production code.**

---

## Source of truth
- Design spec (read in FULL first): `tasks/repulabs-ui-prompts/DESIGN-SPEC-handoff.md`
- It defines: color tokens, typography ramp, spacing, grid/breakpoints, component
  anatomy (with px), responsive rules, motion, a11y, and a per-page layout spec (§11).
- Sample/mock data to use: spec §10.

## Hard guardrails (do not violate)
1. **Do NOT modify existing production pages, routes, auth, DB, or API wiring** in
   this phase. UI preview only.
2. Build previews in an **isolated route group**: `app/(design-preview)/`.
3. Use **hardcoded mock data** only (spec §10). No live DB, no network calls.
4. **Reuse existing files** where they already exist (e.g. `app/globals.css`, our
   component directory) — extend, don't fork into parallel copies.
5. Use the **exact** tokens, type ramp, spacing, and component specs. No invented
   colors or fonts.
6. After each chunk, run typecheck/build to self-verify; report results.

## Tech
React + TypeScript + Tailwind, lucide-react icons, recharts for charts, Radix for
menus/dialogs/tabs. Light mode now; structure tokens so dark mode can be added later.

---

## Phase 1 — Foundation (do this first, then STOP for review)
1. Theme layer: all tokens from spec §3 as CSS variables + Tailwind config, base
   typography (§4), focus-ring utility.
2. Shared component library from spec §6 (Button, Input, Card, StatCard, Badge,
   Table, Tabs, Modal, Drawer, DropdownMenu, Tooltip, Toast, Avatar, StarRating,
   SourcePill, EmptyState, Skeleton, Pagination, DateRangePicker, ProgressMeter),
   each with all states.
3. A kitchen-sink preview page at `app/(design-preview)/kitchen-sink/` rendering
   every component in its key states.
4. Screenshot it (see Screenshots below) → `tasks/redesign-preview/00-kitchen-sink.png`.
5. **Stop and report.** List the image path(s). Wait for approval before Phase 2.

## Phase 2 — Pages (one at a time, screenshot each)
Build each as its own preview page under `app/(design-preview)/<name>/` using the
shared components, following the matching spec §11 section. After each, screenshot and
add to `tasks/redesign-preview/`. Order:

1. dashboard (§11.3)
2. reviews-inbox (§11.4)
3. campaigns — list + builder + analytics (§11.5)
4. sentiment (§11.6)
5. analytics (§11.7)
6. widgets (§11.8)
7. locations — list + detail (§11.9)
8. team (§11.10)
9. integrations (§11.11)
10. settings (§11.12)
11. billing (§11.13)
12. auth (§11.1) + onboarding (§11.2)
13. system pages — 404, command palette, notifications, account menu (§11.14)

Do them in batches of 2–3, screenshot, then pause so the human can review images and
give feedback before continuing.

## Screenshots
- Reuse existing screenshot tooling in this repo if present (check `.pdf-build/` and
  `scripts/` — there are seed/session/shoot scripts). Otherwise add a small Playwright
  script under `scripts/` that loads each preview route and captures PNGs.
- Capture each page at **1440px** wide. Also capture **375px** (mobile) for: dashboard,
  reviews-inbox, billing.
- Output naming: `tasks/redesign-preview/<NN>-<name>[-mobile].png`.

## Iterate loop
Human reviews PNGs → gives change requests → you adjust the preview component/page →
re-screenshot → repeat. Keep all changes inside the preview group.

## Phase 3 — Promotion (only after human approves the previews)
Migrate the approved tokens, components, and page layouts into the real app pages,
preserving existing data wiring and behavior. One page per PR/commit. Then remove the
`(design-preview)` group.

---

## How the human will start you
> "Read tasks/repulabs-ui-prompts/KICKOFF.md and do Phase 1."
Then, after reviewing images:
> "Phase 2, screens 1–3."  ... and so on.
