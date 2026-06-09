# RepuLabs UI — Design Prompt Pack

Ready-to-use prompts for generating a stunning, clean, consistent UI for the whole
RepuLabs product. Paste into v0, Lovable, Cursor, Claude, or any capable
design/codegen tool.

## How to use
1. **Run `00-MAIN-foundation.md` first.** It defines the design system (colors,
   typography, spacing, motion, a11y) and the shared component library. Everything
   else is built on these primitives.
2. **Then run screens 01–13, one at a time** (better output quality than asking for
   the whole product in one shot — tools truncate). Each screen prompt is
   **standalone**: it repeats a condensed design-system header, so it works even if
   you don't run the foundation first.
3. Keep the same tool/session per screen so the shared components stay consistent.

## Files
| # | File | Screen |
|---|------|--------|
| 00 | `00-MAIN-foundation.md` | Design system + shared component library (run first) |
| 01 | `01-auth.md` | Log in / Sign up / Forgot password |
| 02 | `02-onboarding.md` | 3-step setup wizard |
| 03 | `03-dashboard.md` | Overview / home dashboard |
| 04 | `04-reviews-inbox.md` | Reviews inbox + reply composer |
| 05 | `05-campaigns.md` | Review-request campaigns (list / builder / analytics) |
| 06 | `06-sentiment.md` | Sentiment monitoring + alerts |
| 07 | `07-analytics-reports.md` | Analytics & reports |
| 08 | `08-widgets.md` | Embeddable review widgets / showcase |
| 09 | `09-locations.md` | Multi-location management |
| 10 | `10-team-roles.md` | Team members + roles/permissions |
| 11 | `11-integrations.md` | Integrations marketplace |
| 12 | `12-settings.md` | Settings (profile/business/branding/notifications) |
| 13 | `13-billing.md` | Plans, usage, invoices, payment |

## Design system at a glance
- **Canvas:** warm off-white `#fbfaf6`, surfaces white `#ffffff`, subtle fills `#f3f5f0`.
- **Brand:** blue `#2457ff` (+ `#eff6ff` tint, `#1b3fd1` hover). Only "loud" color.
- **Text:** slate `#1a1f2e` headings, `#5b6472` body.
- **Type:** Inter/Geist; H1 30 · H2 24 · H3 18 · Body 14 · tabular-nums for metrics.
- **Shape:** 8px radius, 8px spacing grid (generous), hairline borders, soft shadows.
- **Feel:** Linear / Stripe / Attio — calm, premium, minimal, accessible (WCAG AA).
