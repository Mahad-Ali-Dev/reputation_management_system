"use client";

import { LazyFrog } from "@/components/ui/lazy-frog";
import {
  addKnowledgeAnswer,
  dismissKnowledgeGap,
  teachKnowledgeGap,
} from "@/lib/ai/knowledge-gap-actions";
import type { KnowledgeGapRow } from "@/lib/ai/knowledge-gaps";
import {
  ArrowUp,
  Building2,
  CalendarCheck,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  GraduationCap,
  Lightbulb,
  type LucideIcon,
  MessageCircleQuestion,
  Plus,
  RotateCcw,
  ScrollText,
  Sparkles,
  Tag,
  ThumbsDown,
  ThumbsUp,
  TriangleAlert,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import "@/components/ui/glass-sheet.css";

/**
 * Test tab — kit "Train your AI agent" console.
 *
 * Reuses the EXISTING, unchanged /api/ai/kb-test endpoint (authed + entitled):
 * every turn posts there, a thumbs-down feeds the live knowledge-gap queue, and
 * the suggested questions come from the real profile-derived list. Active state
 * = a conversation; empty state = the kit's "No questions asked yet" composer.
 *
 * "Recent test performance" is computed from THIS session's live tester turns —
 * total tests + a confidence-bucketed breakdown (the kb-test endpoint returns a
 * confidence per answer). There is no persisted test-results table, so before
 * any test runs the metrics render the kit's all-zero state honestly.
 *
 * "Questions to teach" + "Insights" are bound to the real open knowledge gaps.
 */

type Turn = {
  id: string;
  role: "user" | "assistant";
  text: string;
  confidence?: number;
  fallback?: boolean;
  aiMessageId?: string | null;
  question?: string;
  rated?: "up" | "down";
};

/** "Try a topic" chips: each seeds the tester with a representative question. */
const TOPIC_CHIPS: Array<{ icon: LucideIcon; label: string; question: string }> = [
  { icon: Building2, label: "About you", question: "Tell me about your business." },
  {
    icon: ScrollText,
    label: "Policies",
    question: "What is your refund and cancellation policy?",
  },
  {
    icon: Tag,
    label: "Services & pricing",
    question: "What services do you offer and how much do they cost?",
  },
  { icon: CalendarCheck, label: "Appointments", question: "How do I book an appointment?" },
  { icon: MessageCircleQuestion, label: "Hours", question: "What are your business hours?" },
];

export function TestConsole({
  suggestions,
  openGaps,
  answeredGaps,
}: {
  suggestions: string[];
  openGaps: KnowledgeGapRow[];
  answeredGaps: KnowledgeGapRow[];
}) {
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const convId = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // null = closed, "add" = new-question form, a KnowledgeGapRow = teach-this-gap form.
  const [teachModal, setTeachModal] = useState<KnowledgeGapRow | "add" | null>(null);
  const [showTaught, setShowTaught] = useState(true);

  function closeTeachModal() {
    setTeachModal(null);
  }
  function onTaught() {
    setTeachModal(null);
    router.refresh();
  }

  const assistantTurns = turns.filter((t) => t.role === "assistant");
  const totalTests = assistantTurns.length;
  const answered = assistantTurns.filter((t) => !t.fallback && (t.confidence ?? 0) >= 0.7).length;
  const partial = assistantTurns.filter(
    (t) => !t.fallback && (t.confidence ?? 0) >= 0.4 && (t.confidence ?? 0) < 0.7,
  ).length;
  const couldnt = assistantTurns.filter((t) => t.fallback || (t.confidence ?? 0) < 0.4).length;
  const pct = (n: number) => (totalTests === 0 ? "—" : `${Math.round((n / totalTests) * 100)}%`);

  async function send(question: string) {
    const q = question.trim();
    if (!q || pending) return;
    setError(null);
    setInput("");
    setTurns((t) => [...t, { id: `u-${Date.now()}`, role: "user", text: q }]);
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
      requestAnimationFrame(() =>
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }),
      );
    }
  }

  function rate(turn: Turn, vote: "up" | "down") {
    setTurns((t) => t.map((x) => (x.id === turn.id ? { ...x, rated: vote } : x)));
    if (vote === "down" && turn.question) {
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

  function clear() {
    setTurns([]);
    setError(null);
    convId.current = null;
  }

  const empty = turns.length === 0;

  return (
    <div className="kb-stack">
      <div className="kb-test">
        {/* Chat: iMessage-style tester */}
        <section className="kb-card kb-chat" aria-labelledby="kb-chat-title">
          <header className="kb-card__head">
            <div>
              <h2 id="kb-chat-title" className="kb-card__title">
                Ask your AI
              </h2>
              <p className="kb-card__sub">
                Ask what your customers ask. Rate each answer to teach it.
              </p>
            </div>
            <button type="button" className="kb-pill kb-pill--sm" onClick={clear} disabled={empty}>
              <RotateCcw size={14} strokeWidth={1.8} />
              Clear
            </button>
          </header>

          <div ref={scrollRef} className="kb-chat__scroll">
            {empty ? (
              <div className="kb-chat__empty">
                <LazyFrog size={120} name="Repulabs AI" state="idle" followPointer />
                <div className="kb-empty__t">Ask it anything</div>
                <p className="kb-empty__d">
                  Pick a topic below or type your own question to see how your AI answers.
                </p>
              </div>
            ) : (
              turns.map((t) => (
                <div key={t.id} className={`kb-msg kb-msg--${t.role}`}>
                  <div className="kb-msg__bubble">{t.text}</div>
                  {t.role === "assistant" && (
                    <div className="kb-msg__meta">
                      {typeof t.confidence === "number" && (
                        <span
                          className={`kb-conf ${t.confidence >= 0.7 ? "is-ok" : t.confidence >= 0.4 ? "is-mid" : "is-low"}`}
                        >
                          {Math.round(t.confidence * 100)}% confident
                        </span>
                      )}
                      <button
                        type="button"
                        aria-label="Good answer"
                        onClick={() => rate(t, "up")}
                        className={`kb-rate${t.rated === "up" ? " is-up" : ""}`}
                      >
                        <ThumbsUp size={14} strokeWidth={1.8} />
                      </button>
                      <button
                        type="button"
                        aria-label="Bad answer, teach the AI"
                        onClick={() => rate(t, "down")}
                        className={`kb-rate${t.rated === "down" ? " is-down" : ""}`}
                      >
                        <ThumbsDown size={14} strokeWidth={1.8} />
                      </button>
                      {t.rated === "down" && (
                        <span className="kb-msg__note">Added to Questions to teach</span>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
            {pending && (
              <div className="kb-msg kb-msg--assistant">
                <div className="kb-msg__bubble kb-typing" aria-label="Thinking">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
          </div>

          {error && (
            <p className="kb-alert" role="alert">
              <TriangleAlert size={15} strokeWidth={1.8} />
              {error}
            </p>
          )}

          <div className="kb-topics">
            {TOPIC_CHIPS.map((t) => {
              const TIcon = t.icon;
              return (
                <button
                  key={t.label}
                  type="button"
                  className="kb-topic"
                  onClick={() => void send(t.question)}
                  disabled={pending}
                  title={t.question}
                >
                  <TIcon size={15} strokeWidth={1.8} aria-hidden="true" />
                  {t.label}
                </button>
              );
            })}
          </div>

          <form
            className="kb-composer"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question…"
              disabled={pending}
              aria-label="Ask the AI a test question"
              className="kb-composer__input"
            />
            <button
              type="submit"
              className="kb-composer__send"
              disabled={pending || !input.trim()}
              aria-label="Send"
            >
              <ArrowUp size={18} strokeWidth={2.4} />
            </button>
          </form>
        </section>

        {/* Suggested questions */}
        <aside className="kb-card kb-card--flush" aria-labelledby="kb-sugg-title">
          <h2 id="kb-sugg-title" className="kb-group-title">
            <Lightbulb size={16} strokeWidth={1.8} /> Try these
          </h2>
          <ul className="kb-list kb-list--inset kb-list--tight">
            {suggestions.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  className="kb-list__row"
                  onClick={() => void send(s)}
                  disabled={pending}
                >
                  <span className="kb-list__text">
                    <span className="kb-list__t kb-list__t--reg">{s}</span>
                  </span>
                  <ChevronRight size={16} strokeWidth={2} className="kb-list__chev" />
                </button>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      {/* This session's results */}
      <section className="kb-card" aria-labelledby="kb-perf-title">
        <header className="kb-card__head">
          <div>
            <h2 id="kb-perf-title" className="kb-card__title">
              This session
            </h2>
            <p className="kb-card__sub">How your AI did on the questions you just asked.</p>
          </div>
        </header>
        <div className="kb-perf">
          <PerfCell tone="ink" value={totalTests} label="Questions asked" />
          <PerfCell tone="ok" value={answered} label="Answered well" sub={pct(answered)} />
          <PerfCell tone="mid" value={partial} label="Partly right" sub={pct(partial)} />
          <PerfCell tone="bad" value={couldnt} label="Couldn't answer" sub={pct(couldnt)} />
        </div>
      </section>

      {/* Questions to teach (real open gaps) */}
      <section id="akb-teach-section" className="kb-card" aria-labelledby="kb-teach-title">
        <header className="kb-card__head">
          <div>
            <h2 id="kb-teach-title" className="kb-card__title">
              Questions to teach <span className="kb-count">{openGaps.length}</span>
            </h2>
            <p className="kb-card__sub">
              Questions your AI couldn&apos;t answer well. Give it the right answer once and it
              remembers.
            </p>
          </div>
          <button type="button" className="kb-pill" onClick={() => setTeachModal("add")}>
            <Plus size={15} strokeWidth={2} />
            Add question
          </button>
        </header>

        {openGaps.length === 0 ? (
          <div className="kb-empty">
            <span className="kb-empty__icon" aria-hidden="true">
              <GraduationCap size={24} strokeWidth={1.6} />
            </span>
            <div className="kb-empty__t">Nothing to teach right now</div>
            <p className="kb-empty__d">
              Thumbs-down an answer above, or add a question and its answer yourself.
            </p>
            <button type="button" className="kb-pill" onClick={() => setTeachModal("add")}>
              Add your first question
            </button>
          </div>
        ) : (
          <ul className="kb-list kb-list--inset">
            {openGaps.slice(0, 5).map((g) => (
              <li key={g.id}>
                <button type="button" className="kb-list__row" onClick={() => setTeachModal(g)}>
                  <span className="kb-list__icon kb-list__icon--warn" aria-hidden="true">
                    <CircleHelp size={16} strokeWidth={1.8} />
                  </span>
                  <span className="kb-list__text">
                    <span className="kb-list__t kb-clamp-2">{g.question}</span>
                    <span className="kb-list__d">
                      Asked {g.hitCount}× · {g.source.replace(/_/g, " ")}
                    </span>
                  </span>
                  <span className="kb-pill kb-pill--sm kb-pill--tint">Teach</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Taught answers: an added/taught question lands here as "answered". */}
      {answeredGaps.length > 0 && (
        <section className="kb-card" aria-labelledby="kb-taught-title">
          <button
            type="button"
            className="kb-collapse"
            aria-expanded={showTaught}
            onClick={() => setShowTaught((s) => !s)}
          >
            <span>
              <span id="kb-taught-title" className="kb-card__title">
                Taught answers <span className="kb-count">{answeredGaps.length}</span>
              </span>
              <span className="kb-card__sub">What your AI now knows how to answer.</span>
            </span>
            <ChevronDown
              size={18}
              strokeWidth={2}
              className={`kb-collapse__chev${showTaught ? " is-open" : ""}`}
            />
          </button>

          {showTaught && (
            <ul className="kb-list kb-list--inset">
              {answeredGaps.map((g) => (
                <li key={g.id}>
                  <div className="kb-list__row kb-list__row--top">
                    <span className="kb-list__icon kb-list__icon--ok" aria-hidden="true">
                      <Check size={15} strokeWidth={2.4} />
                    </span>
                    <span className="kb-list__text">
                      <span className="kb-list__t">{g.question}</span>
                      {g.answerText && <span className="kb-list__d">{g.answerText}</span>}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {openGaps.length > 0 && (
        <Link href="#akb-teach-section" className="kb-banner">
          <span className="kb-badge kb-badge--sm" aria-hidden="true">
            <Sparkles size={18} strokeWidth={1.8} />
          </span>
          <span className="kb-list__text">
            <span className="kb-list__t">
              {openGaps.length} {openGaps.length === 1 ? "question is" : "questions are"} waiting to
              be taught
            </span>
            <span className="kb-list__d">
              Teaching these is the fastest way to raise your AI&apos;s accuracy.
            </span>
          </span>
          <ChevronRight size={18} strokeWidth={2} className="kb-list__chev" />
        </Link>
      )}

      {teachModal !== null && (
        <TeachDialog
          gap={teachModal === "add" ? null : teachModal}
          onClose={closeTeachModal}
          onDone={onTaught}
        />
      )}
    </div>
  );
}

/**
 * "Teach AI" (answer an existing gap) and "Add question" (a brand-new Q&A
 * pair, no prior gap) share this sheet. `gap` null means the question field
 * is editable; otherwise it's the gap's real question, read-only.
 */
function TeachDialog({
  gap,
  onClose,
  onDone,
}: {
  gap: KnowledgeGapRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [question, setQuestion] = useState(gap?.question ?? "");
  const [answer, setAnswer] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("answer", answer);
      if (gap) {
        fd.set("gapId", gap.id);
        await teachKnowledgeGap(fd);
      } else {
        fd.set("question", question);
        await addKnowledgeAnswer(fd);
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Try again.");
      setPending(false);
    }
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: overlay dialog; matches the other glass sheets
    <div className="gs-overlay" role="dialog" aria-modal="true" aria-labelledby="kb-teach-title">
      <button
        type="button"
        aria-label="Close"
        className="gs-scrim"
        onClick={onClose}
        disabled={pending}
      />
      <div className="gs">
        <button type="button" aria-label="Close" className="gs__close" onClick={onClose}>
          <X size={16} strokeWidth={2.2} />
        </button>
        <div className="gs__hero">
          <span className="gs__badge" aria-hidden="true">
            <GraduationCap size={28} strokeWidth={1.7} />
          </span>
          <h2 id="kb-teach-title" className="gs__title">
            {gap ? "Teach your AI" : "Add a question"}
          </h2>
          <p className="gs__sub">
            {gap
              ? "Your answer becomes part of its knowledge, so it gets this and similar questions right from now on."
              : "Add a question with the right answer. It's saved straight into your AI's knowledge."}
          </p>
        </div>

        <form onSubmit={submit} className="gs__form">
          <div className="gs__body">
            {error && (
              <p className="gs-error" role="alert">
                <TriangleAlert size={15} strokeWidth={1.8} />
                {error}
              </p>
            )}
            <div className="gs-group">
              {gap ? (
                <div className="gs-field">
                  <span className="gs-field__lbl">Question</span>
                  <div className="kb-quote">{gap.question}</div>
                </div>
              ) : (
                <label className="gs-field">
                  <span className="gs-field__lbl">Question</span>
                  <input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    maxLength={500}
                    required
                    placeholder="e.g. Do you offer gift cards?"
                    className="gs-input"
                  />
                </label>
              )}
              <label className="gs-field">
                <span className="gs-field__lbl">Answer</span>
                <textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  maxLength={1000}
                  rows={5}
                  required
                  placeholder="The correct answer your AI should give…"
                  className="gs-input kb-textarea-in"
                />
              </label>
            </div>
          </div>
          <div className="gs__foot">
            <button type="button" className="gs-btn" onClick={onClose} disabled={pending}>
              Cancel
            </button>
            <button type="submit" className="gs-btn gs-btn--pri" disabled={pending}>
              {pending ? "Saving…" : gap ? "Teach AI" : "Add question"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PerfCell({
  tone,
  value,
  label,
  sub,
}: {
  tone: "ink" | "ok" | "mid" | "bad";
  value: number;
  label: string;
  sub?: string;
}) {
  return (
    <div className={`kb-perf__cell is-${tone}`}>
      <div className="kb-perf__value">{value}</div>
      <div className="kb-perf__label">{label}</div>
      {sub && sub !== "—" && <div className="kb-perf__pct">{sub}</div>}
    </div>
  );
}
