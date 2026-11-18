"use client";

import { openAskAi } from "@/components/ask-ai";
import { Icon, type IconName } from "@/components/shell/icon";
import dynamic from "next/dynamic";
import { useState } from "react";

// three.js loads only on the dashboard (and only in the browser) — never in
// the server render or the shared bundle.
const FrogMascot = dynamic(
  () => import("@/components/ui/ai-agent-mascot").then((m) => m.FrogMascot),
  { ssr: false, loading: () => <div className="dk-copilot__frog-ph" aria-hidden="true" /> },
);

/**
 * Dashboard "Your AI copilot" prompt panel (design kit, bottom section).
 *
 * Client islands: the input + suggestion chips are wired to the REAL global
 * Ask-AI assistant (components/ask-ai.tsx) via its `openAskAi(prompt)` window
 * event — submitting here opens the slide-over with the question already sent.
 * No dead inputs.
 *
 * Split into two exports because the kit lays them out in different panel
 * slots: the form lives in the text column (left of the robot), while the
 * suggestion chips run on a full-width row underneath.
 */

const CHIPS: Array<{ icon: IconName; label: string }> = [
  { icon: "chat", label: "Summarize recent reviews" },
  { icon: "trend", label: "Why did my rating change?" },
  { icon: "star", label: "Show top customer compliments" },
  { icon: "sparkle", label: "How to get more 5-star reviews?" },
];

export function CopilotPrompt() {
  const [draft, setDraft] = useState("");

  return (
    <form
      className="dk-copilot__form"
      onSubmit={(e) => {
        e.preventDefault();
        const q = draft.trim();
        if (!q) return;
        openAskAi(q);
        setDraft("");
      }}
    >
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Ask anything about your reviews, customers, or performance…"
        aria-label="Ask the AI copilot"
        className="dk-copilot__input"
      />
      <button
        type="submit"
        className="dk-copilot__send"
        aria-label="Send question to the AI copilot"
        disabled={draft.trim().length === 0}
      >
        <Icon name="send" size={15} />
      </button>
    </form>
  );
}

export function CopilotChips() {
  return (
    <div className="dk-copilot__chips">
      {CHIPS.map((c) => (
        <button
          key={c.label}
          type="button"
          className="dk-copilot__chip"
          onClick={() => openAskAi(c.label)}
        >
          <Icon name={c.icon} size={13} />
          {c.label}
        </button>
      ))}
    </div>
  );
}

/** The Repulabs AI frog (brand-coloured 3D mascot) in place of the old robot
 *  image. Clicking him opens the assistant. */
export function CopilotMascot() {
  return (
    <button
      type="button"
      className="dk-copilot__frog"
      onClick={() => openAskAi()}
      aria-label="Open the Repulabs AI assistant"
    >
      <FrogMascot size={148} name="Repulabs AI" followPointer />
    </button>
  );
}
