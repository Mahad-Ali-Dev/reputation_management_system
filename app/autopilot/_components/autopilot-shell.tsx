"use client";

import { TabBar, type TabItem } from "@/components/tab-bar";
import { type JSX, useState } from "react";
import type { ActivityFeedItem, AutopilotConfigView } from "@/lib/autopilot/queries";
import { ActivityPanel } from "./activity-panel";
import { ControlsPanel } from "./controls-panel";
import { RoiPanel, type RoiPanelData } from "./roi-panel";

/**
 * Client shell for /autopilot (Module 15).
 *
 * Holds the TabBar active-tab state and keeps ALL THREE panels mounted (toggling
 * visibility with `hidden`) so per-tab state survives switches — the canonical
 * TabBar parent pattern. Data is fetched server-side in page.tsx and handed down
 * as serializable props.
 */

const TABS: TabItem[] = [
  { key: "activity", label: "Activity", icon: "bolt" },
  { key: "controls", label: "Controls", icon: "sliders" },
  { key: "roi", label: "ROI", icon: "trend" },
];

export function AutopilotShell({
  config,
  feed,
  needsYou,
  roi,
  initialTab = "activity",
}: {
  config: AutopilotConfigView;
  feed: ActivityFeedItem[];
  needsYou: ActivityFeedItem[];
  roi: RoiPanelData;
  initialTab?: string;
}): JSX.Element {
  const [tab, setTab] = useState(initialTab);

  return (
    <div style={{ marginTop: 18 }}>
      <TabBar tabs={TABS} activeKey={tab} onChange={setTab} />
      <div style={{ marginTop: 14 }}>
        <div hidden={tab !== "activity"}>
          <ActivityPanel feed={feed} needsYou={needsYou} />
        </div>
        <div hidden={tab !== "controls"}>
          <ControlsPanel config={config} />
        </div>
        <div hidden={tab !== "roi"}>
          <RoiPanel data={roi} />
        </div>
      </div>
    </div>
  );
}
