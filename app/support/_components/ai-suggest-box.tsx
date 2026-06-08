"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/shell/icon";

/**
 * AI Suggest box (client) — the AiAssist suggestion UI inside the composer.
 *
 * Calls POST /api/inbox/ai-suggest with `{ threadId }` and renders up to 3
 * options (loading skeletons while fetching). "Use" fills the composer;
 * "Regenerate" re-fetches asking for materially different drafts (passes the
 * current options as `avoidTexts`). Degrades gracefully: an empty result shows a
 * reason hint (AI not configured, plan upgrade, daily budget) rather than an
 * error, and never blocks the operator from writing their own reply.
 *
 * Mirrors the artboard's "AI assist → Generate" affordance, returning 3 options.
 */

type SuggestResponse = {
  options: string[];
  reason?: string;
  error?: string;
};

const REASON_HINT: Record<string, string> = {
  ai_unconfigured: "AI isn't configured for this workspace yet.",
  plan_inactive: "AI Suggest is a Pro feature. Upgrade to enable it.",
  ai_budget: "Your daily AI limit is reached. Resets at midnight UTC.",
  no_thread: "Not enough conversation context to suggest a reply.",
  error: "Couldn't generate suggestions. Try again.",
  rate_limited: "You're generating too fast. Try again in a moment.",
};

const FALLBACK_HINT = "Couldn't generate suggestions. Try again.";

/** Resolve a reason code to a non-optional hint string (safe under noUncheckedIndexedAccess). */
function hintFor(reason: string): string {
  return REASON_HINT[reason] ?? FALLBACK_HINT;
}

export function AiSuggestBox({
  threadId,
  enabled,
  onUse,
  onClose,
}: {
  threadId: string;
  enabled: boolean;
  onUse: (text: string) => void;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<string[]>([]);
  const [hint, setHint] = useState<string | null>(null);

  const fetchSuggestions = useCallback(
    async (avoidTexts?: string[]) => {
      if (!enabled) {
        setHint(hintFor("plan_inactive"));
        return;
      }
      setLoading(true);
      setHint(null);
      try {
        const res = await fetch("/api/inbox/ai-suggest", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ threadId, avoidTexts }),
        });
        const data = (await res.json().catch(() => ({}))) as SuggestResponse;
        setOptions(data.options ?? []);
        if ((data.options ?? []).length === 0) {
          const reason = data.error ?? data.reason ?? "error";
          setHint(hintFor(reason));
        }
      } catch {
        setOptions([]);
        setHint(hintFor("error"));
      } finally {
        setLoading(false);
      }
    },
    [threadId, enabled],
  );

  // Auto-fetch when the box opens.
  useEffect(() => {
    void fetchSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  return (
    <div
      style={{
        border: "1px solid var(--line)",
        borderRadius: 12,
        background: "linear-gradient(180deg, #f7f9ff 0%, #ffffff 100%)",
        padding: 12,
        marginBottom: 10,
      }}
    >
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: "var(--ink)" }}>
          <Icon name="sparkle" size={13} style={{ color: "var(--pri)" }} /> AI suggested replies
        </span>
        <div className="row" style={{ gap: 6 }}>
          <button
            type="button"
            onClick={() => fetchSuggestions(options.length ? options : undefined)}
            disabled={loading || !enabled}
            className="btn btn--xs btn--ghost"
            title="Regenerate"
          >
            <Icon name="refresh" size={12} />
            Regenerate
          </button>
          <button
            type="button"
            onClick={onClose}
            className="btn btn--xs btn--ghost"
            aria-label="Close AI suggestions"
          >
            <Icon name="xCircle" size={13} />
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              aria-hidden
              style={{
                height: 44,
                borderRadius: 8,
                background:
                  "linear-gradient(90deg, #eef1f6 25%, #f6f8fb 37%, #eef1f6 63%)",
                backgroundSize: "400% 100%",
                animation: "inboxShimmer 1.4s ease infinite",
              }}
            />
          ))}
          <style>{`@keyframes inboxShimmer{0%{background-position:100% 0}100%{background-position:0 0}}`}</style>
        </div>
      ) : options.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {options.map((opt, i) => (
            <div
              key={i}
              style={{
                border: "1px solid var(--line)",
                borderRadius: 8,
                background: "#fff",
                padding: "9px 11px",
                display: "flex",
                gap: 8,
                alignItems: "flex-start",
              }}
            >
              <p style={{ flex: 1, margin: 0, fontSize: 12.5, lineHeight: 1.5, color: "var(--ink-2)" }}>
                {opt}
              </p>
              <button
                type="button"
                onClick={() => onUse(opt)}
                className="btn btn--xs btn--pri"
                style={{ flexShrink: 0 }}
              >
                Use
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="dim" style={{ fontSize: 12, margin: "4px 0" }}>
          {hint ?? REASON_HINT.error}
        </p>
      )}
    </div>
  );
}
