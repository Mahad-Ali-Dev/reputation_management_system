"use client";

import { Icon } from "@/components/shell/icon";
import Link from "next/link";
import { type JSX, useCallback, useRef, useState } from "react";

/**
 * `<AiIntelligenceCenter>` — the dashboard's agentic surface (right rail, below
 * the feed). Renders the server-computed daily briefing (or a new-user welcome
 * with two pill actions) and an "ask anything about your business" input wired
 * to `POST /api/ai/assistant`.
 *
 * The briefing text is computed server-side (deterministic, no AI spend on
 * render — see `lib/dashboard/briefing.ts`) and passed in as `briefing`. The
 * chat input reuses the proven fetch/pending/error loop from `ask-ai.tsx`.
 *
 * Graceful degradation: 402 (plan inactive) → upgrade nudge; 429 (rate/budget)
 * → "try again shortly"; 401/500 → friendly retry message.
 *
 * Posts `{ mode: "dashboard", messages }` so the route prepends an org-scoped
 * context block (recent review snippets + KB doc titles) — the operator's
 * "ask anything about your business" answers reference THEIR data. The route
 * applies the same entitlement / rate / budget gates regardless of mode.
 */

type ChatMsg = { role: "user" | "assistant"; content: string };

const STARTERS = ["Summarize my reviews", "How can I improve?", "Draft a thank-you reply"];

export function AiIntelligenceCenter({
  briefing,
  isEmpty,
}: {
  /** Server-computed briefing sentence. */
  briefing: string;
  /** New-account variant: show connect/training pills instead of starters. */
  isEmpty: boolean;
}): JSX.Element {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || pending) return;
      setError(null);
      const next: ChatMsg[] = [...messages, { role: "user", content: trimmed }];
      setMessages(next);
      setDraft("");
      setPending(true);
      try {
        const res = await fetch("/api/ai/assistant", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mode: "dashboard", messages: next }),
        });
        if (res.status === 402) {
          setError("AI insights are a Pro feature. Upgrade in Settings → Subscription.");
          return;
        }
        if (res.status === 429) {
          setError("You're moving fast — give it a moment and try again.");
          return;
        }
        if (res.status === 401) {
          setError("Your session expired. Refresh the page and sign in again.");
          return;
        }
        const data = (await res.json().catch(() => ({}))) as {
          answer?: string;
          message?: string;
          error?: string;
        };
        if (!res.ok || !data.answer) {
          setError(data.message ?? data.error ?? "I couldn't reach the assistant. Try again shortly.");
          return;
        }
        setMessages((m) => [...m, { role: "assistant", content: data.answer ?? "" }]);
        // Scroll the thread to the latest answer.
        requestAnimationFrame(() => {
          if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        });
      } catch {
        setError("Network error. Check your connection and try again.");
      } finally {
        setPending(false);
      }
    },
    [messages, pending],
  );

  return (
    <div className="ds-card ai-center">
      <div className="ds-card__head">
        <div className="row" style={{ gap: 7 }}>
          <Icon name="sparkle" size={15} style={{ color: "var(--pri)" }} />
          <h3 className="ds-card__title">AI Intelligence Center</h3>
        </div>
      </div>
      <div className="ds-card__body">
        {/* Briefing bubble (server-computed) */}
        <div className="ai-center__bubble">{briefing}</div>

        {/* Conversation thread (only once the operator has asked something) */}
        {messages.length > 0 && (
          <div
            ref={scrollRef}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              maxHeight: 220,
              overflowY: "auto",
              marginBottom: 10,
            }}
          >
            {messages.map((m, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: append-only message list
                key={`m-${i}`}
                style={{
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "88%",
                  background: m.role === "user" ? "var(--pri)" : "var(--surface-2)",
                  color: m.role === "user" ? "#fff" : "var(--ink)",
                  padding: "8px 11px",
                  borderRadius: 11,
                  fontSize: 12.5,
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                }}
              >
                {m.content}
              </div>
            ))}
            {pending && (
              <div
                style={{
                  alignSelf: "flex-start",
                  background: "var(--surface-2)",
                  color: "var(--rl-muted)",
                  padding: "8px 11px",
                  borderRadius: 11,
                  fontSize: 12.5,
                }}
              >
                Thinking…
              </div>
            )}
          </div>
        )}

        {error && (
          <div
            role="alert"
            style={{
              background: "var(--bad-soft)",
              color: "var(--bad)",
              padding: "8px 11px",
              borderRadius: 10,
              fontSize: 12,
              marginBottom: 10,
            }}
          >
            {error}
          </div>
        )}

        {/* Input row */}
        <form
          className="ai-center__input"
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
        >
          <input
            className="ds-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask me anything about your business…"
            disabled={pending}
            aria-label="Ask the AI assistant"
            style={{ height: 36, fontSize: 12.5 }}
          />
          <button
            type="submit"
            className="btn btn--accent btn--sm"
            aria-label="Ask"
            disabled={pending || draft.trim().length === 0}
          >
            <Icon name="arrowR" size={13} />
          </button>
        </form>

        {/* Suggestion / welcome pills */}
        {isEmpty ? (
          <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: "wrap" }}>
            <Link href="/connections" className="chip chip--out" style={{ textDecoration: "none", gap: 5 }}>
              <Icon name="plug" size={11} /> Connect Google Business
            </Link>
            <Link href="/ai/training" className="chip chip--out" style={{ textDecoration: "none", gap: 5 }}>
              <Icon name="brain" size={11} /> Set up AI knowledge base
            </Link>
          </div>
        ) : (
          <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: "wrap" }}>
            {STARTERS.map((s) => (
              <button
                key={s}
                type="button"
                className="chip chip--out"
                onClick={() => send(s)}
                disabled={pending}
                style={{ cursor: "pointer", border: "none" }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
