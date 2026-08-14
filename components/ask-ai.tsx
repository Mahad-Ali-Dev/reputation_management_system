"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "How do I connect Google Business Profile?",
  "How do I send a review request?",
  "Where do I approve AI-drafted replies?",
  "How does the AI phone receptionist work?",
  "How do I generate a QR code for my business?",
];

/**
 * Window event that opens the assistant panel from anywhere (same pattern as
 * the ⌘K palette's OPEN_EVENT — no prop-drilling through the server shell).
 * `detail.prompt`, when present, is submitted as the first question.
 */
export const ASK_AI_OPEN_EVENT = "repulabs:open-ask-ai";

/** Convenience for triggers elsewhere (e.g. the dashboard AI-copilot panel). */
export function openAskAi(prompt?: string) {
  window.dispatchEvent(new CustomEvent(ASK_AI_OPEN_EVENT, { detail: { prompt } }));
}

/**
 * Floating "Ask repulabs" assistant.
 *
 * Rendered globally from app/layout.tsx (Providers tree). The launcher is a
 * fixed circular button in the bottom-right corner of the viewport — always
 * accessible regardless of which page you're on. Clicking it opens a slide-
 * over panel from the right.
 *
 * Auth: panel is a no-op for unauthenticated visitors (silently hides if
 * the /api/ai/assistant 401s).
 *
 * Persists nothing across reloads. Submits to /api/ai/assistant which talks
 * to Claude Haiku with a system prompt that knows the product surface area.
 */
export function AskAi() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [available, setAvailable] = useState(true);
  // null = still checking; the chat area blurs with an upgrade message once
  // this resolves to false, instead of only surfacing the plan gate after a
  // free-plan visitor types a question and the POST comes back 402.
  const [entitled, setEntitled] = useState<boolean | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/ai/assistant")
      .then((res) => (res.ok ? res.json() : { entitled: true }))
      .then((data: { entitled?: boolean }) => {
        if (!cancelled) setEntitled(data.entitled !== false);
      })
      .catch(() => {
        if (!cancelled) setEntitled(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const close = useCallback(() => setOpen(false), []);

  // Esc closes the panel
  // biome-ignore lint/correctness/useExhaustiveDependencies: close is stable from useCallback
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Auto-scroll to latest message
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally re-runs on dep change to scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [pending]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || pending) return;
      setError(null);
      const next: Message[] = [...messages, { role: "user", content: trimmed }];
      setMessages(next);
      setDraft("");
      setPending(true);
      try {
        const res = await fetch("/api/ai/assistant", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages: next }),
        });
        if (res.status === 401) {
          setAvailable(false);
          return;
        }
        if (res.status === 402) {
          setEntitled(false);
          return;
        }
        const data = (await res.json().catch(() => ({}))) as {
          answer?: string;
          message?: string;
          error?: string;
        };
        if (!res.ok || !data.answer) {
          setError(
            data.message ??
              data.error ??
              "I couldn't reach the assistant right now. Try again in a moment.",
          );
          return;
        }
        setMessages((m) => [...m, { role: "assistant", content: data.answer ?? "" }]);
      } catch {
        setError("Network error. Check your connection and try again.");
      } finally {
        setPending(false);
      }
    },
    [messages, pending],
  );

  // External opener (dashboard AI-copilot panel, etc.): open the slide-over
  // and, when a prompt is supplied, submit it immediately — no dead inputs.
  useEffect(() => {
    function onOpen(e: Event) {
      setOpen(true);
      const prompt = (e as CustomEvent<{ prompt?: string }>).detail?.prompt;
      if (prompt?.trim()) send(prompt);
    }
    window.addEventListener(ASK_AI_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(ASK_AI_OPEN_EVENT, onOpen);
  }, [send]);

  // Hide the launcher entirely if the assistant API is unavailable
  // (e.g. logged-out visitor on a public page).
  if (!available) return null;

  return (
    <>
      {/* Floating launcher — bottom-right corner */}
      {!open && (
        <button
          type="button"
          aria-label="Ask repulabs assistant"
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
          className="ask-ai-launcher"
          style={{
            position: "fixed",
            bottom: 20,
            right: 20,
            zIndex: 60,
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "linear-gradient(140deg, var(--pri, #2563eb) 0%, #6366f1 100%)",
            color: "#fff",
            border: "none",
            cursor: "pointer",
            display: "grid",
            placeItems: "center",
            boxShadow: "0 12px 32px -8px rgba(37,99,235,.55), 0 4px 12px -4px rgba(11,13,14,.18)",
            transition: "transform .15s ease, box-shadow .15s ease",
          }}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <title>Chat</title>
            <path d="M21 12a8 8 0 0 1-12.4 6.7L3 20l1.3-5.3A8 8 0 1 1 21 12Z" />
          </svg>
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: 4,
              right: 4,
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: "#34D399",
              boxShadow: "0 0 0 2px var(--surface, #fff)",
            }}
          />
        </button>
      )}

      {open && (
        <>
          {/* Scrim — click to close */}
          <button
            type="button"
            aria-label="Close assistant"
            onClick={close}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(11,13,14,.32)",
              zIndex: 60,
              border: "none",
              cursor: "default",
            }}
          />

          {/* Slide-over panel — right edge */}
          {/* biome-ignore lint/a11y/useSemanticElements: dialog role on aside is intentional for slide-over panels */}
          <aside
            role="dialog"
            aria-label="Ask repulabs assistant"
            style={{
              position: "fixed",
              right: 0,
              top: 0,
              bottom: 0,
              width: "min(440px, 100vw)",
              background: "var(--surface, #fff)",
              borderLeft: "1px solid var(--line, #e2e8f0)",
              boxShadow: "-12px 0 30px -10px rgba(11,13,14,.18)",
              zIndex: 61,
              display: "flex",
              flexDirection: "column",
              animation: "ask-ai-in .2s ease-out",
            }}
          >
            <header
              style={{
                padding: "14px 16px",
                borderBottom: "1px solid var(--line, #e2e8f0)",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span
                style={{
                  display: "grid",
                  placeItems: "center",
                  width: 32,
                  height: 32,
                  borderRadius: 9,
                  background: "var(--pri-50, #eff6ff)",
                  border: "1px solid var(--pri-100, #dbeafe)",
                  flexShrink: 0,
                  overflow: "hidden",
                }}
              >
                <Image
                  src="/repulabs-logo.png"
                  alt=""
                  width={26}
                  height={26}
                  style={{ borderRadius: 6, objectFit: "contain" }}
                />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Ask repulabs</div>
                <div style={{ fontSize: 11.5, color: "var(--rl-muted, #94a3b8)" }}>
                  Your in-app product guide
                </div>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  border: "none",
                  background: "transparent",
                  color: "var(--rl-muted)",
                  cursor: "pointer",
                  fontSize: 16,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </header>

            <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div
              inert={entitled === false ? true : undefined}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
                ...(entitled === false
                  ? { filter: "blur(4px)", opacity: 0.55, userSelect: "none" }
                  : {}),
              }}
            >
            <div
              ref={scrollRef}
              style={{
                flex: 1,
                overflowY: "auto",
                padding: 16,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {messages.length === 0 && (
                <div>
                  <p
                    style={{
                      fontSize: 13,
                      color: "var(--ink-2, #334155)",
                      marginTop: 0,
                      marginBottom: 14,
                      lineHeight: 1.55,
                    }}
                  >
                    Hi — I'm your in-app guide. Ask me how anything works, or pick a starter below.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => send(s)}
                        style={{
                          textAlign: "left",
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "1px solid var(--line, #e2e8f0)",
                          background: "var(--surface-2, #fafbf8)",
                          fontSize: 12.5,
                          cursor: "pointer",
                          color: "var(--ink, #0f172a)",
                          lineHeight: 1.4,
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m, i) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: append-only message list
                  key={`m-${i}`}
                  style={{
                    alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                    maxWidth: "85%",
                    background:
                      m.role === "user" ? "var(--pri, #2563eb)" : "var(--surface-2, #f1f5f9)",
                    color: m.role === "user" ? "#fff" : "var(--ink, #0f172a)",
                    padding: "8px 12px",
                    borderRadius: 12,
                    fontSize: 13,
                    lineHeight: 1.55,
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
                    background: "var(--surface-2, #f1f5f9)",
                    padding: "10px 14px",
                    borderRadius: 12,
                    fontSize: 13,
                    color: "var(--rl-muted)",
                    display: "flex",
                    gap: 4,
                    alignItems: "center",
                  }}
                >
                  <Dot delay={0} />
                  <Dot delay={150} />
                  <Dot delay={300} />
                </div>
              )}

              {error && (
                <div
                  style={{
                    alignSelf: "stretch",
                    background: "var(--bad-soft, #fee2e2)",
                    color: "var(--bad, #b91c1c)",
                    padding: "8px 12px",
                    borderRadius: 10,
                    fontSize: 12.5,
                  }}
                >
                  {error}
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(draft);
              }}
              style={{
                padding: 12,
                borderTop: "1px solid var(--line, #e2e8f0)",
                display: "flex",
                gap: 8,
              }}
            >
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Type your question…"
                disabled={pending || entitled === false}
                style={{
                  flex: 1,
                  height: 38,
                  padding: "0 12px",
                  borderRadius: 10,
                  border: "1px solid var(--line, #e2e8f0)",
                  background: "var(--surface, #fff)",
                  fontSize: 13,
                  outline: "none",
                }}
                // biome-ignore lint/a11y/noAutofocus: chat input gets focus when panel opens (desired UX)
                autoFocus={entitled !== false}
              />
              <button
                type="submit"
                disabled={pending || entitled === false || draft.trim().length === 0}
                style={{
                  height: 38,
                  padding: "0 14px",
                  borderRadius: 10,
                  background: "var(--ink)",
                  color: "#fff",
                  border: "none",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: pending || draft.trim().length === 0 ? "default" : "pointer",
                  opacity: pending || draft.trim().length === 0 ? 0.6 : 1,
                }}
              >
                Send
              </button>
            </form>
            </div>

            {entitled === false && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  padding: 24,
                  textAlign: "center",
                  background: "rgba(255,255,255,0.4)",
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "3px 10px",
                    borderRadius: 999,
                    background: "var(--pri-50, #eff6ff)",
                    border: "1px solid var(--pri-100, #dbeafe)",
                    color: "var(--pri, #2563eb)",
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  Pro feature
                </span>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--ink, #0f172a)" }}>
                  Available for Pro
                </p>
                <p
                  style={{
                    margin: 0,
                    fontSize: 12,
                    color: "var(--rl-muted, #64748b)",
                    maxWidth: 260,
                    lineHeight: 1.5,
                  }}
                >
                  Upgrade to unlock the in-app AI assistant for your whole team.
                </p>
                <a
                  href="/subscription"
                  onClick={close}
                  style={{
                    marginTop: 6,
                    display: "inline-flex",
                    alignItems: "center",
                    height: 34,
                    padding: "0 16px",
                    borderRadius: 10,
                    background: "var(--pri, #2563eb)",
                    color: "#fff",
                    fontSize: 12.5,
                    fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  Upgrade to Pro
                </a>
              </div>
            )}
            </div>
          </aside>
        </>
      )}
    </>
  );
}

function Dot({ delay }: { delay: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: "currentColor",
        animation: `ask-ai-blink 1.2s ${delay}ms infinite`,
      }}
    />
  );
}
