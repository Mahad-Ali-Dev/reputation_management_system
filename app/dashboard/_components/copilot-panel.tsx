"use client";

import { openAskAi } from "@/components/ask-ai";
import { Icon, type IconName } from "@/components/shell/icon";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

// three.js loads only on the dashboard (and only in the browser) — never in
// the server render or the shared bundle.
const FrogMascot = dynamic(
  () => import("@/components/ui/ai-agent-mascot").then((m) => m.FrogMascot),
  { ssr: false, loading: () => <div className="dk-copilot__frog-ph" aria-hidden="true" /> },
);

/**
 * Dashboard AI islands: the frog mascot and the ChatGPT-style ask box. Both
 * are wired to the REAL global Ask-AI assistant (components/ask-ai.tsx) via
 * its `openAskAi(prompt)` window event, which opens the full-screen panel
 * with the question already sent.
 */

const CHIPS: Array<{ icon: IconName; label: string }> = [
  { icon: "chat", label: "Summarize recent reviews" },
  { icon: "trend", label: "Why did my rating change?" },
  { icon: "star", label: "Show top customer compliments" },
  { icon: "sparkle", label: "How to get more 5-star reviews?" },
];

/** The Repulabs AI frog (brand-coloured 3D mascot) that greets above the
 *  dashboard ask box. Clicking him opens the assistant. */
export function CopilotMascot({ size = 148 }: { size?: number }) {
  return (
    <button
      type="button"
      className="dk-copilot__frog"
      onClick={() => openAskAi()}
      aria-label="Open the Repulabs AI assistant"
    >
      <FrogMascot size={size} name="Repulabs AI" followPointer />
    </button>
  );
}

/**
 * ChatGPT-style ask box for the top of the dashboard: one large rounded
 * composer that grows with the text, Enter to send (Shift+Enter = newline),
 * a round up-arrow send button, and suggestion chips under it. Sending opens
 * the global Ask Repulabs panel with the question already submitted.
 */
export function HeroAsk() {
  const [draft, setDraft] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  // Grow with the text, up to ~6 lines.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when the text changes
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [draft]);

  const submit = (text: string) => {
    const q = text.trim();
    if (!q) return;
    openAskAi(q);
    setDraft("");
  };

  return (
    <div className="dk-ask__wrap">
      <form
        className="dk-ask__box"
        onSubmit={(e) => {
          e.preventDefault();
          submit(draft);
        }}
      >
        <textarea
          ref={ref}
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(draft);
            }
          }}
          placeholder="Ask about your reviews, customers or ratings…"
          aria-label="Ask Repulabs AI"
          className="dk-ask__input"
        />
        <div className="dk-ask__bar">
          <span className="dk-ask__hint">
            <Icon name="sparkle" size={13} /> Repulabs AI
          </span>
          <button
            type="submit"
            className="dk-ask__send"
            aria-label="Send question"
            disabled={draft.trim().length === 0}
          >
            <svg width="16" height="16" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M7 12V2M7 2L2.5 6.5M7 2L11.5 6.5"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </form>
      <div className="dk-ask__chips">
        {CHIPS.map((c) => (
          <button
            key={c.label}
            type="button"
            className="dk-ask__chip"
            onClick={() => submit(c.label)}
          >
            <Icon name={c.icon} size={13} />
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
