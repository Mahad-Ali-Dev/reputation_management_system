"use client";

import { Icon } from "@/components/shell/icon";
import Link from "next/link";
import { type JSX, useCallback, useId, useRef, useState } from "react";
import type {
  AiAssistOption,
  AiAssistPurpose,
  AiAssistResult,
} from "@/lib/ai/assist/types";
import { confidenceThreshold } from "@/lib/ai/assist/types";

/**
 * `<AiAssistPanel>` (00_foundation §A4.7) — the embeddable
 * prompt → N options → use / regenerate / edit panel every caller module drops
 * in. It is PRESENTATION + calls an injected server `action`; it never imports
 * a server-only module, which is what makes it reusable across all 8 purposes.
 *
 * This is NOT the floating product-guide chat (`ask-ai.tsx`) — it is an inline
 * panel rendered inside a TabBar tab, a drawer, or beside an editor.
 *
 * Connection-gating: pass `enabled=false` + `disabledReason` and the panel
 * renders disabled with a "Connect …" CTA (designed to feed straight from the
 * <ConnectionGate> A6 data).
 *
 * Styling reuses the v3 design-system classes (`.ds-card`, `.chip`, `.btn`,
 * `.ds-textarea`) — no new CSS this wave.
 */

type AiAssistAction = (formData: {
  query: string;
  toneHint?: string;
  regenerate?: boolean;
}) => Promise<AiAssistResult>;

type PanelStatus = "idle" | "loading" | "ready" | "error";

const THRESHOLD = confidenceThreshold();

export function AiAssistPanel({
  purpose,
  action,
  initialQuery = "",
  onUse,
  allowEdit = true,
  emptyHint = "Describe what you want, then generate a few options.",
  enabled = true,
  disabledReason,
}: {
  purpose: AiAssistPurpose;
  /**
   * The server action the panel calls. Each module passes a thin action that
   * injects orgId + domain and calls runAiAssist — keeps orgId off the client.
   */
  action: AiAssistAction;
  initialQuery?: string;
  /** Host inserts the chosen text (into an editor, a reply box, …). */
  onUse: (text: string, option: AiAssistOption) => void;
  /** Inline-edit an option before Use. Default true. */
  allowEdit?: boolean;
  emptyHint?: string;
  /** When false, the panel renders disabled with a Connect CTA. */
  enabled?: boolean;
  disabledReason?: { label: string; href: string };
}): JSX.Element {
  const [query, setQuery] = useState(initialQuery);
  const [tone, setTone] = useState("");
  const [status, setStatus] = useState<PanelStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<AiAssistResult | null>(null);
  // Map of aiMessageId → edited text (inline edits before Use).
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // Tracks the latest in-flight request so a stale resolve can't clobber state.
  const reqSeq = useRef(0);
  const promptId = useId();

  const run = useCallback(
    async (regenerate: boolean) => {
      const q = query.trim();
      if (!q || !enabled) return;
      const seq = ++reqSeq.current;
      setStatus("loading");
      setErrorMsg(null);
      try {
        const avoid = regenerate
          ? (result?.options ?? []).map((o) => o.text).filter(Boolean)
          : undefined;
        void avoid; // host action owns avoidTexts; flag is the signal it needs.
        const res = await action({
          query: q,
          toneHint: tone.trim() || undefined,
          regenerate,
        });
        if (seq !== reqSeq.current) return; // a newer request superseded this one
        setResult(res);
        setEdits({});
        setEditingId(null);
        setStatus("ready");
      } catch (err) {
        if (seq !== reqSeq.current) return;
        setStatus("error");
        setErrorMsg(messageFor(err));
      }
    },
    [query, tone, enabled, action, result],
  );

  const onCopy = useCallback((option: AiAssistOption, text: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(text).catch(() => undefined);
    }
    setCopiedId(option.aiMessageId);
    setTimeout(() => setCopiedId((c) => (c === option.aiMessageId ? null : c)), 1500);
  }, []);

  // ── Disabled (connection-gated) ─────────────────────────────────────────
  if (!enabled) {
    return (
      <div className="ds-card" style={{ opacity: 0.85 }} aria-disabled>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <Icon name="sparkle" size={15} style={{ color: "var(--rl-muted-2)" }} />
          <strong style={{ fontSize: 13.5 }}>AI assist</strong>
        </div>
        <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "var(--rl-muted)" }}>
          {disabledReason?.label ?? "Connect a channel to use AI assist here."}
        </p>
        {disabledReason?.href && (
          <Link href={disabledReason.href} className="btn btn--sm btn--ghost" style={{ display: "inline-flex" }}>
            <Icon name="plug" size={12} />
            {disabledReason.label?.startsWith("Connect") ? disabledReason.label : "Connect"}
            <Icon name="arrowR" size={12} />
          </Link>
        )}
      </div>
    );
  }

  const options = result?.options ?? [];

  return (
    <div className="ds-card" data-purpose={purpose}>
      {/* Prompt box */}
      <label htmlFor={promptId} style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
        <Icon name="sparkle" size={13} style={{ color: "var(--accent, var(--rl-pri))", marginRight: 6 }} />
        AI assist
      </label>
      <textarea
        id={promptId}
        className="ds-textarea"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={emptyHint}
        rows={3}
        disabled={status === "loading"}
        style={{ width: "100%", resize: "vertical" }}
      />

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
        <input
          className="ds-input"
          value={tone}
          onChange={(e) => setTone(e.target.value)}
          placeholder="Tone (optional) e.g. warm, formal"
          disabled={status === "loading"}
          style={{ flex: 1, minWidth: 160 }}
          aria-label="Tone hint"
        />
        <button
          type="button"
          className="btn btn--pri btn--sm"
          onClick={() => run(false)}
          disabled={status === "loading" || query.trim().length === 0}
        >
          {status === "loading" ? "Generating…" : "Generate"}
        </button>
      </div>

      {/* Error */}
      {status === "error" && (
        <div
          className="chip chip--bad"
          role="alert"
          style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <Icon name="xCircle" size={13} />
          {errorMsg}
          <button
            type="button"
            className="btn btn--xs btn--ghost"
            onClick={() => run(false)}
            style={{ marginLeft: 4 }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {status === "loading" && (
        <div style={{ marginTop: 14, display: "grid", gap: 10 }} aria-hidden>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                height: 64,
                borderRadius: 10,
                background:
                  "linear-gradient(90deg, var(--rl-line, #eee) 25%, var(--rl-line-2, #f3f3f3) 37%, var(--rl-line, #eee) 63%)",
                opacity: 0.7,
              }}
            />
          ))}
        </div>
      )}

      {/* Options */}
      {status === "ready" && options.length > 0 && (
        <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
          {options.map((opt, idx) => {
            const text = edits[opt.aiMessageId] ?? opt.text;
            const editing = editingId === opt.aiMessageId;
            const needsReview = opt.blocked || opt.confidence < THRESHOLD;
            return (
              <div
                key={opt.aiMessageId}
                className="ds-card"
                style={{ padding: 12, border: "1px solid var(--rl-line, #e6e6e6)" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span className="chip chip--out" style={{ fontSize: 10.5 }}>
                    Option {idx + 1}
                  </span>
                  <ConfidenceChip confidence={opt.confidence} />
                  {needsReview && (
                    <span
                      className="chip chip--warn"
                      title={
                        opt.blocked
                          ? `Flagged: ${opt.safetyFlags.join(", ") || "review needed"}`
                          : "Low confidence review before use"
                      }
                      style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5 }}
                    >
                      <Icon name="flag" size={11} />
                      Needs review
                    </span>
                  )}
                </div>

                {editing && allowEdit ? (
                  <textarea
                    className="ds-textarea"
                    value={text}
                    onChange={(e) =>
                      setEdits((m) => ({ ...m, [opt.aiMessageId]: e.target.value }))
                    }
                    rows={4}
                    style={{ width: "100%", resize: "vertical", marginBottom: 8 }}
                    aria-label={`Edit option ${idx + 1}`}
                  />
                ) : (
                  <p style={{ margin: "0 0 10px", fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                    {text || <em style={{ color: "var(--rl-muted)" }}>(empty draft)</em>}
                  </p>
                )}

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn btn--xs btn--pri"
                    onClick={() => onUse(text, opt)}
                    disabled={!text.trim()}
                  >
                    <Icon name="check" size={11} />
                    Use
                  </button>
                  {allowEdit && (
                    <button
                      type="button"
                      className="btn btn--xs btn--ghost"
                      onClick={() => setEditingId(editing ? null : opt.aiMessageId)}
                    >
                      <Icon name="edit" size={11} />
                      {editing ? "Done" : "Edit"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn--xs btn--ghost"
                    onClick={() => onCopy(opt, text)}
                  >
                    <Icon name={copiedId === opt.aiMessageId ? "check" : "share"} size={11} />
                    {copiedId === opt.aiMessageId ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            );
          })}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() => run(true)}
              disabled={status !== "ready"}
            >
              <Icon name="sparkle" size={12} />
              Regenerate
            </button>
            {result?.knowledgeGapId && (
              <span
                className="chip chip--info"
                title="The AI was unsure saved as a knowledge gap to improve future answers."
                style={{ fontSize: 10.5, display: "inline-flex", alignItems: "center", gap: 4 }}
              >
                <Icon name="brain" size={11} />
                Saved to knowledge gaps
              </span>
            )}
          </div>
        </div>
      )}

      {/* Empty-after-generate */}
      {status === "ready" && options.length === 0 && (
        <p style={{ marginTop: 14, fontSize: 12.5, color: "var(--rl-muted)" }}>
          No options came back. Try rephrasing your prompt.
        </p>
      )}
    </div>
  );
}

/** Confidence chip — green ≥ threshold, amber below. */
function ConfidenceChip({ confidence }: { confidence: number }): JSX.Element {
  const pct = Math.round(confidence * 100);
  const ok = confidence >= THRESHOLD;
  return (
    <span
      className={ok ? "chip chip--ok" : "chip chip--warn"}
      title="Model confidence in this draft"
      style={{ fontSize: 10.5 }}
    >
      {pct}% confident
    </span>
  );
}

/** Map a thrown error to user-facing copy (budget vs plan vs generic). */
function messageFor(err: unknown): string {
  const code = (err as { code?: string } | null)?.code;
  if (code === "ai_budget") return "Daily AI limit reached. Try again tomorrow or raise the cap.";
  if (code === "plan_inactive") return "This feature needs an active plan. Upgrade to continue.";
  const msg = err instanceof Error ? err.message : "";
  if (/ANTHROPIC_API_KEY/i.test(msg)) return "AI is not configured yet. Add an API key to continue.";
  return "Something went wrong generating options. Please try again.";
}
