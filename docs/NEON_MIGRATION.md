# Neon → Singapore migration runbook (Hostinger VPS edition)

Move the Neon Postgres project from **`us-east-1` (Virginia)** to **`ap-southeast-1` (Singapore)** so it sits next to your Hostinger VPS in **Kuala Lumpur**.

**Why:** your VPS is in Kuala Lumpur. KL ↔ Singapore is ~300 km on the same submarine cable infrastructure — typical RTT 5–20 ms. Current path: VPS in KL → Neon in Virginia = ~250 ms cross-Pacific per query. A page that runs 8 queries pays 2 s of pure network time before any real work. After this move, that drops to ~80–160 ms total — a **15–25× improvement on DB latency**.

**Estimated downtime:** 2–5 minutes for the systemd restart at Step 6. Plan it for low traffic.

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

## Step 6 — Update production env on the VPS

SSH into the VPS:

```bash
ssh deploy@<your-vps-ip>
```

Edit the production env file:

```bash
sudo nano /var/www/repulabs/.env.production
```

Update these two lines (and **only** these two — leave every other secret alone):

```bash
DATABASE_URL="<SG_POOLED_URL>&pgbouncer=true&connection_limit=1"
DIRECT_URL="<SG_DIRECT_URL>"
```

Save (`Ctrl+O`, `Enter`, `Ctrl+X` in nano). Then re-lock permissions just in case nano left them open:

```bash
sudo chown repulabs:repulabs /var/www/repulabs/.env.production
sudo chmod 600 /var/www/repulabs/.env.production
```

Restart the service to pick up the new env:

```bash
sudo systemctl restart repulabs
sudo systemctl status repulabs    # should show "active (running)"
```

Watch the logs for the first ~30 seconds to catch any DB connection errors:

```bash
sudo journalctl -u repulabs -f
```

You're looking for normal request logs. If you see `PrismaClientInitializationError` or `Can't reach database server`, the URL is wrong — re-check Steps 5–6, fix, and `restart` again.

**Important:** do NOT restart the service before Step 5's local smoke test passes. If the new SG database is missing data or wasn't restored properly, restarting will hard-fail your live site.

---

## Step 7 — Verify production

After the service restarts cleanly:

1. Hit https://repulabs.com from your browser. Log in, click Dashboard → Listings → Reviews.
2. DevTools → Network → check Time-to-First-Byte on a logged-in page. Should be **<400 ms** (was 1–3 s before). The first hit may still be slow if the Next.js page cache is cold; the second hit is the honest measurement.
3. Watch journald for any errors over the next few minutes:
   ```bash
   sudo journalctl -u repulabs --since "5 minutes ago" | grep -iE "error|prisma|econnref"
   ```
4. Verify cron jobs ran on schedule:
   ```bash
   sudo journalctl -u repulabs --since "1 hour ago" | grep "api/cron"
   ```
5. Open https://repulabs.com on your phone (4G/5G, not WiFi) to feel the real-world end-user difference.

Leave both Neon projects running for **at least 24 hours** so you have a quick rollback option if a delayed bug surfaces.

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

1. **Local rollback:** edit `D:\reputation_management_system\.env.local` and revert `DATABASE_URL` + `DIRECT_URL` to the old us-east-1 values. Restart `pnpm dev`.
2. **Production rollback:** SSH into the VPS, edit `/var/www/repulabs/.env.production`, revert the two URLs, then:
   ```bash
   sudo systemctl restart repulabs
   ```
   The old us-east-1 Neon project is still live, so the app comes back up serving from the original DB within seconds.
3. Verify with `sudo journalctl -u repulabs -f` for ~30 seconds to confirm normal request logs.

You don't lose data — `pg_dump` is read-only against the source.
