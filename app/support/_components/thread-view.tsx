"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Icon } from "@/components/shell/icon";
import { Avatar } from "@/components/shell/avatar";
import { Composer } from "./composer";
import { AiSuggestBox } from "./ai-suggest-box";
import { ChannelGlyph } from "./channel-glyph";
import type { Teammate, WorkMessage, WorkThreadDetail } from "./conversations-workspace";

/**
 * Thread view (client) — the center column of the conversations kit. Renders the
 * conversation header (avatar + channel + Active-now + action buttons + assignee
 * + status toggle), the transcript (left pale bubbles / right gradient bubbles /
 * internal notes), a date divider, the AI suggested replies panel, and the
 * <Composer/>. Status + assignment changes POST to the inbox APIs.
 */

function toneFor(seed: string): 1 | 2 | 3 | 4 | 5 | 6 | 7 {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return ((h % 7) + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
}

export function ThreadView({
  thread,
  messages,
  status,
  teammates,
  aiEnabled,
  aiDraft,
  onSent,
  onStatusChange,
  onUseAi,
}: {
  thread: WorkThreadDetail | null;
  messages: WorkMessage[];
  status: string;
  teammates: Teammate[];
  aiEnabled: boolean;
  aiDraft: string | null;
  onSent: (msg: WorkMessage) => void;
  onStatusChange: (status: string) => void;
  onUseAi: (text: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showAssign, setShowAssign] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, thread?.id]);

  if (!thread) {
    return (
      <div
        className="uik-mut"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 40,
          textAlign: "center",
        }}
      >
        <Icon name="chat" size={28} style={{ color: "var(--uik-faint)" }} />
        <p style={{ fontSize: 13, marginTop: 10 }}>Select a conversation to view the thread.</p>
      </div>
    );
  }

  const isResolved = status === "resolved";
  const name = thread.participantName || thread.subject || "Conversation";

  function toggleStatus() {
    setError(null);
    const next = isResolved ? "open" : "resolved";
    onStatusChange(next);
    startTransition(async () => {
      try {
        const res = await fetch("/api/inbox/status", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ threadId: thread!.id, status: next }),
        });
        if (!res.ok) {
          onStatusChange(isResolved ? "resolved" : "open");
          setError("Couldn't update status.");
        }
      } catch {
        onStatusChange(isResolved ? "resolved" : "open");
        setError("Couldn't update status.");
      }
    });
  }

  function assign(assigneeId: string | null) {
    setError(null);
    setShowAssign(false);
    startTransition(async () => {
      try {
        await fetch("/api/inbox/assign", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ threadId: thread!.id, assigneeId }),
        });
      } catch {
        setError("Couldn't assign.");
      }
    });
  }

  return (
    <>
      {/* Header */}
      <div
        className="row"
        style={{
          padding: "14px 18px",
          borderBottom: "1px solid var(--uik-line)",
          gap: 12,
          alignItems: "center",
        }}
      >
        <Avatar name={name} size={44} tone={toneFor(thread.id)} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 7, alignItems: "center" }}>
            <h3
              style={{
                fontSize: 15,
                fontWeight: 800,
                margin: 0,
                color: "var(--uik-ink)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {name}
            </h3>
            <ChannelGlyph channel={thread.channel} size={15} />
          </div>
          <p className="uik-mut" style={{ fontSize: 12, margin: "2px 0 0", display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: isResolved ? "#cbd5e1" : "var(--uik-ok)" }}
            />
            {isResolved ? "Resolved" : "Active now"}
            {thread.startedViaWidget && <span> · Started via Widget</span>}
          </p>
        </div>

        <div className="row" style={{ gap: 6, position: "relative" }}>
          <button
            type="button"
            className="uik-quick"
            style={{ width: 38, height: 38, color: "var(--uik-ink-2)" }}
            onClick={() => setShowAssign((s) => !s)}
            aria-label="Assign conversation"
            title="Assign"
          >
            <Icon name="user" size={16} />
          </button>
          <button
            type="button"
            onClick={toggleStatus}
            disabled={pending}
            className={isResolved ? "uik-btn uik-btn--sm" : "uik-btn uik-btn--sm uik-btn--pri"}
            title={isResolved ? "Reopen conversation" : "Mark as resolved"}
          >
            <Icon name={isResolved ? "refresh" : "check"} size={13} />
            {isResolved ? "Reopen" : "Resolve"}
          </button>

          {showAssign && (
            <div
              style={{
                position: "absolute",
                top: 44,
                right: 0,
                zIndex: 20,
                background: "#fff",
                border: "1px solid var(--uik-line)",
                borderRadius: "var(--uik-r-md)",
                boxShadow: "var(--uik-sh-soft)",
                padding: 6,
                minWidth: 180,
              }}
            >
              <button
                type="button"
                className="uik-btn uik-btn--ghost uik-btn--sm"
                style={{ width: "100%", justifyContent: "flex-start" }}
                onClick={() => assign(null)}
              >
                Unassigned
              </button>
              {teammates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="uik-btn uik-btn--ghost uik-btn--sm"
                  style={{ width: "100%", justifyContent: "flex-start" }}
                  onClick={() => assign(t.id)}
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="uik-pill uik-pill--warn" style={{ margin: "8px 18px 0", width: "fit-content" }}>
          {error}
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "18px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          minHeight: 0,
          background: "#fff",
        }}
      >
        {messages.length === 0 ? (
          <p className="uik-mut" style={{ fontSize: 13, textAlign: "center", marginTop: 24 }}>
            No messages yet. Start the conversation below.
          </p>
        ) : (
          <>
            <span className="uik-date-divider">{dayLabel(messages[0]!.sentAt)}</span>
            {messages.map((m) => (
              <MessageBubble key={m.id} msg={m} name={name} tone={toneFor(thread.id)} />
            ))}
          </>
        )}
      </div>

      {/* AI suggested replies (above composer) */}
      <div style={{ padding: "0 12px 8px" }}>
        <AiSuggestBox
          threadId={thread.id}
          enabled={aiEnabled}
          onUse={(text) => onUseAi(text)}
        />
      </div>

      {/* Composer */}
      <Composer
        threadId={thread.id}
        aiEnabled={aiEnabled}
        disabled={pending}
        injectedDraft={aiDraft}
        onSent={onSent}
      />
    </>
  );
}

function MessageBubble({ msg, name, tone }: { msg: WorkMessage; name: string; tone: 1 | 2 | 3 | 4 | 5 | 6 | 7 }) {
  const isInternal = msg.direction === "internal";
  const isOutbound = msg.direction === "outbound";

  if (isInternal) {
    return (
      <div className="uik-bubble-note">
        <span style={{ fontWeight: 700, marginRight: 6 }}>
          <Icon name="pin" size={11} /> Internal note
        </span>
        <span style={{ whiteSpace: "pre-wrap" }}>{msg.body}</span>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignSelf: isOutbound ? "flex-end" : "flex-start",
        maxWidth: "82%",
        alignItems: "flex-end",
        flexDirection: isOutbound ? "row-reverse" : "row",
      }}
    >
      {!isOutbound && <Avatar name={name} size={28} tone={tone} />}
      <div style={{ display: "flex", flexDirection: "column", alignItems: isOutbound ? "flex-end" : "flex-start" }}>
        <div className={isOutbound ? "uik-bubble-out" : "uik-bubble-in"}>{msg.body}</div>
        <span className="uik-mono" style={{ fontSize: 10, marginTop: 3, color: "var(--uik-faint)" }}>
          {new Date(msg.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          {isOutbound && (
            <span style={{ marginLeft: 5 }}>{msg.optimistic ? "· Sending…" : "✓✓"}</span>
          )}
        </span>
      </div>
    </div>
  );
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return "Today";
  const yest = new Date(now.getTime() - 864e5);
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { month: "long", day: "numeric" });
}
