#!/usr/bin/env bash
#
# Repulabs — Hostinger VPS deployment script
#
# What it does (in order):
#   1. Verify env file is present and not world-readable
#   2. git fetch + checkout latest main (or specified ref)
#   3. pnpm install --frozen-lockfile
#   4. prisma generate + migrate deploy (NOT migrate dev — prod-safe)
#   5. next build
#   6. systemctl restart repulabs.service
#   7. Wait for /api/health to return 200, then roll back on failure
#
# Run from /var/www/repulabs (or wherever APP_DIR points):
#   pnpm deploy                 # ship HEAD of main
#   pnpm deploy --ref=v1.2.3    # ship a specific tag
#   pnpm deploy --dry-run       # print what would happen, change nothing
#
# Exit non-zero on any failure. Designed to be idempotent — re-running after
# a partial failure is safe.

set -euo pipefail

# ---- Config ----
APP_DIR="${APP_DIR:-$(pwd)}"
SERVICE_NAME="${SERVICE_NAME:-repulabs.service}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:${PORT:-3000}/api/health}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-60}"   # seconds to wait for health
GIT_REF="main"
DRY_RUN=0

# ---- Parse args ----
for arg in "$@"; do
  case "$arg" in
    --ref=*)     GIT_REF="${arg#*=}" ;;
    --dry-run)   DRY_RUN=1 ;;
    -h|--help)
      grep -E '^#' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      echo "Unknown arg: $arg" >&2
      exit 1
      ;;
  esac
done

# ---- Helpers ----
log()  { printf '\033[36m[deploy]\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[deploy] WARN:\033[0m %s\n' "$*" >&2; }
err()  { printf '\033[31m[deploy] ERROR:\033[0m %s\n' "$*" >&2; }
run()  {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '\033[90m[dry-run] %s\033[0m\n' "$*"
  else
    eval "$@"
  fi
}

# ---- Preflight ----
cd "$APP_DIR"

if [ ! -f .env.local ] && [ ! -f .env.production ]; then
  err "No .env.local or .env.production in $APP_DIR — refusing to deploy."
  exit 1
fi

# Refuse to deploy if env file is readable by group/other
ENV_FILE=".env.local"
[ -f .env.production ] && ENV_FILE=".env.production"
PERMS=$(stat -c '%a' "$ENV_FILE" 2>/dev/null || stat -f '%A' "$ENV_FILE")
if [ "$PERMS" != "600" ] && [ "$PERMS" != "400" ]; then
  err "$ENV_FILE is mode $PERMS — must be 600 or 400 (chmod 600 $ENV_FILE)"
  exit 1
fi

# ---- Git ----
log "Fetching git ref: $GIT_REF"
run "git fetch --tags origin"
run "git checkout $GIT_REF"
run "git pull --ff-only origin $GIT_REF || true"

CURRENT_SHA=$(git rev-parse HEAD)
log "HEAD is now $CURRENT_SHA"

# Record previous deploy for rollback
PREV_SHA_FILE=".deploy-previous-sha"
if [ -f .deploy-current-sha ]; then
  run "cp .deploy-current-sha $PREV_SHA_FILE"
fi
run "echo $CURRENT_SHA > .deploy-current-sha"

# ---- Install + build ----
log "Installing dependencies (frozen lockfile)"
# CI=true silences pnpm's interactive prompts (e.g. confirm-modules-purge on
# lockfile shifts); --frozen-lockfile fails fast if lockfile is stale.
run "CI=true pnpm install --frozen-lockfile --prod=false"

# CRITICAL: pnpm install is a no-op when lockfile matches (Already up to date
# in ~400ms). That skips the postinstall script — so the Prisma client may
# still be the stale one from before node_modules was rebuilt. Run
# `prisma generate` ourselves, unconditionally, before any TypeScript compile.
log "Running Prisma generate (forced, regardless of install result)"
run "pnpm exec prisma generate"

# Sanity check: confirm the @prisma/client module can be resolved AND has the
# generated types on disk. With pnpm's virtual store the .d.ts lives at
# node_modules/.pnpm/@prisma+client@<version>_*/node_modules/@prisma/client/
# rather than the legacy node_modules/.prisma/client/ path. Just ask Node to
# resolve it — works regardless of where pnpm dropped the files.
if [ "$DRY_RUN" -eq 0 ]; then
  if ! node -e "require.resolve('@prisma/client')" >/dev/null 2>&1; then
    err "Prisma client cannot be resolved after generate. Aborting."
    err "Check that prisma/schema.prisma is valid and node_modules is writable."
    exit 1
  fi
fi

# Migrations are optional: only run if DIRECT_URL is set in the env file.
# The dev workflow uses pooled DATABASE_URL through the connection pooler,
# but `prisma migrate deploy` insists on a direct connection. If DIRECT_URL
# isn't configured (e.g. small-team deploys that run migrations manually),
# skip rather than aborting the whole deploy.
if grep -q '^DIRECT_URL=' "$ENV_FILE" 2>/dev/null; then
  log "Running Prisma migrate deploy"
  run "pnpm db:migrate:deploy"
else
  warn "DIRECT_URL not in $ENV_FILE — skipping prisma migrate deploy."
  warn "If this deploy includes schema changes, run migrations manually:"
  warn "  DIRECT_URL=... pnpm db:migrate:deploy"
fi

log "Building Next.js production bundle"
# Call `pnpm build` (which itself runs `prisma generate && next build`)
# instead of `pnpm exec next build` directly. Belt-and-suspenders with the
# explicit `prisma generate` above — but harmless to run twice.
run "NODE_ENV=production pnpm build"

# Sanity check: BUILD_ID must exist or systemctl restart will just run the
# OLD bundle (or worse: crash on missing manifest).
if [ "$DRY_RUN" -eq 0 ] && [ ! -f ".next/BUILD_ID" ]; then
  err "Build did NOT produce .next/BUILD_ID. Refusing to restart service."
  err "Inspect output above for compilation errors."
  exit 1
fi

# ---- Restart service ----
log "Restarting $SERVICE_NAME"
if [ "$DRY_RUN" -eq 0 ]; then
  sudo systemctl restart "$SERVICE_NAME"
else
  printf '\033[90m[dry-run] sudo systemctl restart %s\033[0m\n' "$SERVICE_NAME"
fi

# ---- Health check ----
if [ "$DRY_RUN" -eq 1 ]; then
  log "Dry run complete."
  exit 0
fi

log "Waiting up to ${HEALTH_TIMEOUT}s for $HEALTH_URL"
START=$(date +%s)
while true; do
  if curl -sf -m 3 "$HEALTH_URL" >/dev/null 2>&1; then
    ELAPSED=$(( $(date +%s) - START ))
    log "Health check passed in ${ELAPSED}s. Deploy successful."
    exit 0
  fi
  NOW=$(date +%s)
  if [ $((NOW - START)) -ge "$HEALTH_TIMEOUT" ]; then
    err "Health check did NOT pass within ${HEALTH_TIMEOUT}s."
    if [ -f "$PREV_SHA_FILE" ]; then
      PREV_SHA=$(cat "$PREV_SHA_FILE")
      warn "Attempting rollback to $PREV_SHA"
      git checkout "$PREV_SHA"
      CI=true pnpm install --frozen-lockfile --prod=false
      pnpm exec prisma generate
      NODE_ENV=production pnpm build
      sudo systemctl restart "$SERVICE_NAME"
      sleep 5
      if curl -sf -m 3 "$HEALTH_URL" >/dev/null 2>&1; then
        warn "Rollback succeeded. Investigate $CURRENT_SHA."
        exit 1
      fi
      err "Rollback ALSO failed. Manual intervention required."
    fi
    exit 1
  fi
  sleep 2
done
