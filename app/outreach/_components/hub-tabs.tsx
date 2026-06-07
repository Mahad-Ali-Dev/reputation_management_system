"use client";

import { TabBar } from "@/components/tab-bar";
import { Suspense } from "react";

/**
 * The Review-Requests hub tab bar — uses the Wave-0 `TabBar` primitive
 * (verifier fix #3: NOT a bespoke server-`<Link>` .tabs bar).
 *
 * Runs in `syncParam="tab"` URL mode: the bar writes `?tab=<key>` and each panel
 * is a server-rendered section the parent picks by reading `searchParams.tab`.
 * URL mode requires a Suspense boundary (TabBar reads `useSearchParams`).
 */

const TABS = [
  { key: "send", label: "Send Request", icon: "send" as const },
  { key: "templates", label: "Templates", icon: "copy" as const },
  { key: "automation", label: "Automation Rules", icon: "bolt" as const },
  { key: "history", label: "Sent History", icon: "pie" as const },
];

export function HubTabs({ active }: { active: string }) {
  return (
    <Suspense fallback={<div className="tabs" style={{ minHeight: 38 }} />}>
      <div style={{ marginBottom: 18 }}>
        <TabBar tabs={TABS} activeKey={active} syncParam="tab" />
      </div>
    </Suspense>
  );
}
