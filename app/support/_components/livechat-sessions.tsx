"use client";

import { useCallback, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/shell/icon";
import { Avatar } from "@/components/shell/avatar";
import { moveConversationToSms } from "@/lib/inbox/widget-actions";

/**
 * Live Chat — sessions sub-view (client island). Two columns:
 *   Left : live visitor sessions (online dot, handed-off badge, last activity).
 *   Right: the selected session's read-only transcript + actions (Open in
 *          Conversations to reply with the unified composer; Move to SMS to
 *          continue the conversation via text after the visitor leaves).
 *
 * Selecting a session is URL-driven (`?session=`) so the server re-fetches its
 * transcript (RSC). Matches the 05_support-inbox surface (.ds-card/.chip).
 */

export type SessionView = {
  conversationId: string;
  name: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  currentUrl: string | null;
  online: boolean;
  handedOff: boolean;
  lastActivityAt: string;
  threadId: string | null;
};

export type TranscriptView = {
  id: string;
  role: string; // user | assistant | system
  content: string;
  at: string;
};

export function LiveChatSessions({
  sessions,
  selectedId,
  selectedThreadId,
  onlineCount,
  transcript,
}: {
  sessions: SessionView[];
  selectedId: string | null;
  selectedThreadId: string | null;
  onlineCount: number;
  transcript: TranscriptView[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selectSession = useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.set("tab", "live-chat");
      params.set("session", id);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const selected = sessions.find((s) => s.conversationId === selectedId) ?? null;

  return (
    <div className="uik-card" style={{ padding: 0 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(260px, 320px) minmax(0, 1fr)",
          minHeight: 540,
        }}
      >
        {/* LEFT: sessions */}
        <aside
          style={{
            borderRight: "1px solid var(--uik-line)",
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
          }}
        >
          <div style={{ padding: "16px 18px 10px" }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--ink)" }}>
              Live sessions
            </h3>
            <p className="dim" style={{ fontSize: 12.5, margin: "2px 0 0" }}>
              <span
                style={{
                  display: "inline-block",
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: onlineCount > 0 ? "#16a34a" : "#cbd5e1",
                  marginRight: 5,
                }}
              />
              {onlineCount} online now
            </p>
          </div>
          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            {sessions.map((s, i) => {
              const active = s.conversationId === selectedId;
              const tone = ((i % 7) + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
              return (
                <button
                  key={s.conversationId}
                  type="button"
                  onClick={() => selectSession(s.conversationId)}
                  className="row"
                  style={{
                    width: "100%",
                    textAlign: "left",
                    gap: 10,
                    padding: "12px 16px",
                    border: "none",
                    borderTop: i ? "1px solid var(--uik-divider)" : "none",
                    background: active ? "var(--uik-soft)" : "transparent",
                    cursor: "pointer",
                    alignItems: "flex-start",
                  }}
                >
                  <div style={{ position: "relative", flex: "0 0 auto" }}>
                    <Avatar name={s.name} size={32} tone={tone} />
                    {s.online && (
                      <span
                        style={{
                          position: "absolute",
                          right: -1,
                          bottom: -1,
                          width: 9,
                          height: 9,
                          borderRadius: "50%",
                          background: "#16a34a",
                          border: "2px solid #fff",
                        }}
                      />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row" style={{ gap: 6, alignItems: "center" }}>
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "var(--ink)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {s.name}
                      </span>
                      {s.handedOff && <span className="uik-pill uik-pill--warn">Handed off</span>}
                    </div>
                    {s.location && (
                      <p className="dim" style={{ margin: "2px 0 0", fontSize: 11.5 }}>
                        {s.location}
                      </p>
                    )}
                    <p className="dim mono" style={{ margin: "2px 0 0", fontSize: 10.5 }}>
                      {relativeTime(s.lastActivityAt)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* RIGHT: transcript + actions */}
        <section style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          {!selected ? (
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
              <Icon name="bot" size={26} style={{ color: "var(--ink-3, #98a2b3)" }} />
              <p style={{ fontSize: 13, marginTop: 10 }}>Select a session to view the chat.</p>
            </div>
          ) : (
            <SessionDetail
              session={selected}
              selectedThreadId={selectedThreadId}
              transcript={transcript}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function SessionDetail({
  session,
  selectedThreadId,
  transcript,
}: {
  session: SessionView;
  selectedThreadId: string | null;
  transcript: TranscriptView[];
}) {
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
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--ink)" }}>
            {session.name}
          </h3>
          <p className="dim" style={{ fontSize: 12.5, margin: "2px 0 0" }}>
            {[session.online ? "Online" : "Away", session.location, session.email]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {session.currentUrl && (
            <p className="dim mono" style={{ fontSize: 11, margin: "3px 0 0", wordBreak: "break-all" }}>
              {session.currentUrl}
            </p>
          )}
        </div>
        <div className="row" style={{ gap: 8 }}>
          {selectedThreadId && (
            <Link
              href={`/support?tab=conversations&channel=webchat&thread=${selectedThreadId}`}
              className="uik-btn uik-btn--sm uik-btn--pri"
            >
              <Icon name="reply" size={13} />
              Reply in Conversations
            </Link>
          )}
        </div>
      </div>

      {/* Transcript (read-only) */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          minHeight: 0,
        }}
      >
        {transcript.length === 0 ? (
          <p className="dim" style={{ fontSize: 13, textAlign: "center", marginTop: 24 }}>
            No messages captured for this session yet.
          </p>
        ) : (
          transcript.map((m) => <TranscriptBubble key={m.id} msg={m} />)
        )}
      </div>

      {/* Move-to-SMS footer (only when we have a phone) */}
      <MoveToSmsBar session={session} />
    </>
  );
}

function TranscriptBubble({ msg }: { msg: TranscriptView }) {
  const isUser = msg.role === "user";
  if (msg.role === "system") {
    return (
      <div className="dim" style={{ alignSelf: "center", fontSize: 11.5, fontStyle: "italic" }}>
        {msg.content}
      </div>
    );
  }
  return (
    <div
      style={{
        alignSelf: isUser ? "flex-start" : "flex-end",
        maxWidth: "78%",
        display: "flex",
        flexDirection: "column",
        alignItems: isUser ? "flex-start" : "flex-end",
      }}
    >
      <div className={isUser ? "uik-bubble-in" : "uik-bubble-out"}>{msg.content}</div>
      <span className="mono dim" style={{ fontSize: 10, marginTop: 3 }}>
        {isUser ? "Visitor" : "AI"} ·{" "}
        {new Date(msg.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </span>
    </div>
  );
}

function MoveToSmsBar({ session }: { session: SessionView }) {
  const [pending, startTransition] = useTransition();
  const [phone, setPhone] = useState(session.phone ?? "");
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div
        className="dim"
        style={{ padding: "12px 20px", borderTop: "1px solid var(--line)", fontSize: 12.5 }}
      >
        <Icon name="check" size={13} style={{ color: "#16a34a" }} /> Moved to SMS continue in
        the SMS thread under Conversations.
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "12px 20px",
        borderTop: "1px solid var(--line)",
        display: "flex",
        gap: 8,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <Icon name="smartphone" size={14} style={{ color: "var(--ink-3)" }} />
      <span className="dim" style={{ fontSize: 12.5 }}>
        Continue via SMS:
      </span>
      <input
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="+1 555 123 4567"
        aria-label="Visitor phone for SMS handoff"
        style={{
          flex: "1 1 160px",
          padding: "6px 10px",
          fontSize: 13,
          borderRadius: 8,
          border: "1px solid var(--line)",
          background: "#fff",
        }}
      />
      <button
        type="button"
        disabled={pending || !phone.trim()}
        className="uik-btn uik-btn--sm uik-btn--pri"
        onClick={() => {
          startTransition(async () => {
            const fd = new FormData();
            fd.set("phone", phone.trim());
            fd.set("conversationId", session.conversationId);
            if (session.threadId) fd.set("threadId", session.threadId);
            await moveConversationToSms(fd);
            setDone(true);
          });
        }}
      >
        {pending ? "Moving…" : "Move to SMS"}
      </button>
    </div>
  );
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
