"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/shell/icon";
import { AiSuggestBox } from "./ai-suggest-box";
import type { WorkMessage } from "./conversations-workspace";

/**
 * Composer (client) — the reply box at the bottom of the thread view.
 *
 *   - Textarea (Enter to send, Shift+Enter for newline).
 *   - "Note" toggle → posts an internal yellow-card note instead of a reply.
 *   - "AI Suggest" → opens <AiSuggestBox/>; "Use" fills this textarea.
 *   - Send → POST /api/inbox/send; on success the parent appends the message
 *     optimistically (reconciled by the workspace poll).
 *
 * Matches the 05_support-inbox "Use AI suggested reply…" composer.
 */

export function Composer({
  threadId,
  aiEnabled,
  disabled,
  onSent,
}: {
  threadId: string;
  aiEnabled: boolean;
  disabled?: boolean;
  onSent: (msg: WorkMessage) => void;
}) {
  const [value, setValue] = useState("");
  const [isNote, setIsNote] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [usedAiDraft, setUsedAiDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function send() {
    const body = value.trim();
    if (!body || pending) return;
    setError(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/inbox/send", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            threadId,
            body,
            kind: isNote ? "note" : "reply",
            aiSuggested: usedAiDraft && usedAiDraft === body ? usedAiDraft : undefined,
          }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          setError(
            data.error === "forbidden"
              ? "You don't have permission to send."
              : "Couldn't send. Try again.",
          );
          return;
        }
        const data = (await res.json()) as { message: WorkMessage; note: boolean };
        // Tag internal notes so the bubble renderer styles them yellow.
        onSent({ ...data.message, direction: data.note ? "internal" : "outbound", optimistic: true });
        setValue("");
        setUsedAiDraft(null);
        setShowAi(false);
      } catch {
        setError("Couldn't send. Try again.");
      }
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div style={{ borderTop: "1px solid var(--line)", padding: "12px 16px 14px" }}>
      {showAi && (
        <AiSuggestBox
          threadId={threadId}
          enabled={aiEnabled}
          onUse={(text) => {
            setValue(text);
            setUsedAiDraft(text);
            setShowAi(false);
          }}
          onClose={() => setShowAi(false)}
        />
      )}

      {error && (
        <div className="chip chip--bad" style={{ marginBottom: 8, display: "inline-flex" }}>
          {error}
        </div>
      )}

      <div
        style={{
          border: "1px solid var(--line)",
          borderRadius: 12,
          background: isNote ? "#fffdf2" : "#fff",
          padding: 8,
        }}
      >
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          disabled={disabled}
          placeholder={isNote ? "Add an internal note (only your team sees this)…" : "Type a reply…  Use AI suggested reply or write your own."}
          aria-label={isNote ? "Internal note" : "Reply"}
          style={{
            width: "100%",
            resize: "none",
            border: "none",
            outline: "none",
            background: "transparent",
            fontSize: 13.5,
            lineHeight: 1.5,
            color: "var(--ink)",
            padding: "4px 6px",
          }}
        />
        <div className="row" style={{ justifyContent: "space-between", marginTop: 4 }}>
          <div className="row" style={{ gap: 6 }}>
            <button
              type="button"
              onClick={() => setShowAi((s) => !s)}
              className="btn btn--xs btn--ghost"
              title="AI suggested replies"
            >
              <Icon name="sparkle" size={12} />
              AI Suggest
            </button>
            <button
              type="button"
              onClick={() => setIsNote((n) => !n)}
              className={isNote ? "btn btn--xs btn--dark" : "btn btn--xs btn--ghost"}
              title="Toggle internal note"
              aria-pressed={isNote}
            >
              <Icon name="pin" size={12} />
              Note
            </button>
          </div>
          <button
            type="button"
            onClick={send}
            disabled={pending || disabled || value.trim().length === 0}
            className="btn btn--sm btn--pri"
          >
            <Icon name="send" size={13} />
            {pending ? "Sending…" : isNote ? "Add note" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
