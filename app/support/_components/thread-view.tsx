"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Icon } from "@/components/shell/icon";
import { Composer } from "./composer";
import type { Teammate, WorkMessage, WorkThreadDetail } from "./conversations-workspace";

/**
 * Thread view (client) — the center column. Renders the conversation header
 * (name + channel subline + Open/Resolved toggle + assignee), the message
 * transcript (customer left/grey bubbles, business right/dark, internal notes as
 * yellow cards), delivery ticks for outbound, and the <Composer/> (with AI
 * Suggest). Status + assignment changes POST to the inbox APIs.
 *
 * Matches the 05_support-inbox center column.
 */

const CHANNEL_LABEL: Record<string, string> = {
  email: "Email",
  facebook_msg: "Facebook Messenger",
  instagram_dm: "Instagram DM",
  whatsapp: "WhatsApp",
  gbp_qa: "Google Business",
  webchat: "Website chat",
  sms: "SMS",
};

export function ThreadView({
  thread,
  messages,
  status,
  teammates,
  aiEnabled,
  onSent,
  onStatusChange,
}: {
  thread: WorkThreadDetail | null;
  messages: WorkMessage[];
  status: string;
  teammates: Teammate[];
  aiEnabled: boolean;
  onSent: (msg: WorkMessage) => void;
  onStatusChange: (status: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the newest message on mount + when messages change.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, thread?.id]);

  if (!thread) {
    return (
      <div
        className="dim"
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
        <Icon name="chat" size={28} style={{ color: "var(--ink-3, #98a2b3)" }} />
        <p style={{ fontSize: 13, marginTop: 10 }}>Select a conversation to view the thread.</p>
      </div>
    );
  }

  const isResolved = status === "resolved";

  function toggleStatus() {
    setError(null);
    const next = isResolved ? "open" : "resolved";
    onStatusChange(next); // optimistic
    startTransition(async () => {
      try {
        const res = await fetch("/api/inbox/status", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ threadId: thread!.id, status: next }),
        });
        if (!res.ok) {
          onStatusChange(isResolved ? "resolved" : "open"); // revert
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

  const subline = [
    CHANNEL_LABEL[thread.channel] ?? thread.channel,
    thread.startedViaWidget ? "Started via Widget" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      {/* Header */}
      <div
        className="row"
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid var(--line)",
          gap: 12,
          alignItems: "flex-start",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: "var(--ink)" }}>
            {thread.participantName || thread.subject || "Conversation"}
          </h3>
          <p className="dim" style={{ fontSize: 12.5, margin: "2px 0 0" }}>
            {subline}
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <select
            aria-label="Assign conversation"
            defaultValue={thread.assigneeId ?? ""}
            onChange={(e) => assign(e.target.value || null)}
            disabled={pending}
            style={{
              fontSize: 12.5,
              padding: "6px 8px",
              borderRadius: 8,
              border: "1px solid var(--line)",
              background: "#fff",
              maxWidth: 150,
            }}
          >
            <option value="">Unassigned</option>
            {teammates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={toggleStatus}
            disabled={pending}
            className={isResolved ? "btn btn--sm" : "btn btn--sm btn--dark"}
            title={isResolved ? "Reopen conversation" : "Mark as resolved"}
          >
            <Icon name={isResolved ? "refresh" : "check"} size={13} />
            {isResolved ? "Reopen" : "Resolve"}
          </button>
        </div>
      </div>

      {error && (
        <div
          className="chip chip--bad"
          style={{ margin: "8px 20px 0", display: "inline-flex", width: "fit-content" }}
        >
          {error}
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          minHeight: 0,
          background: "var(--bg, #fff)",
        }}
      >
        {messages.length === 0 ? (
          <p className="dim" style={{ fontSize: 13, textAlign: "center", marginTop: 24 }}>
            No messages yet. Start the conversation below.
          </p>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} msg={m} />)
        )}
      </div>

      {/* Composer */}
      <Composer
        threadId={thread.id}
        aiEnabled={aiEnabled}
        disabled={pending}
        onSent={onSent}
      />
    </>
  );
}

function MessageBubble({ msg }: { msg: WorkMessage }) {
  const isInternal = msg.direction === "internal";
  const isOutbound = msg.direction === "outbound";

  if (isInternal) {
    return (
      <div
        style={{
          alignSelf: "center",
          maxWidth: "85%",
          background: "#fff7da",
          border: "1px solid #f4e3a1",
          borderRadius: 10,
          padding: "9px 12px",
          fontSize: 12.5,
          color: "#7a5b00",
        }}
      >
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
        alignSelf: isOutbound ? "flex-end" : "flex-start",
        maxWidth: "78%",
        display: "flex",
        flexDirection: "column",
        alignItems: isOutbound ? "flex-end" : "flex-start",
      }}
    >
      <div
        style={{
          background: isOutbound ? "#101820" : "#f0f3f1",
          color: isOutbound ? "#fff" : "var(--ink)",
          borderRadius: 12,
          padding: "10px 13px",
          fontSize: 13,
          lineHeight: 1.5,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {msg.body}
      </div>
      <span className="mono dim" style={{ fontSize: 10, marginTop: 3 }}>
        {new Date(msg.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        {isOutbound && (
          <span style={{ marginLeft: 5 }}>
            {msg.optimistic ? "· Sending…" : "· Sent"}
          </span>
        )}
      </span>
    </div>
  );
}
