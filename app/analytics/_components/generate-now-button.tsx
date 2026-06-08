"use client";

import { Icon } from "@/components/shell/icon";
import { requestSeoRefresh } from "@/lib/seo/actions";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * "Generate now" button (Module 13 Weekly Reports). Posts to `requestSeoRefresh`
 * (manager-gated + entitled server action) and refreshes the route on success.
 * When not entitled, shows a disabled state pointing at upgrade.
 */
export function GenerateNowButton({ entitled }: { entitled: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  if (!entitled) {
    return (
      <a href="/subscription?feature=competitor_intel" className="btn btn--sm">
        <Icon name="lock" size={13} /> Upgrade to generate
      </a>
    );
  }

  function onClick() {
    setMsg(null);
    startTransition(async () => {
      const res = await requestSeoRefresh();
      if (res.ok) {
        router.refresh();
      } else {
        setMsg(
          res.reason === "unmigrated"
            ? "Reporting tables aren't set up yet."
            : "Couldn't generate — try again.",
        );
      }
    });
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {msg && <span style={{ fontSize: 12, color: "var(--bad)" }}>{msg}</span>}
      <button type="button" className="btn btn--sm btn--pri" onClick={onClick} disabled={pending}>
        <Icon name="refresh" size={13} />
        {pending ? "Generating…" : "Generate now"}
      </button>
    </div>
  );
}
