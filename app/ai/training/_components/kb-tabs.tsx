"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TabBar, type TabItem } from "@/components/tab-bar";
import { autosaveAiTraining } from "@/lib/ai/training-actions";
import type { KnowledgeGapRow, LearningStats } from "@/lib/ai/knowledge-gaps";
import { AutoSetup } from "./auto-setup";
import type { BusinessFields } from "./business-info-tab";
import { KnowledgeTab } from "./knowledge-tab";
import { PersonalityTab, type PersonalityFields } from "./personality-tab";
import { SaveState, type KbSource, type OperatingHours, type TrainingProfile } from "./shared";
import { TestTab } from "./test-tab";

/**
 * 3-tab KB workspace (Module 05, redesigned per OVERNIGHT_BLUEPRINT):
 *   - Knowledge: sources (incl. auto-setup website doc) + re-scan + readiness,
 *     plus the editable/autosaving business-profile fields.
 *   - Behavior:  personality/voice + inquiry/booking/complaint/support style +
 *     custom instructions.
 *   - Test:      the chat tester + the knowledge-gaps / learning monitor.
 *
 * Switches WITHOUT a page reload (AC). Reuses the Wave-0 <TabBar> in controlled
 * mode and keeps all panels mounted (toggled with `hidden`) so per-tab state
 * survives a switch. Deep-links via URL hash (#knowledge etc.).
 *
 * Owns the editable profile state so the debounced autosave always POSTs the
 * COMPLETE profile to autosaveAiTraining — editing one field never clobbers
 * another with an empty value.
 *
 * When the profile is empty (no overview + no sourceUrl) it shows AutoSetup
 * first; "skip" reveals the tabs.
 */

const TAB_KEYS = ["knowledge", "behavior", "test"] as const;
type TabKey = (typeof TAB_KEYS)[number];

// Back-compat: the old 4-tab hashes deep-link into the new consolidated tabs.
const HASH_ALIASES: Record<string, TabKey> = {
  business: "knowledge",
  personality: "behavior",
  learning: "test",
};

const AUTOSAVE_DEBOUNCE_MS = 1200;

function hashToTab(): TabKey {
  if (typeof window === "undefined") return "knowledge";
  const h = window.location.hash.replace("#", "");
  if ((TAB_KEYS as readonly string[]).includes(h)) return h as TabKey;
  return HASH_ALIASES[h] ?? "knowledge";
}

export function KbTabs({
  profile,
  sources,
  gaps,
  answeredGaps,
  stats,
  suggestions,
}: {
  profile: TrainingProfile;
  sources: KbSource[];
  gaps: KnowledgeGapRow[];
  answeredGaps: KnowledgeGapRow[];
  stats: LearningStats;
  suggestions: string[];
}) {
  const profileEmpty = !profile.businessOverview && !profile.sourceUrl;
  const [showSetup, setShowSetup] = useState(profileEmpty);
  const [tab, setTab] = useState<TabKey>("knowledge");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Editable field state (single source of truth for autosave).
  const [business, setBusiness] = useState<BusinessFields>({
    businessOverview: profile.businessOverview ?? "",
    servicesProducts: profile.servicesProducts ?? "",
    pricingDetails: profile.pricingDetails ?? "",
    locations: profile.locations ?? "",
    operatingHours: (profile.operatingHours as OperatingHours | null) ?? {},
  });
  const [personality, setPersonality] = useState<PersonalityFields>({
    aiPersonalityStyle: profile.aiPersonalityStyle ?? "friendly",
    customerInquiryStyle: profile.customerInquiryStyle ?? "warm_intro_quick_qualification",
    bookingStyle: profile.bookingStyle ?? "propose_time_slots",
    complaintStyle: profile.complaintStyle ?? "apologize_propose_fix",
    supportStyle: profile.supportStyle ?? "check_in_after_purchase",
    customPrompt: profile.customPrompt ?? "",
  });

  // Sync tab ↔ URL hash (deep-link + no reload).
  useEffect(() => {
    setTab(hashToTab());
    const onHash = () => setTab(hashToTab());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const changeTab = useCallback((key: string) => {
    setTab(key as TabKey);
    if (typeof window !== "undefined") {
      history.replaceState(null, "", `#${key}`);
    }
  }, []);

  // Debounced autosave. Skipped on the first render and while AutoSetup is shown.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (showSetup) return;
    if (timer.current) clearTimeout(timer.current);
    setSaveState("saving");
    timer.current = setTimeout(async () => {
      const fd = new FormData();
      fd.set("businessOverview", business.businessOverview);
      fd.set("servicesProducts", business.servicesProducts);
      fd.set("pricingDetails", business.pricingDetails);
      fd.set("locations", business.locations);
      for (const [day, h] of Object.entries(business.operatingHours)) {
        if (h?.open) fd.set(`${day}.open`, h.open);
        if (h?.close) fd.set(`${day}.close`, h.close);
      }
      fd.set("aiPersonalityStyle", personality.aiPersonalityStyle);
      fd.set("customerInquiryStyle", personality.customerInquiryStyle);
      fd.set("bookingStyle", personality.bookingStyle);
      fd.set("complaintStyle", personality.complaintStyle);
      fd.set("supportStyle", personality.supportStyle);
      fd.set("customPrompt", personality.customPrompt);
      try {
        const res = await autosaveAiTraining(fd);
        setSaveState(res.ok ? "saved" : "error");
        if (res.ok) setTimeout(() => setSaveState("idle"), 2000);
      } catch {
        setSaveState("error");
      }
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [business, personality, showSetup]);

  if (showSetup) {
    return <AutoSetup onSkip={() => setShowSetup(false)} />;
  }

  const tabs: TabItem[] = [
    { key: "knowledge", label: "Knowledge", icon: "box" },
    { key: "behavior", label: "Behavior", icon: "sparkle" },
    { key: "test", label: "Test", icon: "bot", badge: stats.open || undefined },
  ];

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 12 }}>
        <TabBar tabs={tabs} activeKey={tab} onChange={changeTab} />
        <SaveState state={saveState} />
      </div>

      <div role="tabpanel" id="panel-knowledge" aria-labelledby="tab-knowledge" hidden={tab !== "knowledge"}>
        <KnowledgeTab
          fields={business}
          onChange={(patch) => setBusiness((b) => ({ ...b, ...patch }))}
          sources={sources}
          sourceUrl={profile.sourceUrl}
          lastAutoUpdatedAt={profile.lastAutoUpdatedAt}
        />
      </div>
      <div role="tabpanel" id="panel-behavior" aria-labelledby="tab-behavior" hidden={tab !== "behavior"}>
        <PersonalityTab fields={personality} onChange={(patch) => setPersonality((p) => ({ ...p, ...patch }))} />
      </div>
      <div role="tabpanel" id="panel-test" aria-labelledby="tab-test" hidden={tab !== "test"}>
        <TestTab suggestions={suggestions} stats={stats} openGaps={gaps} answeredGaps={answeredGaps} />
      </div>
    </div>
  );
}
