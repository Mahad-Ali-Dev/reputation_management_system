"use client";

import type { KnowledgeGapRow, LearningStats } from "@/lib/ai/knowledge-gaps";
import { LearningMonitorTab } from "./learning-monitor-tab";
import { TestAiTab } from "./test-ai-tab";

/**
 * Test tab (Module 05 — 3-tab workspace).
 *
 * Combines the live chat tester with the knowledge-gaps / learning monitor in
 * one place: ask a question, then see what the AI couldn't answer and teach it.
 * Both halves are the existing, unchanged components — this is purely the
 * consolidated layout the 3-tab blueprint calls for.
 */
export function TestTab({
  suggestions,
  stats,
  openGaps,
  answeredGaps,
}: {
  suggestions: string[];
  stats: LearningStats;
  openGaps: KnowledgeGapRow[];
  answeredGaps: KnowledgeGapRow[];
}) {
  return (
    <div className="col" style={{ gap: 18 }}>
      <TestAiTab suggestions={suggestions} />
      <LearningMonitorTab stats={stats} openGaps={openGaps} answeredGaps={answeredGaps} />
    </div>
  );
}
