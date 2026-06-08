"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/shell/icon";

/**
 * Test AI panel — an isolated in-app chat tester for the owner.
 *
 * Posts each turn to /api/ai/kb-test (authed + entitled). Renders Suggested Test
 * Questions as click-to-send chips and thumbs up/down on each answer. A
 * thumbs-down (or a low returned confidence) feeds the Learning Monitor via the
 * gap queue. Message-bubble styling shape mirrors components/ask-ai.tsx (copied,
 * not imported — that one is wired to the product-guide route).
 */

type Turn = {
  id: string;
  role: "user" | "assistant";
  text: string;
  confidence?: number;
  fallback?: boolean;
  aiMessageId?: string | null;
  question?: string; // the question that produced an assistant turn (for feedback)
  rated?: "up" | "down";
};

export function TestAiTab({ suggestions }: { suggestions: string[] }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const convId = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  async function send(question: string) {
    const q = question.trim();
    if (!q || pending) return;
    setError(null);
    setInput("");
    const userTurn: Turn = { id: `u-${Date.now()}`, role: "user", text: q };
    setTurns((t) => [...t, userTurn]);
    setPending(true);

    try {
      const res = await fetch("/api/ai/kb-test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q, conversationId: convId.current }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        answer?: string;
        confidence?: number;
        fallback?: boolean;
        conversationId?: string;
        aiMessageId?: string | null;
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(data.message ?? "The tester hit an error. Try again.");
        setPending(false);
        return;
      }
      if (data.conversationId) convId.current = data.conversationId;
      setTurns((t) => [
        ...t,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          text: data.answer ?? "(no answer)",
          confidence: data.confidence,
          fallback: data.fallback,
          aiMessageId: data.aiMessageId ?? null,
          question: q,
        },
      ]);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setPending(false);
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }));
    }
  }

  async function rate(turn: Turn, vote: "up" | "down") {
    setTurns((t) => t.map((x) => (x.id === turn.id ? { ...x, rated: vote } : x)));
    if (vote === "down" && turn.question) {
      // Feed the gap queue so the Learning Monitor surfaces it.
      void fetch("/api/ai/kb-test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          feedback: "down",
          question: turn.question,
          answer: turn.text,
          aiMessageId: turn.aiMessageId ?? undefined,
        }),
      }).catch(() => {});
    }
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 280px",
        gap: 16,
        alignItems: "flex-start",
      }}
    >
      {/* Chat column */}
      <div className="ds-card" style={{ display: "flex", flexDirection: "column", minHeight: 460 }}>
        <div className="ds-card__head">
          <div>
            <h3 className="ds-card__title">Test your AI</h3>
            <div className="ds-card__sub">Ask what a customer would. Rate answers to teach it.</div>
          </div>
          <span className="chip chip--info">
            <Icon name="bot" size={12} />
            Live
          </span>
        </div>

        <div
          ref={scrollRef}
          style={{ flex: 1, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12, maxHeight: 420 }}
        >
          {turns.length === 0 && (
            <div className="dim" style={{ fontSize: 13, textAlign: "center", margin: "auto", maxWidth: 280 }}>
              Send a question below, or tap a suggested question to start.
            </div>
          )}
          {turns.map((t) => (
            <div key={t.id} style={{ display: "flex", justifyContent: t.role === "user" ? "flex-end" : "flex-start" }}>
              <div style={{ maxWidth: "80%" }}>
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: 14,
                    fontSize: 13,
                    lineHeight: 1.55,
                    whiteSpace: "pre-wrap",
                    background: t.role === "user" ? "var(--pri)" : "var(--surface-3)",
                    color: t.role === "user" ? "#fff" : "var(--ink)",
                    border: t.role === "user" ? "none" : "1px solid var(--line)",
                  }}
                >
                  {t.text}
                </div>
                {t.role === "assistant" && (
                  <div className="row" style={{ gap: 8, marginTop: 6, alignItems: "center" }}>
                    {typeof t.confidence === "number" && (
                      <span
                        className={`chip ${t.confidence >= 0.7 ? "chip--ok" : t.confidence >= 0.4 ? "chip--warn" : "chip--bad"}`}
                        style={{ fontSize: 10 }}
                      >
                        {Math.round(t.confidence * 100)}% confident
                      </span>
                    )}
                    <button
                      type="button"
                      aria-label="Good answer"
                      onClick={() => rate(t, "up")}
                      className={`btn btn--xs ${t.rated === "up" ? "btn--pri" : ""}`}
                    >
                      <Icon name="checkCircle" size={12} />
                    </button>
                    <button
                      type="button"
                      aria-label="Bad answer — teach the AI"
                      onClick={() => rate(t, "down")}
                      className={`btn btn--xs ${t.rated === "down" ? "btn--danger" : ""}`}
                    >
                      <Icon name="xCircle" size={12} />
                    </button>
                    {t.rated === "down" && (
                      <span className="dim" style={{ fontSize: 11 }}>
                        Added to Learning Monitor →
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          {pending && (
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <div className="chip" style={{ fontSize: 12 }}>
                <Icon name="refresh" size={12} /> thinking…
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="chip chip--bad" style={{ margin: "0 18px 8px", whiteSpace: "normal" }}>
            <Icon name="alert" size={12} />
            {error}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          style={{ display: "flex", gap: 8, padding: 14, borderTop: "1px solid var(--line)" }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask your AI a question…"
            disabled={pending}
            style={{
              flex: 1,
              height: 40,
              padding: "0 14px",
              borderRadius: "var(--r)",
              border: "1px solid var(--line)",
              background: "var(--surface)",
              color: "var(--ink)",
              fontSize: 13,
              outline: "none",
            }}
          />
          <button type="submit" className="btn btn--pri" disabled={pending || !input.trim()}>
            <Icon name="send" size={13} />
            Send
          </button>
        </form>
      </div>

      {/* Suggested questions */}
      <div className="ds-card">
        <div className="ds-card__head">
          <h3 className="ds-card__title">Suggested questions</h3>
        </div>
        <div className="ds-card__body col" style={{ gap: 8 }}>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => void send(s)}
              disabled={pending}
              className="btn"
              style={{ justifyContent: "flex-start", textAlign: "left", fontSize: 12.5, whiteSpace: "normal", height: "auto", padding: "8px 12px" }}
            >
              {s}
            </button>
          ))}
          <div className="dim" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.5 }}>
            Try a question your knowledge base doesn&apos;t cover — a thumbs-down sends it to the
            Learning Monitor so you can teach it.
          </div>
        </div>
      </div>
    </div>
  );
}
