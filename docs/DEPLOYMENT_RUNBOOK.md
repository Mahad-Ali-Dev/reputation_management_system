# Deployment Runbook — Master-Plan Release (2026-06)

This release ships the full master plan (all 13 ReviewBoost modules + foundation + differentiators)
plus the QR-batch 502 fix, the NFC card module, platform-icon QRs, and the v3 UI sweep.

- **Branch:** `claude/gracious-cartwright-9d248c` (NOT yet on `main`, NOT pushed)
- **Range:** `e7afc84` (baseline) → `723ab5c` (latest); 11 feature commits
- **Gate status:** `tsc --noEmit` clean, `next build` clean, ~830 unit/integration tests pass
  (the live-DB `tests/rls` + live-AI `tests/evals` suites are excluded — they need real creds).

> **Golden rule:** the app is **fail-soft** for everything new — it boots and runs un-migrated and
> with no new env keys (new tables read empty, paid adapters no-op). So you can deploy code first and
> turn features on incrementally.

---

## 0. Pre-flight (once)
- [ ] Review the 11 commits on the branch (`git log --oneline e7afc84..723ab5c`).
- [ ] Decide the live DB migration window (23 new tables + columns + a widened CHECK; all additive).
- [ ] Back up the database (Neon branch/snapshot) before migrating.

## 1. Get the code onto the deploy ref
`scripts/deploy.sh` ships **HEAD of `main`**. Either:
- **Merge** the branch into `main` (recommended after review): `git checkout main && git merge --no-ff claude/gracious-cartwright-9d248c && git push origin main`, **or**
- Deploy the branch directly: `pnpm deploy --ref=claude/gracious-cartwright-9d248c` (push the branch first).

## 2. Database migrations (3 new — additive)
Applied automatically by `deploy.sh` **iff `DIRECT_URL` is in the env file** (`prisma migrate deploy`). Otherwise run manually:
```
DIRECT_URL=postgresql://...direct... pnpm db:migrate:deploy
```
Migrations in this release (each includes its `ENABLE/FORCE RLS + tenant_isolation policy + GRANT`):
1. `prisma/migrations/20260607020000_master_delta/` — the 23 new models + column extensions (KnowledgeGap, ScheduledJob, AutomationRule, ModerationItem, ContentLibraryAsset, SocialPostMetric, SurveyInsight/Automation, Contact CRM cols + ContactTag/CustomField/Activity, the 6 SEO tables, the 4 autopilot/ROI tables, …).
2. `prisma/migrations/20260607030000_connections_provider_widen/` — widens `connections_provider_chk` for the new providers (meta/square/toast/clover).
3. `prisma/migrations/20260608000000_hardware_batches/` — the `hardware_batches` table (admin-only, re-downloadable QR/NFC batches).

> **RLS sanity after migrating:** every new tenant table must read empty (never error) under
> `app_tenant_user`. Run `pnpm test:rls` against the live DB to confirm cross-tenant isolation.

## 3. Optional dependency — `sharp` (only for PNG center-logo QRs)
Center-logo QRs are **SVG-based and work with no extra deps**. To also embed the logo in rasterized
**PNG** downloads, install sharp (updates the lockfile, so commit it):
```
pnpm add sharp && git commit -am "chore: add sharp for PNG center-logo QRs"
```
Without it, PNG QRs render plain (no crash) and SVG QRs still carry the logo.

## 4. nginx — required for the QR-batch 502 fix
`deploy.sh` does **not** deploy nginx. Copy the updated config and reload:
```
sudo cp deploy/nginx.conf /etc/nginx/sites-available/repulabs
sudo nginx -t && sudo systemctl reload nginx
```
The change adds, for `/api/admin/hardware/batch` and `…/batch/<id>/download`:
`proxy_buffering off; proxy_read_timeout 300s; proxy_send_timeout 300s;` — so the streamed ZIP flows
to the browser incrementally and never trips the 60s timeout (the root cause of the 502).

## 5. Environment variables (all feature-gated — set only what you turn on)
Authoritative list + validation: **`lib/env.ts`**. New/relevant keys by feature:
- **Required in prod:** `CRON_SECRET` (already set — cron endpoints reject without it), `DATABASE_URL`, `DIRECT_URL` (for auto-migrate), `NEXT_PUBLIC_APP_URL`.
- **Unified Inbox / social:** `META_*` (Graph app id/secret + `META_WEBHOOK_SECRET`), Google Business Messages creds, `RESEND_WEBHOOK_SECRET`, Shopify webhook secret. Twilio (`TWILIO_*`) for SMS handoff (partly configured already).
- **Business Reports (SEO):** `DATAFORSEO_*` or `BRIGHTLOCAL_*` (rank tracking), GA4 OAuth, PageSpeed key, GBP Performance (rides the Google connection).
- **AI image creatives:** `IMAGE_GEN_PROVIDER` (+ e.g. `OPENAI_API_KEY`).
Anything unset → that adapter returns `{available:false}` / no-ops. No key = no spend.

## 6. Cron scheduling — register the 14 new jobs
The endpoints exist + auth via `CRON_SECRET` (Bearer), and all 20 are listed in `vercel.json`. On the
**VPS** `vercel.json` does NOT trigger them — add these to whatever schedules the existing crons
(system `crontab` calling the URL with `Authorization: Bearer $CRON_SECRET`, an external cron service,
or QStash schedules). **New in this release:**

| Path | Cadence |
|---|---|
| `/api/cron/dispatch-scheduled` | `* * * * *` |
| `/api/cron/dispatch-review-requests` | `* * * * *` |
| `/api/cron/dispatch-social-posts` | `* * * * *` |
| `/api/cron/livechat-stale-sweep` | `*/5 * * * *` |
| `/api/cron/sync-connections` | `*/15 * * * *` |
| `/api/cron/moderation-rescan` | `*/15 * * * *` |
| `/api/cron/contacts-rollup` | `*/30 * * * *` |
| `/api/cron/daily-briefing` | daily |
| `/api/cron/refresh-social-metrics` | `0 7 * * *` |
| `/api/cron/dispute-status` | `0 14 * * *` |
| `/api/cron/ai-kb-refresh` | `0 6 * * 1` |
| `/api/cron/seo-refresh` | `0 6 * * 1` |
| `/api/cron/autopilot-weekly` | `0 14 * * 1` |
| `/api/cron/refresh-survey-insights` | `0 4 * * 0` |

(All idempotent + fail-soft; safe to over-trigger. They no-op cleanly until their tables are migrated.)

## 7. Deploy
```
pnpm deploy            # ships main: install → prisma generate → migrate deploy → next build → restart → health-check (auto-rollback on fail)
pnpm deploy --dry-run  # preview, change nothing
```

## 8. Post-deploy smoke test
- [ ] `/api/health` → 200; login + dashboard render (v3 health banner shows).
- [ ] **QR 502 fix:** admin → generate a **small** batch (e.g. 10) → ZIP **downloads** (streams); then a **500** batch downloads without a 502; the batch appears in **Recent Batches** and **re-downloads**.
- [ ] **Icon QR:** `/api/devices/<id>/qr?format=svg&platform=google` → QR with the Google glyph centered.
- [ ] **NFC:** a `productKind='nfc'` device shows the NFC config card (encode URL + copy + UID field).
- [ ] One page per module loads (reviews, outreach, surveys, support/inbox, social, contacts, analytics, autopilot, connections).
- [ ] One cron: `curl -H "Authorization: Bearer $CRON_SECRET" https://.../api/cron/dispatch-scheduled` → 200 JSON.

## 9. Rollback
`deploy.sh` auto-rolls back to the previous SHA if the health check fails. Manual:
`git checkout <prev-sha> && pnpm install --frozen-lockfile && pnpm exec prisma generate && NODE_ENV=production pnpm build && sudo systemctl restart repulabs.service`. The additive migrations are
backward-compatible (old code ignores new tables/columns), so a code rollback does **not** require a DB rollback.

## Known follow-ups (non-blocking; tracked in memory)
Foundation unit tests for the primitives; TabBar active-pill styling; CSV header-validation; inbox
Automations rule-builder; `DashboardBriefing` caching model; legal/`ai-test`/some public scan pages
still pre-v3; biome lint pre-red (~348, not a gate).
