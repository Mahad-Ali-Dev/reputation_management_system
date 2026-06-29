"use client";

import { Avatar } from "@/components/shell/avatar";
import { ChannelGlyph } from "./channel-glyph";
import type { WorkThread } from "./conversations-workspace";

/**
 * Conversation queue (client) — the left-column list. Each row shows an avatar
 * with a brand channel mini-badge + online dot, the participant name, a
 * last-message preview, a relative timestamp, and an unread count badge.
 * Matches the "conversations / active state" kit list (handoff §12).
 */

function toneFor(seed: string): 1 | 2 | 3 | 4 | 5 | 6 | 7 {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return ((h % 7) + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
}

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  const dys = Math.floor(h / 24);
  if (dys < 7) return d.toLocaleDateString([], { month: "short", day: "numeric" });
  return d.toLocaleDateString();
}

export function ThreadList({
  threads,
  selectedId,
  onSelect,
}: {
  threads: WorkThread[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (threads.length === 0) {
    return (
      <p className="uik-mut" style={{ fontSize: 12.5, textAlign: "center", padding: 28 }}>
        No conversations match your filters.
      </p>
    );
  }

  return (
    <ul style={{ listStyle: "none", margin: 0, padding: "0 8px 14px" }}>
      {threads.map((t) => {
        const active = t.id === selectedId;
        const name = t.participantName || t.subject || "Unknown";
        const preview = t.lastMessageBody || t.subject || "—";
        const isMissed = t.channel === "phone" && /missed/i.test(preview);
        return (
          <li key={t.id} style={{ marginTop: 4 }}>
            <button
              type="button"
              onClick={() => onSelect(t.id)}
              aria-current={active}
              className={`uik-convo${active ? " is-active" : ""}`}
            >
              <span className="uik-av">
                <Avatar name={name} size={44} tone={toneFor(t.id)} />
                <span className="uik-av__chan" style={{ background: "#fff" }} aria-hidden>
                  <ChannelGlyph channel={t.channel} size={15} mode="badge" />
                </span>
              </span>

              <span style={{ minWidth: 0 }}>
                <span className="row" style={{ gap: 6, justifyContent: "space-between", alignItems: "center" }}>
                  <span className="uik-convo__name">{name}</span>
                  <span className="uik-convo__time uik-mono">{relativeTime(t.lastMessageAt)}</span>
                </span>
                <span className="row" style={{ gap: 8, justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
                  <span
                    className="uik-convo__preview"
                    style={{
                      margin: 0,
                      minWidth: 0,
                      ...(isMissed ? { color: "var(--uik-bad)", fontWeight: 600 } : {}),
                    }}
                  >
                    {preview}
                  </span>
                  {t.unreadCount > 0 ? (
                    <span className="uik-convo__badge" aria-label={`${t.unreadCount} unread`}>
                      {t.unreadCount}
                    </span>
                  ) : t.status === "resolved" ? (
                    <span className="uik-pill uik-pill--replied">Resolved</span>
                  ) : null}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
