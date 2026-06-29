"use client";

import { useEffect, useState, useTransition } from "react";
import { Icon } from "@/components/shell/icon";
import type { WorkMessage } from "./conversations-workspace";

/**
 * Composer (client) — the reply box at the bottom of the thread view, matching
 * the conversations kit. A bordered card with a textarea, a toolbar (attachment
 * affordances + AI Assist + Note toggle), and a gradient Send button.
 *
 *   - Enter sends, Shift+Enter newline.
 *   - "Note" toggle → posts an internal note (yellow card) instead of a reply.
 *   - `injectedDraft` (an AI suggestion clicked above) fills the textarea.
 *   - Send → POST /api/inbox/send; on success the parent appends the message
 *     optimistically (reconciled by the workspace poll).
 */

export function Composer({
  threadId,
  aiEnabled,
  disabled,
  injectedDraft,
  onSent,
}: {
  threadId: string;
  aiEnabled: boolean;
  disabled?: boolean;
  injectedDraft?: string | null;
  onSent: (msg: WorkMessage) => void;
}) {
  const [value, setValue] = useState("");
  const [isNote, setIsNote] = useState(false);
  const [usedAiDraft, setUsedAiDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // When a suggestion is clicked above, fill the textarea.
  useEffect(() => {
    if (injectedDraft != null) {
      setValue(injectedDraft);
      setUsedAiDraft(injectedDraft);
      setIsNote(false);
    }
  }, [injectedDraft]);

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
        onSent({ ...data.message, direction: data.note ? "internal" : "outbound", optimistic: true });
        setValue("");
        setUsedAiDraft(null);
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
    <div style={{ borderTop: "1px solid var(--uik-line)", padding: "12px 16px 14px" }}>
      {error && (
        <div className="uik-pill uik-pill--warn" style={{ marginBottom: 8, width: "fit-content" }}>
          {error}
        </div>
      )}

      <div
        style={{
          border: "1px solid var(--uik-line-strong)",
          borderRadius: "var(--uik-r-2xl)",
          background: isNote ? "#fffdf2" : "#fff",
          padding: "12px 14px",
        }}
      >
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          disabled={disabled}
          placeholder={isNote ? "Add an internal note (only your team sees this)…" : "Type your message…"}
          aria-label={isNote ? "Internal note" : "Reply"}
          style={{
            width: "100%",
            resize: "none",
            border: "none",
            outline: "none",
            background: "transparent",
            fontSize: 13.5,
            lineHeight: 1.5,
            color: "var(--uik-ink)",
            fontFamily: "inherit",
          }}
        />
        <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>
          <div className="row" style={{ gap: 4, color: "var(--uik-mut)" }}>
            <span
              aria-hidden
              style={{
                width: 30,
                height: 30,
                borderRadius: "50%",
                background: "var(--uik-grad-pri)",
                color: "#fff",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="plus" size={15} />
            </span>
            <ToolbarIcon name="image" label="Attach image" />
            <ToolbarIcon name="upload" label="Attach file" />
            <button
              type="button"
              onClick={() => setIsNote((n) => !n)}
              className={isNote ? "uik-btn uik-btn--xs uik-btn--pri" : "uik-btn uik-btn--xs uik-btn--ghost"}
              title="Toggle internal note"
              aria-pressed={isNote}
              style={{ marginLeft: 4 }}
            >
              <Icon name="pin" size={12} />
              Note
            </button>
          </div>
          <button
            type="button"
            onClick={send}
            disabled={pending || disabled || value.trim().length === 0}
            className="uik-btn uik-btn--sm uik-btn--pri"
          >
            <Icon name="send" size={14} />
            {pending ? "Sending…" : isNote ? "Add note" : "Send"}
          </button>
        </div>
      </div>
      {!aiEnabled && (
        <p className="uik-mut" style={{ fontSize: 11, margin: "6px 2px 0" }}>
          AI Suggest is a Pro feature — upgrade to draft replies from your knowledge base.
        </p>
      )}
    </div>
  );
}

function ToolbarIcon({ name, label }: { name: "image" | "upload"; label: string }) {
  return (
    <button
      type="button"
      className="uik-btn uik-btn--ghost"
      style={{ width: 32, height: 32, padding: 0, borderRadius: 8 }}
      aria-label={label}
      title={label}
    >
      <Icon name={name} size={17} />
    </button>
  );
}
