#!/usr/bin/env bash
#
# One-shot deploy script for the Next.js 15.5.18 security patch.
#
# Run from /opt/repulabs on the VPS after pulling the latest commits on
# the security-patched branch.
#
# Usage:
#   bash scripts/deploy-security-patch.sh
#
# This script is idempotent — running it twice is safe.

set -euo pipefail

cd /opt/repulabs

echo "=== 1/7  Fix ownership (deploy owns repo, repulabs reads via group) ==="
sudo chown -R deploy:repulabs .
sudo chmod -R g+w .
# .env.production: owner=deploy (for build-time read), group=repulabs (for runtime read),
# mode 640 = rw-r----- so no other user can see live secrets.
sudo chown deploy:repulabs .env.production
sudo chmod 640 .env.production
# Wipe stale .next from previous runs (avoid 'permission denied unlink' on rebuild)
sudo rm -rf .next

echo "=== 2/7  pnpm v11 compat flag ==="
if ! grep -q "verify-deps-before-run" .npmrc 2>/dev/null; then
  echo "verify-deps-before-run=never" >> .npmrc
fi

echo "=== 3/7  pnpm install ==="
pnpm install --frozen-lockfile

echo "=== 4/7  pnpm build ==="
pnpm build

# After the fresh build, .next is owned by deploy:deploy with default mode -
# the runtime user (repulabs) can't mkdir .next/cache/images for image
# optimization. Re-set ownership + group write so the service can write its
# runtime cache.
sudo chown -R deploy:repulabs .next
sudo chmod -R g+w .next

echo "=== 5/7  systemctl restart repulabs ==="
sudo systemctl restart repulabs
sleep 2

echo "=== 6/7  Service status ==="
sudo systemctl status repulabs --no-pager | head -12

echo "=== 7/7  Next.js version (truth check) ==="
sudo journalctl -u repulabs -n 80 --no-pager | grep "Next.js" | tail -3

echo ""
echo "=== DONE ==="
echo "If the line above shows '▲ Next.js 15.5.18' (or higher), the RCE is patched."
echo "If it shows '▲ Next.js 15.1.0', the build didn't take effect — re-run this script."
