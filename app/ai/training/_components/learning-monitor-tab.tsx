"use client";

import { useState } from "react";
import { Icon } from "@/components/shell/icon";
import { dismissKnowledgeGap, teachKnowledgeGap } from "@/lib/ai/knowledge-gap-actions";
import type { KnowledgeGapRow, LearningStats } from "@/lib/ai/knowledge-gaps";
import { relativeTime } from "./shared";

/**
 * Learning Monitor panel. Renders REAL learning stats (fixes the "bars stuck at
 * 0%" bug), the open knowledge-gap queue (question + hitCount + when) each with
 * a "Teach AI" modal (cancel-subscription overlay shape), and answered gaps
 * collapsed.
 */
export function LearningMonitorTab({
  stats,
  openGaps,
  answeredGaps,
}: {
  stats: LearningStats;
  openGaps: KnowledgeGapRow[];
  answeredGaps: KnowledgeGapRow[];
}) {
  const [teaching, setTeaching] = useState<KnowledgeGapRow | null>(null);
  const [showAnswered, setShowAnswered] = useState(false);

  return (
    <div className="col" style={{ gap: 14 }}>
      {/* Stat bars */}
      <div className="ds-card">
        <div className="ds-card__head">
          <div>
            <h3 className="ds-card__title">How well is your AI learning?</h3>
            <div className="ds-card__sub">Low-confidence answers become questions you can teach</div>
          </div>
        </div>
        <div className="ds-card__body col" style={{ gap: 16 }}>
          <Bar
            label="Questions answered"
            pct={stats.answeredPct}
            caption={`${stats.answered} of ${stats.open + stats.answered} resolved`}
            tone="ok"
          />
          <div className="row" style={{ gap: 16, flexWrap: "wrap" }}>
            <Stat value={stats.open} label="Open gaps" />
            <Stat value={stats.openHits} label="Low-confidence hits" />
            <Stat value={stats.answered} label="Taught" />
            <Stat value={stats.last7d} label="New this week" />
          </div>
        </div>
      </div>

      {/* Open gap queue */}
      <div className="ds-card">
        <div className="ds-card__head">
          <h3 className="ds-card__title">Questions to teach ({openGaps.length})</h3>
          {openGaps.length > 0 && (
            <span className="chip chip--warn">
              <Icon name="alert" size={12} />
              Needs your answer
            </span>
          )}
        </div>
        <div className="ds-card__body">
          {openGaps.length === 0 ? (
            <div className="dim" style={{ fontSize: 13, padding: "8px 0", display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="checkCircle" size={16} style={{ color: "var(--ok)" }} />
              No open gaps. When the AI is unsure about a question, it&apos;ll appear here for you to teach.
            </div>
          ) : (
            <div className="col" style={{ gap: 8 }}>
              {openGaps.map((g) => (
                <div
                  key={g.id}
                  className="row"
                  style={{
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "12px 14px",
                    border: "1px solid var(--line)",
                    borderRadius: "var(--r)",
                    background: "var(--surface)",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500, lineHeight: 1.4 }}>{g.question}</div>
                    <div className="dim" style={{ fontSize: 11.5, marginTop: 4, display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <span>
                        Asked {g.hitCount}×
                      </span>
                      <span>· {relativeTime(g.createdAt)}</span>
                      <span>· via {g.source.replace(/_/g, " ")}</span>
                    </div>
                  </div>
                  <div className="row" style={{ gap: 6, flexShrink: 0 }}>
                    <button type="button" className="btn btn--pri btn--sm" onClick={() => setTeaching(g)}>
                      <Icon name="sparkle" size={12} />
                      Teach AI
                    </button>
                    <form action={dismissKnowledgeGap}>
                      <input type="hidden" name="gapId" value={g.id} />
                      <button type="submit" className="btn btn--ghost btn--sm" aria-label="Dismiss">
                        <Icon name="x" size={12} />
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Answered (collapsed) */}
      {answeredGaps.length > 0 && (
        <div className="ds-card">
          <button
            type="button"
            className="ds-card__head"
            onClick={() => setShowAnswered((s) => !s)}
            style={{ width: "100%", background: "none", border: 0, cursor: "pointer", textAlign: "left" }}
          >
            <h3 className="ds-card__title">Taught answers ({answeredGaps.length})</h3>
            <Icon name={showAnswered ? "chevU" : "chevD"} size={14} />
          </button>
          {showAnswered && (
            <div className="ds-card__body col" style={{ gap: 8 }}>
              {answeredGaps.map((g) => (
                <div key={g.id} style={{ padding: "10px 14px", border: "1px solid var(--line)", borderRadius: "var(--r)" }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{g.question}</div>
                  {g.answerText && (
                    <div className="dim" style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.5 }}>
                      {g.answerText}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {teaching && <TeachModal gap={teaching} onClose={() => setTeaching(null)} />}
    </div>
  );
}

function Bar({ label, pct, caption, tone }: { label: string; pct: number; caption: string; tone: "ok" | "pri" }) {
  const color = tone === "ok" ? "var(--ok)" : "var(--pri)";
  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{pct}%</span>
      </div>
      <div style={{ height: 8, borderRadius: 999, background: "var(--surface-3)", overflow: "hidden" }}>
        <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: "100%", background: color, borderRadius: 999, transition: "width .3s" }} />
      </div>
      <div className="dim" style={{ fontSize: 11.5, marginTop: 4 }}>
        {caption}
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div style={{ minWidth: 90 }}>
      <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em" }}>{value}</div>
      <div className="dim" style={{ fontSize: 11.5 }}>
        {label}
      </div>
    </div>
  );
}

function TeachModal({ gap, onClose }: { gap: KnowledgeGapRow; onClose: () => void }) {
  return (
    <>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(11,13,14,.45)", zIndex: 80, border: "none", cursor: "default" }}
      />
      <div
        role="dialog"
        aria-label="Teach the AI"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(520px, calc(100vw - 32px))",
          maxHeight: "calc(100vh - 32px)",
          overflowY: "auto",
          background: "var(--surface, #fff)",
          borderRadius: 16,
          boxShadow: "0 30px 60px -20px rgba(11,13,14,.4)",
          zIndex: 81,
          padding: 24,
        }}
      >
        <div style={{ marginBottom: 18 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: "-0.015em", marginBottom: 6 }}>
            Teach your AI
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: "var(--rl-muted, #94a3b8)", lineHeight: 1.55 }}>
            Your answer is added to the AI&apos;s instructions so it can answer this and similar
            questions correctly from now on.
          </p>
        </div>

        <div
          style={{
            padding: "10px 14px",
            background: "var(--surface-3)",
            borderRadius: "var(--r)",
            fontSize: 13,
            marginBottom: 14,
            lineHeight: 1.45,
          }}
        >
          <span className="dim" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em" }}>
            Question
          </span>
          <div style={{ marginTop: 4, fontWeight: 500 }}>{gap.question}</div>
        </div>

        <form action={teachKnowledgeGap} className="col" style={{ gap: 14 }}>
          <input type="hidden" name="gapId" value={gap.id} />
          <label className="col" style={{ gap: 4 }}>
            <span className="lbl">Your answer</span>
            <textarea
              name="answer"
              required
              maxLength={1000}
              rows={5}
              placeholder="Type the correct answer the AI should give…"
              style={{
                padding: "10px 14px",
                borderRadius: "var(--r)",
                border: "1px solid var(--line)",
                background: "var(--surface)",
                fontSize: 13,
                lineHeight: 1.55,
                resize: "vertical",
                fontFamily: "var(--f-ui)",
              }}
            />
          </label>
          <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
            <button type="button" onClick={onClose} className="btn">
              Cancel
            </button>
            <button type="submit" className="btn btn--pri">
              <Icon name="check" size={13} />
              Teach AI
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
