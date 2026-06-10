"use client";

import { Suspense } from "react";
import { TabBar, type TabItem } from "@/components/tab-bar";

/**
 * Persistent six-tab nav for the Unified Inbox (client island).
 *
 * Uses the Wave-0 <TabBar> primitive in URL mode (`syncParam="tab"`) so each tab
 * deep-links to `/support?tab=…` and the server re-renders the matching panel
 * (these tabs are server-heavy — we WANT a navigation per tab, not all-mounted).
 * Badges surface the open + needs-attention counts.
 *
 * TabBar reads `useSearchParams`, so it must sit under a <Suspense> boundary
 * (App Router requirement).
 */

export function InboxTabsBar({
  active,
  needsAttention,
  openCount,
  newMeetings = 0,
}: {
  active: string;
  needsAttention: number;
  openCount: number;
  /** New (un-actioned) meeting requests — drives the "Meeting requests" badge. */
  newMeetings?: number;
}) {
  const tabs: TabItem[] = [
    {
      key: "conversations",
      label: "Conversations",
      icon: "chat",
      badge: needsAttention > 0 ? needsAttention : openCount > 0 ? openCount : undefined,
    },
    { key: "comments", label: "Comments", icon: "reply" },
    { key: "live-chat", label: "Live Chat", icon: "bot" },
    { key: "moderation", label: "Moderation", icon: "flag" },
    { key: "automation", label: "Automation", icon: "bolt" },
    {
      key: "meetings",
      label: "Meeting requests",
      icon: "cal",
      badge: newMeetings > 0 ? newMeetings : undefined,
    },
    { key: "analytics", label: "Analytics", icon: "pie" },
  ];

  return (
    <div style={{ marginBottom: 16 }}>
      <Suspense fallback={<div className="tabs" style={{ height: 38 }} />}>
        <TabBar tabs={tabs} activeKey={active} syncParam="tab" />
      </Suspense>
    </div>
  );
}
