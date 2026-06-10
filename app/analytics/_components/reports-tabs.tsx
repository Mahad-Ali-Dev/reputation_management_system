"use client";

import { TabBar, type TabItem } from "@/components/tab-bar";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, type ReactNode } from "react";

/**
 * Reports tab shell (Module 13) — the 6-tab persistent controller.
 *
 * Built on the shared `<TabBar>` in CONTROLLED mode (not syncParam) so ALL
 * panels stay MOUNTED and per-tab client state (the Recommendations segmented
 * view, an in-progress competitor form) survives a tab switch — the canonical
 * TabBar pattern. We still mirror the active tab to `?tab=` ourselves
 * (router.replace, shallow) so a tab is deep-linkable + survives reload.
 *
 * Paid tabs (SEO & Competitors) render with a padlock via the TabBar `locked`
 * flag when the org isn't entitled — clicking routes to upgrade and the panel
 * is never revealed. Server enforcement is still in the actions/refresh
 * (`assertEntitled`); this is presentation, and the page does not send gated
 * panel data to a non-entitled client.
 */

export const REPORT_TABS = [
  { key: "overview", label: "Overview", icon: "grid" },
  { key: "weekly", label: "Weekly Reports", icon: "cal" },
  { key: "score", label: "Reputation Score", icon: "trend" },
  { key: "seo", label: "SEO & Visibility", icon: "search", paid: true },
  { key: "competitors", label: "Competitors", icon: "target", paid: true },
  { key: "recommendations", label: "Recommendations", icon: "bolt" },
] as const;

export type ReportTabKey = (typeof REPORT_TABS)[number]["key"];

export function ReportsTabs({
  activeTab,
  entitled,
  panels,
}: {
  activeTab: ReportTabKey;
  /** Pro/Scale entitlement — drives the padlock on the paid tabs. */
  entitled: boolean;
  /** One node per tab key (kept mounted; inactive ones hidden via CSS). */
  panels: Record<ReportTabKey, ReactNode>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setTab = useCallback(
    (key: string) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.set("tab", key);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const tabs: TabItem[] = REPORT_TABS.map((t) => ({
    key: t.key,
    label: t.label,
    icon: t.icon,
    locked: "paid" in t && t.paid === true && !entitled,
  }));

  // If the active tab is a locked paid tab, fall back to Overview for rendering
  // (the user can't actually be on it; the padlock routed them to upgrade).
  const effectiveActive: ReportTabKey =
    tabs.find((t) => t.key === activeTab)?.locked ? "overview" : activeTab;

  return (
    <div>
      <div style={{ borderBottom: "1px solid var(--line)", marginBottom: 24 }}>
        <TabBar tabs={tabs} activeKey={effectiveActive} onChange={setTab} />
      </div>
      <div>
        {REPORT_TABS.map((t) => (
          <div key={t.key} hidden={t.key !== effectiveActive} id={`panel-${t.key}`} role="tabpanel" aria-labelledby={`tab-${t.key}`}>
            {panels[t.key]}
          </div>
        ))}
      </div>
    </div>
  );
}
