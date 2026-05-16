#!/usr/bin/env python3
"""
Bulk-migrate page.tsx files from the legacy `auth()` + manual session/orgId
extract pattern to the React-cache-memoized `getOrgContext()` helper.

Run from the project root:
  python scripts/migrate-to-getorgcontext.py

Idempotent: skips files that already use getOrgContext.
"""

from __future__ import annotations
import re
import sys
from pathlib import Path

FILES = [
    "app/subscription/page.tsx",
    "app/surveys/coupons/page.tsx",
    "app/support/customers/page.tsx",
    "app/support/blacklist/page.tsx",
    "app/phone/booking/page.tsx",
    "app/contacts/page.tsx",
    "app/support/dms/page.tsx",
    "app/support/live-chat/page.tsx",
    "app/support/chat-automation/page.tsx",
    "app/reviews/dispute/page.tsx",
    "app/phone/setup/page.tsx",
    "app/phone/voices/page.tsx",
    "app/phone/campaigns/page.tsx",
    "app/phone/calls/[id]/page.tsx",
    "app/phone/assistant/page.tsx",
    "app/outreach/send/page.tsx",
    "app/outreach/templates/page.tsx",
    "app/outreach/bulk/page.tsx",
    "app/faqs/page.tsx",
    "app/establishments/[id]/page.tsx",
    "app/analytics/page.tsx",
    "app/ai/page.tsx",
    "app/hardware/orders/[id]/page.tsx",
    "app/establishments/new/page.tsx",
    "app/surveys/new/page.tsx",
    "app/surveys/[id]/page.tsx",
    "app/ai/test/page.tsx",
]

IMPORT_RE = re.compile(
    r'import \{ auth \} from "@/lib/auth/config";',
)
AUTH_BLOCK_RE = re.compile(
    r'  const session = await auth\(\);\s*\n'
    r'  const orgId = \(session as \{ orgId\?: string \} \| null\)\?\.orgId;\s*\n'
    r'  if \(!session\?\.user \|\| !orgId\) redirect\("/login"\);',
)


def migrate(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    if "getOrgContext" in text:
        return "skipped (already migrated)"
    if not IMPORT_RE.search(text):
        return "no auth import found"
    if not AUTH_BLOCK_RE.search(text):
        return "auth block pattern not found"

    new_text = IMPORT_RE.sub(
        'import { getOrgContext } from "@/lib/auth/org-context";',
        text,
    )
    new_text = AUTH_BLOCK_RE.sub(
        "  const { orgId } = await getOrgContext();",
        new_text,
    )
    # Strip the now-unused `redirect` import if it's no longer referenced.
    if 'import { redirect } from "next/navigation";' in new_text and "redirect(" not in new_text:
        new_text = new_text.replace(
            'import { redirect } from "next/navigation";\n', ""
        )
        new_text = new_text.replace(
            ', redirect } from "next/navigation"', ' } from "next/navigation"'
        )
        new_text = new_text.replace(
            '{ redirect, ', '{ '
        )

    path.write_text(new_text, encoding="utf-8")
    return "migrated"


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    results: dict[str, list[str]] = {}
    for rel in FILES:
        path = root / rel
        if not path.exists():
            results.setdefault("missing", []).append(rel)
            continue
        try:
            status = migrate(path)
        except Exception as exc:  # noqa: BLE001
            status = f"error: {exc}"
        results.setdefault(status, []).append(rel)

    for status, files in sorted(results.items()):
        print(f"{status}: {len(files)}")
        for f in files:
            print(f"  {f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
