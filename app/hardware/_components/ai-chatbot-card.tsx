"use client";

import { openAskAi } from "@/components/ask-ai";
import { LazyFrog } from "@/components/ui/lazy-frog";
import { ArrowUp, MessageCircle, ShieldAlert, Sparkles, TrendingUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * My Devices — AI assistant card, ChatGPT-style (2026-11 redesign).
 *
 * The frog greets in the middle, suggestion chips sit under the greeting, and
 * the ask box (the same Google-ring composer as the dashboard hero) is pinned
 * to the bottom, so the card fills its height instead of leaving a blank
 * block. Everything opens the GLOBAL Ask-repulabs assistant via
 * `openAskAi(prompt)` (no second chat surface, no dead inputs).
 */

const PROMPTS = [
  { label: "Summarize scan activity", icon: Sparkles },
  { label: "Identify low ratings & risks", icon: ShieldAlert },
  { label: "Suggest replies for new reviews", icon: MessageCircle },
  { label: "Improve conversion rate", icon: TrendingUp },
] as const;

export function AiChatbotCard() {
  const [draft, setDraft] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  // Grow with the text, up to ~5 lines.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when the text changes
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [draft]);

  function submit(text: string) {
    const q = text.trim();
    if (!q) return;
    openAskAi(q);
    setDraft("");
  }

  return (
    <section className="md-card md-ai" aria-label="AI assistant">
      <div className="md-ai__head">
        <h3 className="md-card__title">AI assistant</h3>
        <span className="md-ai__badge">New</span>
      </div>

      <div className="md-ai__hello">
        <button
          type="button"
          className="md-ai__frog"
          onClick={() => openAskAi()}
          aria-label="Open the Repulabs AI assistant"
        >
          <LazyFrog size={104} showTag={false} followPointer />
        </button>
        <p className="md-ai__greet">How can I help with your devices?</p>
        <p className="md-ai__sub">Ask about scans, ratings and reviews from your QR stands.</p>

        <div className="md-ai__chips">
          {PROMPTS.map((p) => (
            <button
              key={p.label}
              type="button"
              className="md-ai__chip"
              onClick={() => submit(p.label)}
            >
              <p.icon size={14} strokeWidth={1.9} aria-hidden="true" />
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <form
        className="md-ai__box"
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
          placeholder="Ask anything about your devices…"
          aria-label="Ask the AI assistant a question"
          className="md-ai__input"
        />
        <button
          type="submit"
          className="md-ai__send"
          aria-label="Send to AI assistant"
          disabled={draft.trim().length === 0}
        >
          <ArrowUp size={16} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </form>
    </section>
  );
}
