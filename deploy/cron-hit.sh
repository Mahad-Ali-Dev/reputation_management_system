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
#   REPULABS_ENV       path to env file  (default /opt/repulabs/.env.production)
#   REPULABS_BASE      base URL          (default https://repulabs.com)
#   REPULABS_CRON_LOG  log file          (default /opt/repulabs/logs/cron.log)
#
set -euo pipefail

# cron runs with a minimal PATH; be explicit so a missing binary can't silently
# break every scheduled job.
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH

endpoint="${1:?usage: cron-hit.sh <endpoint>}"
env_file="${REPULABS_ENV:-/opt/repulabs/.env.production}"
base="${REPULABS_BASE:-https://repulabs.com}"
log_file="${REPULABS_CRON_LOG:-/opt/repulabs/logs/cron.log}"

# WHY THIS LOG EXISTS: stdout went to /dev/null and stderr went to cron's
# mailer. With no MTA installed, the journal only says "discarding output" — so
# a FAILING job looked exactly like a healthy one, and the scheduled layer could
# stop working for days without a visible symptom. Always leave a trace.
mkdir -p "$(dirname "$log_file")" 2>/dev/null || true
log() {
  printf '%s %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$endpoint" "$*" \
    >>"$log_file" 2>/dev/null || true
}

if [[ ! -r "$env_file" ]]; then
  log "FATAL cannot read $env_file"
  echo "cron-hit: cannot read $env_file" >&2
  exit 1
fi

# Read CRON_SECRET, strip surrounding quotes if present.
# `|| true` is REQUIRED: grep exits 1 when it finds nothing, and under
# `set -e -o pipefail` that aborts the script right here — before the explicit
# check below, so it would die with NO log line and NO message. Exactly the
# silent-failure mode this script is supposed to make visible.
secret="$(grep -E '^CRON_SECRET=' "$env_file" | head -1 | cut -d= -f2- | tr -d '"' || true)"
if [[ -z "$secret" ]]; then
  log "FATAL CRON_SECRET not set in $env_file"
  echo "cron-hit: CRON_SECRET not set in $env_file" >&2
  exit 1
fi

# Capture body + status instead of discarding both. `|| true` stops `set -e`
# from killing the script before the failure can be recorded.
# -s silent, -S show errors, -m caps per-job runtime. NOTE: no -f, so a non-2xx
# body is still captured for the log rather than thrown away.
body="$(curl -sS -m 300 -w '\n%{http_code}' \
  -H "Authorization: Bearer ${secret}" \
  "${base}/api/cron/${endpoint}" 2>&1)" || true

http_code="$(printf '%s' "$body" | tail -n1)"
payload="$(printf '%s' "$body" | sed '$d')"

case "$http_code" in
  2*)
    log "ok $http_code ${payload:0:300}"
    ;;
  *)
    log "FAIL http=$http_code ${payload:0:300}"
    # Also emit on stderr so an operator running it by hand sees the failure.
    echo "cron-hit: $endpoint failed (http=$http_code): ${payload:0:300}" >&2
    exit 1
    ;;
esac
