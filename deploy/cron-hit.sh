#!/usr/bin/env bash
#
# repulabs — cron endpoint hitter.
#
# The 21 scheduled jobs live in Next route handlers under /api/cron/*, each
# guarded by `Authorization: Bearer $CRON_SECRET`. On Vercel, Vercel Cron sends
# that header. On the VPS there is no such scheduler, so the system crontab
# (deploy/repulabs.cron) calls this wrapper, which reads the secret from the
# prod env file and makes the request. The secret is NEVER committed.
#
# Usage:  cron-hit.sh <endpoint>      e.g.  cron-hit.sh sync-reviews
#
# Env overrides (optional):
#   REPULABS_ENV   path to the env file (default /opt/repulabs/.env.production)
#   REPULABS_BASE  base URL           (default https://repulabs.com)
#
set -euo pipefail

endpoint="${1:?usage: cron-hit.sh <endpoint>}"
env_file="${REPULABS_ENV:-/opt/repulabs/.env.production}"
base="${REPULABS_BASE:-https://repulabs.com}"

if [[ ! -r "$env_file" ]]; then
  echo "cron-hit: cannot read $env_file" >&2
  exit 1
fi

# Read CRON_SECRET, strip surrounding quotes if present.
secret="$(grep -E '^CRON_SECRET=' "$env_file" | head -1 | cut -d= -f2- | tr -d '"')"
if [[ -z "$secret" ]]; then
  echo "cron-hit: CRON_SECRET not set in $env_file" >&2
  exit 1
fi

# -f fail on HTTP error, -s silent, -S show errors, -m cap per-job runtime.
curl -fsS -m 300 \
  -H "Authorization: Bearer ${secret}" \
  "${base}/api/cron/${endpoint}" >/dev/null
