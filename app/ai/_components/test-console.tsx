"use client";

import { Icon } from "@/components/shell/icon";
import type { KnowledgeGapRow } from "@/lib/ai/knowledge-gaps";
import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";

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

const ASSET = "/assets/repulabs/ai-kb";

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

const PROMPT_CHIPS = [
  "What are your business hours?",
  "Do you offer any discounts?",
  "What is your refund policy?",
  "How can I contact support?",
  "Can I book an appointment?",
];

export function TestConsole({
  suggestions,
  openGaps,
  teachHref,
}: {
  suggestions: string[];
  openGaps: KnowledgeGapRow[];
  teachHref: string;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const convId = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

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
    <div style={{ display: "grid", gap: 12 }}>
      <div className="akb-test-top">
        {/* Train your AI agent */}
        <section
          className="akb-card akb-card__pad"
          style={{ display: "flex", flexDirection: "column", minHeight: 420 }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", gap: 10, minWidth: 0 }}>
              <span
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  background: "var(--akb-soft)",
                  color: "var(--akb-primary)",
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                }}
                aria-hidden="true"
              >
                <Icon name="sparkle" size={16} />
              </span>
              <div style={{ minWidth: 0 }}>
                <h3 className="akb-card__title">Train your AI agent</h3>
                <p className="akb-card__sub">
                  Ask questions to see how your AI agent responds based on your knowledge base.
                </p>
              </div>
            </div>
            <button
              type="button"
              className="akb-btn-outline"
              onClick={clear}
              disabled={empty}
              style={{ height: 32 }}
            >
              <Icon name="refresh" size={13} />
              Clear
            </button>
          </div>

          {/* conversation / empty state */}
          <div
            ref={scrollRef}
            style={{
              flex: 1,
              overflowY: "auto",
              margin: "14px 0",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              maxHeight: 360,
            }}
          >
            {empty ? (
              <div style={{ margin: "auto", textAlign: "center", maxWidth: 320, padding: "8px 0" }}>
                <Image
                  src={`${ASSET}/test-robot.svg`}
                  alt=""
                  width={150}
                  height={100}
                  unoptimized
                  aria-hidden="true"
                  style={{ width: 150, height: "auto", margin: "0 auto" }}
                />
                <div
                  style={{ fontSize: 15, fontWeight: 700, color: "var(--akb-ink)", marginTop: 8 }}
                >
                  No questions asked yet
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    color: "var(--akb-muted)",
                    marginTop: 4,
                    lineHeight: 1.5,
                  }}
                >
                  Start asking questions to test how your AI agent responds using your knowledge
                  base.
                </div>
              </div>
            ) : (
              turns.map((t) => (
                <div
                  key={t.id}
                  style={{
                    display: "flex",
                    justifyContent: t.role === "user" ? "flex-end" : "flex-start",
                  }}
                >
                  <div style={{ maxWidth: "82%" }}>
                    <div
                      style={{
                        padding: "10px 14px",
                        borderRadius: 14,
                        fontSize: 13,
                        lineHeight: 1.55,
                        whiteSpace: "pre-wrap",
                        background: t.role === "user" ? "var(--akb-primary)" : "#f5f6fb",
                        color: t.role === "user" ? "#fff" : "var(--akb-ink)",
                        border: t.role === "user" ? "none" : "1px solid var(--akb-line)",
                      }}
                    >
                      {t.text}
                    </div>
                    {t.role === "assistant" && (
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          marginTop: 6,
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}
                      >
                        {typeof t.confidence === "number" && (
                          <span
                            className={`akb-pill ${t.confidence >= 0.7 ? "akb-pill--success" : t.confidence >= 0.4 ? "akb-pill--warning" : ""}`}
                            style={{
                              fontSize: 10,
                              minHeight: 20,
                              color: t.confidence < 0.4 ? "#e14d62" : undefined,
                              background: t.confidence < 0.4 ? "#fdeaec" : undefined,
                            }}
                          >
                            {Math.round(t.confidence * 100)}% confident
                          </span>
                        )}
                        <button
                          type="button"
                          aria-label="Good answer"
                          onClick={() => rate(t, "up")}
                          className="akb-icon-btn"
                          style={{ color: t.rated === "up" ? "var(--akb-success)" : undefined }}
                        >
                          <Icon name="checkCircle" size={13} />
                        </button>
                        <button
                          type="button"
                          aria-label="Bad answer — teach the AI"
                          onClick={() => rate(t, "down")}
                          className="akb-icon-btn"
                          style={{ color: t.rated === "down" ? "#e14d62" : undefined }}
                        >
                          <Icon name="xCircle" size={13} />
                        </button>
                        {t.rated === "down" && (
                          <span style={{ fontSize: 11, color: "var(--akb-muted)" }}>
                            Added to Questions to teach →
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            {pending && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <span className="akb-pill akb-pill--lav" style={{ fontSize: 12 }}>
                  <Icon name="refresh" size={12} /> thinking…
                </span>
              </div>
            )}
          </div>

          {error && (
            <div
              role="alert"
              className="akb-pill"
              style={{
                background: "#fdeaec",
                color: "#e14d62",
                whiteSpace: "normal",
                height: "auto",
                padding: "8px 12px",
                marginBottom: 8,
              }}
            >
              <Icon name="alert" size={12} />
              {error}
            </div>
          )}

          {/* prompt chips */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            {PROMPT_CHIPS.map((c) => (
              <button
                key={c}
                type="button"
                className="akb-sq"
                style={{ width: "auto", borderRadius: 999, padding: "7px 12px" }}
                onClick={() => setInput(c)}
                disabled={pending}
              >
                {c}
              </button>
            ))}
          </div>

          {/* composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            style={{ display: "flex", gap: 8 }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your question here…"
              disabled={pending}
              aria-label="Ask the AI a test question"
              style={{
                flex: 1,
                height: 40,
                padding: "0 14px",
                borderRadius: 8,
                border: "1px solid var(--akb-line)",
                fontSize: 13,
                color: "var(--akb-ink)",
                background: "#fff",
                outline: "none",
              }}
            />
            <button type="submit" className="akb-btn-primary" disabled={pending || !input.trim()}>
              <Icon name="send" size={13} />
              Send
            </button>
          </form>

          <div className="akb-callout" style={{ marginTop: 12 }}>
            <Image
              src={`${ASSET}/test-tips.svg`}
              alt=""
              width={18}
              height={18}
              unoptimized
              aria-hidden="true"
            />
            <span>Tip: Be specific for more accurate and relevant responses.</span>
          </div>
        </section>

        {/* Suggested questions */}
        <aside className="akb-card akb-card__pad">
          <h3 className="akb-card__title">Suggested questions</h3>
          <div className="akb-sq__list">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                className="akb-sq"
                onClick={() => void send(s)}
                disabled={pending}
              >
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {s}
                </span>
                <Icon name="chevR" size={13} className="akb-sq__chev" />
              </button>
            ))}
          </div>
          <div className="akb-callout">
            <Image
              src={`${ASSET}/test-info.svg`}
              alt=""
              width={18}
              height={18}
              unoptimized
              aria-hidden="true"
            />
            <span>
              Try a question or rephrase above to test how well your AI agent understands and
              responds based on your knowledge base.
            </span>
          </div>
        </aside>
      </div>

      {/* Recent test performance (this session) */}
      <section className="akb-card akb-card__pad">
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h3 className="akb-card__title">Recent test performance</h3>
            <p className="akb-card__sub">
              Overview of your AI agent performance in this testing session.
            </p>
          </div>
          <span className="akb-pill akb-pill--lav">This session</span>
        </div>
        <div className="akb-perf">
          <PerfCell icon="test-total.svg" tone="success" value={totalTests} label="Total tests" />
          <PerfCell
            icon="test-answered.svg"
            tone="primary"
            value={answered}
            label="Answered correctly"
            sub={`${pct(answered)} accuracy`}
          />
          <PerfCell
            icon="test-partial.svg"
            tone="warning"
            value={partial}
            label="Partially correct"
            sub={pct(partial)}
          />
          <PerfCell
            icon="test-notanswered.svg"
            tone="danger"
            value={couldnt}
            label="Couldn't answer"
            sub={pct(couldnt)}
          />
        </div>
      </section>

      {/* Questions to teach (real open gaps) */}
      <section className="akb-card akb-card__pad">
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h3 className="akb-card__title">Questions to teach ({openGaps.length})</h3>
            <p className="akb-card__sub">
              Add questions and answers to improve your AI agent&apos;s knowledge and response
              accuracy.
            </p>
          </div>
          <Link href={teachHref} className="akb-btn-outline" style={{ height: 34 }}>
            <Icon name="plus" size={14} />
            Add question
          </Link>
        </div>

        {openGaps.length === 0 ? (
          <div className="akb-teach-empty">
            <Image
              src={`${ASSET}/test-robot.svg`}
              alt=""
              width={90}
              height={60}
              unoptimized
              aria-hidden="true"
              style={{ width: 90, height: "auto" }}
            />
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--akb-ink)" }}>
              No questions added yet
            </div>
            <div
              style={{ fontSize: 12, color: "var(--akb-muted)", maxWidth: 360, lineHeight: 1.5 }}
            >
              Rate a tester answer thumbs-down, or add real questions and accurate answers your AI
              agent can learn from.
            </div>
            <Link
              href={teachHref}
              className="akb-btn-outline"
              style={{
                marginTop: 6,
                color: "var(--akb-primary)",
                borderColor: "var(--akb-hero-border)",
              }}
            >
              <Icon name="plus" size={14} />
              Add your first question
            </Link>
          </div>
        ) : (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {openGaps.slice(0, 5).map((g) => (
              <Link
                key={g.id}
                href={teachHref}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "10px 14px",
                  border: "1px solid var(--akb-line)",
                  borderRadius: 10,
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--akb-ink)" }}>
                    {g.question}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--akb-muted)", marginTop: 2 }}>
                    Asked {g.hitCount}× · via {g.source.replace(/_/g, " ")}
                  </div>
                </div>
                <span className="akb-pill akb-pill--warning" style={{ alignSelf: "center" }}>
                  Teach
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Insights & tips */}
      <section className="akb-card akb-card__pad">
        <h3 className="akb-card__title">Insights &amp; tips</h3>
        <p className="akb-card__sub">
          Identify areas of improvement to make your AI agent more accurate and helpful.
        </p>
        <div className="akb-insights">
          <span className="akb-insights__icon" aria-hidden="true">
            <Icon name="info" size={18} />
          </span>
          <div className="akb-insights__body">
            <div className="akb-insights__t">
              {openGaps.length === 0
                ? "No insights yet"
                : `${openGaps.length} ${openGaps.length === 1 ? "question is" : "questions are"} waiting to be taught`}
            </div>
            <div className="akb-insights__d">
              {openGaps.length === 0
                ? "Once you start testing your AI agent, insights and suggestions will appear here."
                : "Teaching these answers is the fastest way to raise your AI's accuracy."}
            </div>
          </div>
          <Link href={teachHref} className="akb-link" style={{ flexShrink: 0 }}>
            View suggestions <Icon name="arrowR" size={13} />
          </Link>
        </div>
      </section>
    </div>
  );
}

function PerfCell({
  icon,
  tone,
  value,
  label,
  sub,
}: {
  icon: string;
  tone: "success" | "primary" | "warning" | "danger";
  value: number;
  label: string;
  sub?: string;
}) {
  return (
    <div className="akb-perf__cell">
      <span className={`akb-perf__icon akb-perf__icon--${tone}`} aria-hidden="true">
        <Image src={`${ASSET}/${icon}`} alt="" width={26} height={26} unoptimized />
      </span>
      <div style={{ minWidth: 0 }}>
        <div className="akb-perf__value">{value}</div>
        <div className="akb-perf__label">{label}</div>
        {sub && <div className="akb-perf__pct">{sub}</div>}
      </div>
    </div>
  );
}
