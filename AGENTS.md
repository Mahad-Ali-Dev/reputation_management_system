# AGENTS.md

Guidance for AI coding agents (Codex, etc.) working in this repository.

## UI / design system
All UI work MUST follow the design spec:
**`tasks/repulabs-ui-prompts/DESIGN-SPEC-handoff.md`**

- Use the exact color tokens, typography ramp, spacing scale, grid/breakpoints, and
  component anatomy defined there. Do not invent colors or fonts.
- Reuse the shared component library — never redefine primitives per page.
- Match the per-page layout specs in §11 when building or refactoring screens.
- Keep all changes consistent across pages (same spacing, radius, shadow, color usage).

For an active redesign, see the step-by-step plan in
`tasks/repulabs-ui-prompts/KICKOFF.md` (preview-first: build in `app/(design-preview)/`
with mock data and screenshots before touching production pages).

## General
- Reuse existing files (e.g. `app/globals.css`, the component directory) — extend them,
  don't create parallel copies.
- Run typecheck/build to self-verify after changes; report results.
- Don't modify auth, DB, or API wiring as part of UI-only work.
