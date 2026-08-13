"use client";

import { saveAutopilotConfig } from "@/lib/autopilot/config-actions";
import type { ActivityFeedItem, AutopilotConfigView } from "@/lib/autopilot/queries";
import { type JSX, useState, useTransition } from "react";
import { ActivityPanel } from "./activity-panel";
import { ComingSoonOverlay } from "./coming-soon-overlay";
import { ControlsPanel, type LoopKey } from "./controls-panel";
import { RoiPanel, type RoiPanelData } from "./roi-panel";

/**
 * Client shell for /autopilot (Module 15).
 *
 * Owns BOTH the tab state (design-kit inline tab bar: Activity / Controls /
 * ROI, kit SVG icons recolored via CSS mask) and the per-loop config state.
 * The loop state is lifted here so the Controls tab's list persists through
 * one `saveAutopilotConfig` call (admin-only server action, full-config
 * overwrite, same contract as before the redesign). All three tab panels stay
 * mounted (`hidden`) so per-tab state survives switches.
 */

const TABS: { key: string; label: string }[] = [
  { key: "activity", label: "Activity" },
  { key: "controls", label: "Controls" },
  { key: "roi", label: "ROI" },
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
    <div className="ap2-tabsection">
      <div role="tablist" aria-label="Autopilot sections" className="ap2-tabs">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              className={`ap2-tab${active ? " is-active" : ""}`}
              onClick={() => setTab(t.key)}
            >
              <span className={`ap2-tab__icon ap2-tab__icon--${t.key}`} aria-hidden="true" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="ap2-tabpanels">
        <div hidden={tab !== "activity"}>
          <ActivityPanel feed={feed} needsYou={needsYou} />
        </div>
        <div hidden={tab !== "controls"}>
          <ControlsPanel
            state={loops}
            pending={pending}
            saved={saved}
            error={error}
            onToggle={toggleLoop}
          />
        </div>
        <div hidden={tab !== "roi"}>
          {/* ROI is built and wired to live data, but is being held back a
              release — deliberately not deleted (see coming-soon-overlay.tsx),
              just blurred with a "coming soon" message instead of the tab
              rendering blank while it's held back. */}
          <ComingSoonOverlay message="The ROI dashboard is on its way in a future release.">
            <RoiPanel data={roi} />
          </ComingSoonOverlay>
        </div>
      </div>
    </div>
  );
}
