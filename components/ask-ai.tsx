"use client";

import type { FrogMascotState } from "@/components/ui/ai-agent-mascot";
import { PromptInput } from "@/components/ui/ai-chat-input";
import {
  ArrowRight,
  CornerDownRight,
  Link2,
  MessageSquareReply,
  Phone,
  QrCode,
  Sparkle,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import "./ask-ai.css";

// three.js is ~600 kB: load the 3D mascot only when the panel first opens,
// never as part of the global bundle this provider ships on every page.
const FrogMascot = dynamic(
  () => import("@/components/ui/ai-agent-mascot").then((m) => m.FrogMascot),
  { ssr: false, loading: () => <div className="askai-stage__placeholder" aria-hidden="true" /> },
);

type Message = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  { q: "How do I connect Google Business Profile?", icon: Link2 },
  { q: "How do I send a review request?", icon: CornerDownRight },
  { q: "Where do I approve AI-drafted replies?", icon: MessageSquareReply },
  { q: "How does the AI phone receptionist work?", icon: Phone },
  { q: "How do I generate a QR code for my business?", icon: QrCode },
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
  // Briefly true after an answer lands, so the mascot does its happy hop.
  const [justAnswered, setJustAnswered] = useState(false);
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

  useEffect(() => {
    if (!justAnswered) return;
    const t = setTimeout(() => setJustAnswered(false), 3500);
    return () => clearTimeout(t);
  }, [justAnswered]);

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
      setJustAnswered(false);
      const next: Message[] = [...messages, { role: "user", content: trimmed }];
      setMessages(next);
      setDraft("");
      setPending(true);
      // A stalled model call used to leave the typing dots up forever.
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 60_000);
      try {
        const res = await fetch("/api/ai/assistant", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages: next }),
          signal: ctrl.signal,
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
        setJustAnswered(true);
      } catch (err) {
        setError(
          err instanceof DOMException && err.name === "AbortError"
            ? "The assistant took too long to answer. Try again in a moment."
            : "Network error. Check your connection and try again.",
        );
      } finally {
        clearTimeout(timer);
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

  const locked = entitled === false;
  const mascotState: FrogMascotState = pending
    ? "thinking"
    : error
      ? "limit"
      : justAnswered
        ? "done"
        : "idle";
  const chatting = messages.length > 0 || pending || !!error;

  return (
    <div className="askai">
      {!open && (
        <button
          type="button"
          aria-label="Ask Repulabs assistant"
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
          className="askai-launcher"
        >
          {/* The Repulabs AI frog (same mascot as the dashboard) with a
              sparkle badge marking it as the AI assistant. */}
          <img
            src="/assets/repulabs/ai/frog-launcher.png"
            alt=""
            width={38}
            height={29}
            className="askai-launcher__frog"
            draggable={false}
          />
          <span className="askai-launcher__badge" aria-hidden="true">
            <Sparkle size={11} strokeWidth={2.4} />
          </span>
        </button>
      )}

      {open && (
        <>
          <button
            type="button"
            aria-label="Close assistant"
            onClick={close}
            className="askai-scrim"
          />

          {/* biome-ignore lint/a11y/useSemanticElements: dialog role on aside is intentional for slide-over panels */}
          <aside role="dialog" aria-label="Ask Repulabs assistant" className="askai-sheet">
            <header className="askai-head">
              {/* Same frog + sparkle badge as the launcher button. */}
              <span className="askai-mark" aria-hidden="true">
                <img
                  src="/assets/repulabs/ai/frog-launcher.png"
                  alt=""
                  width={28}
                  height={21}
                  className="askai-mark__frog"
                  draggable={false}
                />
                <span className="askai-mark__badge">
                  <Sparkle size={9} strokeWidth={2.6} />
                </span>
              </span>
              <div>
                <p className="askai-title">Ask Repulabs</p>
                <p className="askai-sub">
                  <span className="askai-live" aria-hidden="true" />
                  Your product guide
                </p>
              </div>
              <button type="button" onClick={close} aria-label="Close" className="askai-iconbtn">
                <X size={16} strokeWidth={2} aria-hidden="true" />
              </button>
            </header>

            <div className="askai-body">
              <div
                inert={locked ? true : undefined}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  minHeight: 0,
                  ...(locked ? { filter: "blur(4px)", opacity: 0.55, userSelect: "none" } : {}),
                }}
              >
                <div className={`askai-stage${chatting ? " askai-stage--compact" : ""}`}>
                  <FrogMascot
                    state={mascotState}
                    size={chatting ? 104 : 168}
                    name="Repulabs AI"
                    followPointer
                    statusLabels={{ thinking: "Thinking…", limit: "Couldn't answer" }}
                  />
                </div>

                <div ref={scrollRef} className="askai-scroll">
                  {messages.length === 0 && (
                    <div className="askai-hello">
                      <h3>Hi, how can I help?</h3>
                      <p>Ask how anything in Repulabs works, or start with one of these.</p>
                      <div className="askai-suggest">
                        {SUGGESTIONS.map((s) => (
                          <button
                            key={s.q}
                            type="button"
                            onClick={() => send(s.q)}
                            className="askai-chip"
                          >
                            <span className="askai-chip__icon" aria-hidden="true">
                              <s.icon size={15} strokeWidth={1.9} />
                            </span>
                            {s.q}
                            <ArrowRight
                              size={14}
                              className="askai-chip__arrow"
                              aria-hidden="true"
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {messages.map((m, i) => (
                    <div
                      // biome-ignore lint/suspicious/noArrayIndexKey: append-only message list
                      key={`m-${i}`}
                      className={`askai-row${m.role === "user" ? " askai-row--user" : ""}`}
                    >
                      {m.role === "assistant" && (
                        <span className="askai-avatar" aria-hidden="true">
                          <img
                            src="/assets/repulabs/ai/frog-launcher.png"
                            alt=""
                            width={19}
                            height={15}
                            className="askai-avatar__frog"
                            draggable={false}
                          />
                        </span>
                      )}
                      <div
                        className={`askai-bubble ${m.role === "user" ? "askai-bubble--user" : "askai-bubble--bot"}`}
                      >
                        {m.content}
                      </div>
                    </div>
                  ))}

                  {pending && (
                    <div className="askai-row">
                      <span className="askai-avatar" aria-hidden="true">
                        <img
                          src="/assets/repulabs/ai/frog-launcher.png"
                          alt=""
                          width={19}
                          height={15}
                          className="askai-avatar__frog"
                          draggable={false}
                        />
                      </span>
                      <div
                        className="askai-bubble askai-bubble--bot"
                        aria-label="Assistant is typing"
                      >
                        <span className="askai-typing" aria-hidden="true">
                          <span />
                          <span />
                          <span />
                        </span>
                      </div>
                    </div>
                  )}

                  {error && (
                    <div className="askai-error" role="alert">
                      {error}
                    </div>
                  )}
                </div>

                <div className="askai-composer">
                  <PromptInput
                    value={draft}
                    onChange={setDraft}
                    onSubmit={(v) => send(v)}
                    placeholder="Ask anything…"
                    disabled={pending || locked}
                    collapsedWidth="72%"
                    expandedWidth="100%"
                    className="mx-auto"
                    cardClassName="askai-input-card"
                  />
                  <p className="askai-foot">AI answers can be wrong. Check anything important.</p>
                </div>
              </div>

              {locked && (
                <div className="askai-gate">
                  <span className="askai-gate__pill">Pro feature</span>
                  <h4>Available for Pro</h4>
                  <p>Upgrade to unlock the in-app AI assistant for your whole team.</p>
                  <a href="/subscription" onClick={close}>
                    Upgrade to Pro
                  </a>
                </div>
              )}
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
