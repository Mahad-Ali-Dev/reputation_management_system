"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/shell/icon";

/**
 * AI Suggested Replies (client) — the persistent panel above the composer in the
 * conversations kit. Calls POST /api/inbox/ai-suggest with `{ threadId }` and
 * renders up to 3 suggestion cards (loading skeletons while fetching). Clicking
 * a card fills the composer (via `onUse`); "Regenerate" re-fetches asking for
 * materially different drafts. Degrades gracefully: an empty result shows a
 * reason hint (AI not configured, plan upgrade, daily budget) rather than an
 * error, and never blocks the operator from writing their own reply.
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

function hintFor(reason: string): string {
  return REASON_HINT[reason] ?? FALLBACK_HINT;
}

export function AiSuggestBox({
  threadId,
  enabled,
  onUse,
}: {
  threadId: string;
  enabled: boolean;
  onUse: (text: string) => void;
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

  useEffect(() => {
    void fetchSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  return (
    <div className="uik-ai">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 10, alignItems: "flex-start" }}>
        <div>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--uik-ink)", display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="sparkle" size={14} style={{ color: "var(--uik-purple)" }} />
            AI Suggested Replies
          </span>
          <span className="uik-mut" style={{ fontSize: 11, display: "block", marginTop: 1 }}>
            Quick response ideas based on the conversation
          </span>
        </div>
        <button
          type="button"
          onClick={() => fetchSuggestions(options.length ? options : undefined)}
          disabled={loading || !enabled}
          className="uik-btn uik-btn--xs"
          title="Regenerate"
        >
          <Icon name="refresh" size={12} />
          Regenerate
        </button>
      </div>

      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              aria-hidden
              style={{
                height: 56,
                borderRadius: 8,
                background: "linear-gradient(90deg, #eef1f6 25%, #f6f8fb 37%, #eef1f6 63%)",
                backgroundSize: "400% 100%",
                animation: "uikShimmer 1.4s ease infinite",
              }}
            />
          ))}
          <style>{`@keyframes uikShimmer{0%{background-position:100% 0}100%{background-position:0 0}}`}</style>
        </div>
      ) : options.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {options.slice(0, 3).map((opt, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onUse(opt)}
              className="uik-ai__card"
              style={{ cursor: "pointer", textAlign: "left", justifyContent: "space-between" }}
              title="Use this reply"
            >
              <span style={{ flex: 1 }}>{opt}</span>
              <Icon name="send" size={13} style={{ color: "var(--uik-pri)", flexShrink: 0, marginTop: 1 }} />
            </button>
          ))}
        </div>
      ) : (
        <p className="uik-mut" style={{ fontSize: 12, margin: "2px 0" }}>
          {hint ?? FALLBACK_HINT}
        </p>
      )}
    </div>
  );
}
