"use client";

import { openAskAi } from "@/components/ask-ai";
import { Icon, type IconName } from "@/components/shell/icon";
import { useState } from "react";

/**
 * Dashboard "Your AI copilot" prompt panel (design kit, bottom section).
 *
 * Client island: the input + suggestion chips are wired to the REAL global
 * Ask-AI assistant (components/ask-ai.tsx) via its `openAskAi(prompt)` window
 * event — submitting here opens the slide-over with the question already sent.
 * No dead inputs.
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
    <div className="dk-copilot__controls">
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
      <div className="dk-copilot__chips">
        {CHIPS.map((c) => (
          <button key={c.label} type="button" className="dk-copilot__chip" onClick={() => openAskAi(c.label)}>
            <Icon name={c.icon} size={13} />
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
