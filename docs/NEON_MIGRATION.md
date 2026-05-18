# Neon → Singapore migration runbook

Move the Neon Postgres project from **`us-east-1` (Virginia)** to **`ap-southeast-1` (Singapore)**, plus pin Vercel functions to `sin1` so app + DB sit in the same region.

**Why:** founder + most customers are in South Asia. Current path: user → Vercel `iad1` → Neon `us-east-1` round-trips the planet twice per page. After this change, everything terminates in Singapore. Expected end-user page-load improvement: 2–4× on slow pages, especially first-paint.

**Estimated downtime:** 5–15 minutes during the cutover (Step 6). Plan it for low traffic.

**Reversible:** yes. The old `us-east-1` project stays live until you delete it in Step 8.

---

## Pre-flight

You'll need `pg_dump` / `pg_restore` (Postgres 16 client) installed locally:

```powershell
# Windows — easiest is the official installer
winget install PostgreSQL.PostgreSQL.16
# Or just the client tools:
# https://www.postgresql.org/download/windows/
```

Verify:

```powershell
pg_dump --version    # should say 16.x
pg_restore --version
```

---

## Step 1 — Create a new Neon project in Singapore

1. Open https://console.neon.tech and sign in.
2. Click **New Project**.
3. Settings:
   - **Name:** `repulabs-sg`
   - **Postgres version:** 16 (must match your current — verify by running `SELECT version();` in the current DB if unsure).
   - **Region:** **AWS · Asia Pacific (Singapore) — `ap-southeast-1`**
4. Click **Create project**.
5. From the new project's dashboard, copy:
   - **Pooled connection string** (host contains `-pooler`)
   - **Direct connection string** (host without `-pooler`)
6. Save both somewhere temporary — you'll need them in Step 3 and Step 5.

---

## Step 2 — Dump the current `us-east-1` database

Run this from your machine. Replace nothing — these are the live values from `.env.local`.

```powershell
$env:OLD_DIRECT_URL = "postgresql://neondb_owner:npg_pPh6qMto1RiF@ep-raspy-dew-aq9nfax2.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require"

pg_dump `
  --no-owner `
  --no-acl `
  --format=custom `
  --file=repulabs-us.dump `
  $env:OLD_DIRECT_URL
```

Expected output: a single `repulabs-us.dump` file (probably 5–50 MB depending on data). No errors.

If `pg_dump` complains about server version mismatch, install the matching client version.

---

## Step 3 — Restore into the Singapore project

Replace `<SG_DIRECT_URL>` with the new direct (non-pooled) connection string you copied in Step 1.

```powershell
$env:NEW_DIRECT_URL = "<SG_DIRECT_URL>"

pg_restore `
  --no-owner `
  --no-acl `
  --clean `
  --if-exists `
  --dbname=$env:NEW_DIRECT_URL `
  repulabs-us.dump
```

A handful of `must be owner of extension` notices are harmless on Neon — those extensions come pre-installed in the target. Anything else flagged as **ERROR** needs to be investigated before continuing.

---

## Step 4 — Smoke-test the new database

```powershell
$env:PGPASSWORD = "<password-from-NEW_DIRECT_URL>"
psql $env:NEW_DIRECT_URL -c "SELECT COUNT(*) FROM \"Organization\";"
psql $env:NEW_DIRECT_URL -c "SELECT COUNT(*) FROM \"Establishment\";"
psql $env:NEW_DIRECT_URL -c "SELECT COUNT(*) FROM \"Review\";"
```

Compare to the same queries against `OLD_DIRECT_URL`. Numbers must match. If they don't, stop here and re-run the dump/restore.

---

## Step 5 — Update local env vars

Edit `D:\reputation_management_system\.env.local`:

```bash
# Pooled connection — note the appended ?pgbouncer=true&connection_limit=1 flags
DATABASE_URL="<SG_POOLED_URL>&pgbouncer=true&connection_limit=1"

# Direct connection — used by Prisma migrations only
DIRECT_URL="<SG_DIRECT_URL>"
```

Notes:
- Append `&pgbouncer=true&connection_limit=1` to whatever query string is already on the pooled URL (the Neon-supplied URL ends in `?sslmode=require`, so append with `&`). These flags make Prisma play nicely with PgBouncer transaction mode.
- Do **not** add those flags to `DIRECT_URL`. Migrations need real prepared statements.

Then regenerate the Prisma client and test:

```powershell
pnpm db:generate
pnpm dev
```

Open http://localhost:3000, log in, click through Dashboard / Listings / Reviews. Pages should feel noticeably snappier — typical query goes from ~300 ms to ~80 ms RTT from Pakistan.

If anything breaks, you can revert by swapping the env values back to the old `us-east-1` URLs — the old DB is still live.

---

## Step 6 — Pin Vercel functions to Singapore

In `vercel.json`, add the `regions` key at the top level:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["sin1"],
  "crons": [
    ...
  ]
}
```

Then update the production env vars in the Vercel dashboard:
- `DATABASE_URL` → new SG pooled URL with `&pgbouncer=true&connection_limit=1`
- `DIRECT_URL` → new SG direct URL

Commit the `vercel.json` change and push to `main`. Vercel will redeploy and provision functions in `sin1`.

**Important:** do NOT push the `vercel.json` change *before* updating `DATABASE_URL` in the Vercel dashboard — otherwise Singapore functions will reach across the Pacific to the old US database for one deploy cycle.

---

## Step 7 — Verify production

After the Vercel deploy completes:

1. Hit https://repulabs.com from a Pakistan connection.
2. DevTools → Network → check the Time-to-First-Byte on a logged-in page. Should be <500 ms (was 1–3 s before).
3. Check Vercel function logs for any `prisma:error` events around the cutover window.
4. Verify cron jobs ran on schedule (Vercel dashboard → Crons tab).

Leave both projects running for **at least 24 hours** so you have a quick rollback option if a delayed bug surfaces.

---

## Step 8 — Decommission the old US project

After 24 h of green metrics:

1. Neon console → old `repulabs` (us-east-1) project → Settings → **Delete project**.
2. Type the project name to confirm.
3. Delete the local `repulabs-us.dump` file (it contains all your customer data).

```powershell
Remove-Item D:\reputation_management_system\repulabs-us.dump
```

---

## Rollback plan

If anything goes wrong at any step before Step 8:

1. Revert `DATABASE_URL` and `DIRECT_URL` in `.env.local` (and in Vercel) back to the old us-east-1 values.
2. Remove the `regions` key from `vercel.json` and redeploy.
3. The old project is untouched and continues serving traffic.

You don't lose data — `pg_dump` is read-only against the source.
