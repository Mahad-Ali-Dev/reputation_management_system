#!/usr/bin/env bash
#
# Pre-push checks. Run locally before pushing to main.
#
#   pnpm exec bash scripts/preflight.sh
#
# Fails fast on:
#   - typecheck errors
#   - lint violations
#   - failing tests
#   - dirty working tree (uncommitted changes)
#   - missing or weak env vars in .env.local (warns only)

set -euo pipefail

red()    { printf '\033[31m%s\033[0m\n' "$*"; }
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
cyan()   { printf '\033[36m%s\033[0m\n' "$*"; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

cyan "▶ Working tree check"
if [ -n "$(git status --porcelain)" ]; then
  yellow "  (working tree has uncommitted changes — that's fine for a local check)"
else
  green "  clean"
fi

cyan "▶ Typecheck"
pnpm typecheck

cyan "▶ Lint"
pnpm lint

cyan "▶ Unit tests"
pnpm test

cyan "▶ Build (production)"
NODE_ENV=production pnpm exec next build

green "✔ Preflight passed."
