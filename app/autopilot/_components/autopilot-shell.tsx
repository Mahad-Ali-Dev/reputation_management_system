"use client";

import { TabBar, type TabItem } from "@/components/tab-bar";
import { saveAutopilotConfig } from "@/lib/autopilot/config-actions";
import { type JSX, useState, useTransition } from "react";
import type { ActivityFeedItem, AutopilotConfigView } from "@/lib/autopilot/queries";
import { ActivityPanel } from "./activity-panel";
import { ControlsPanel, type LoopKey } from "./controls-panel";
import { LoopCards } from "./loop-cards";
import { RoiPanel, type RoiPanelData } from "./roi-panel";

/**
 * Client shell for /autopilot (Module 15).
 *
 * Owns BOTH the TabBar active-tab state and the per-loop config state. The
 * loop state is lifted here so the 3-up loop cards (always visible) and the
 * Controls tab's full list stay in sync — both persist through one
 * `saveAutopilotConfig` call (admin-only server action, full-config overwrite,
 * same contract as before the redesign). All three tab panels stay mounted
 * (`hidden`) so per-tab state survives switches.
 */

const TABS: TabItem[] = [
  { key: "activity", label: "Action ledger", icon: "bolt" },
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

  const [loops, setLoops] = useState<Record<LoopKey, boolean>>({
    autoReply5Star: config.loops.autoReply5Star,
    draftLowStar: config.loops.draftLowStar,
    sendReviewRequests: config.loops.sendReviewRequests,
    voiceToReviewEnabled: config.loops.voiceToReviewEnabled,
    draftDisputes: config.loops.draftDisputes,
    geoPosts: config.loops.geoPosts,
    inboxAutoReply: config.loops.inboxAutoReply,
    escalateToHuman: config.loops.escalateToHuman,
    weeklyDigestEnabled: config.weeklyDigestEnabled,
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggleLoop(key: LoopKey) {
    const next = { ...loops, [key]: !loops[key] };
    setLoops(next);
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("enabled", config.enabled ? "on" : "");
    fd.set("riskTolerance", config.riskTolerance);
    for (const k of Object.keys(next) as LoopKey[]) {
      if (next[k]) fd.set(k, "on");
    }
    startTransition(async () => {
      try {
        const res = await saveAutopilotConfig(fd);
        if (res.ok) setSaved(true);
        else setError(res.message);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save.");
      }
    });
  }

  return (
    <div>
      <LoopCards
        loops={loops}
        enabled={config.enabled}
        risk={config.riskTolerance}
        pending={pending}
        error={error}
        onToggle={toggleLoop}
      />

      <div style={{ marginTop: 18 }}>
        <TabBar tabs={TABS} activeKey={tab} onChange={setTab} />
        <div style={{ marginTop: 14 }}>
          <div hidden={tab !== "activity"}>
            <ActivityPanel feed={feed} needsYou={needsYou} />
          </div>
          <div hidden={tab !== "controls"}>
            <ControlsPanel
              config={config}
              state={loops}
              pending={pending}
              saved={saved}
              error={error}
              onToggle={toggleLoop}
            />
          </div>
          <div hidden={tab !== "roi"}>
            <RoiPanel data={roi} />
          </div>
        </div>
      </div>
    </div>
  );
}
