#!/usr/bin/env python3
"""Generate deploy/repulabs.cron from vercel.json.

vercel.json is the single source of truth for cron schedules. On Vercel those
fire automatically; on the VPS they do nothing, so the system crontab must
mirror them. Run this whenever vercel.json crons change:

    python3 scripts/gen-cron.py

then redeploy and re-install the crontab (see deploy/repulabs.cron header).
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
crons = json.loads((ROOT / "vercel.json").read_text())["crons"]

header = """# repulabs — VPS cron schedule. GENERATED FROM vercel.json (which does nothing
# off Vercel). Regenerate: python3 scripts/gen-cron.py
#
# Install as the deploy user:   crontab /opt/repulabs/deploy/repulabs.cron
# Verify (expect 21):           crontab -l | grep -c cron-hit
# Each line calls the wrapper, which reads CRON_SECRET from .env.production and
# hits the endpoint with the Bearer header. No secret lives in this file.
SHELL=/bin/bash
"""

width = max(len(c["schedule"]) for c in crons)
lines = [header, ""]
for c in crons:
    endpoint = c["path"].rsplit("/", 1)[-1]
    lines.append(f'{c["schedule"]:<{width}} /opt/repulabs/deploy/cron-hit.sh {endpoint}')
lines.append("")

out = ROOT / "deploy" / "repulabs.cron"
out.write_text("\n".join(lines), newline="\n")
print(f"wrote {out.relative_to(ROOT)} with {len(crons)} jobs")
