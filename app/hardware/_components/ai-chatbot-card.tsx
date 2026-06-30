"use client";

import { Icon } from "@/components/shell/icon";
import { openAskAi } from "@/components/ask-ai";
import { useState } from "react";

/**
 * My Devices kit — AI Chatbot card.
 *
 * Wires the kit's "Ask anything" panel to the GLOBAL Ask-repulabs assistant via
 * `openAskAi(prompt)` (the same opener the dashboard copilot uses — no second
 * chat surface, no dead inputs). Prompt chips submit immediately; the inline
 * input opens the assistant with the typed question on submit/Send.
 */

const PROMPTS = [
  "Summarize scan activity",
  "Identify low ratings & risks",
  "Suggest replies for new reviews",
  "Improve conversion rate",
] as const;

export function AiChatbotCard({ orbSrc }: { orbSrc: string }) {
  const [draft, setDraft] = useState("");

  function submit() {
    const q = draft.trim();
    if (!q) return;
    openAskAi(q);
    setDraft("");
  }

  return (
    <section className="md-card md-chat" aria-label="AI Chatbot">
      {/* biome-ignore lint/performance/noImgElement: static kit illustration (large SVG, not inlined) */}
      <img src={orbSrc} alt="" aria-hidden className="md-chat__orb" width={64} height={64} />
      <div className="md-card__head" style={{ padding: 0 }}>
        <h3 className="md-card__title">AI Chatbot</h3>
        <span className="chip chip--pri" style={{ height: 18, fontSize: 10, marginLeft: 8 }}>
          New
        </span>
      </div>
      <p className="md-chat__body">Get AI-powered help to manage reviews faster.</p>

      <div className="md-chat__prompts">
        {PROMPTS.map((p) => (
          <button key={p} type="button" className="md-chat__prompt" onClick={() => openAskAi(p)}>
            <Icon name="sparkle" size={13} style={{ color: "var(--md-purple)", flexShrink: 0 }} />
            {p}
          </button>
        ))}
      </div>

      <form
        className="md-chat__inputrow"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask anything..."
          aria-label="Ask the AI assistant a question"
          style={{
            flex: 1,
            height: 40,
            padding: "0 14px",
            borderRadius: 11,
            border: "1px solid var(--md-line-strong)",
            background: "#fff",
            fontSize: 13,
            outline: "none",
            color: "var(--md-ink)",
          }}
        />
        <button
          type="submit"
          className="md-chat__send"
          aria-label="Send to AI assistant"
          disabled={draft.trim().length === 0}
          style={{ opacity: draft.trim().length === 0 ? 0.55 : 1 }}
        >
          <Icon name="send" size={17} />
        </button>
      </form>
    </section>
  );
}
