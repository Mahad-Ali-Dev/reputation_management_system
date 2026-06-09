"use client";

import { Avatar } from "@/components/shell/avatar";
import type { WorkThread } from "./conversations-workspace";

/**
 * Conversation queue (client) — the left-column list of threads. Each card shows
 * an avatar, name, last-message preview, a channel badge, a "Started via Widget"
 * marker, an unread dot, and a relative timestamp. Selecting a card lifts the
 * `?thread=` change to the workspace (server re-fetch of the thread view).
 *
 * Matches the 05_support-inbox "Priority queue" cards.
 */

const CHANNEL_LABEL: Record<string, string> = {
  email: "Email",
  facebook_msg: "Facebook",
  instagram_dm: "Instagram",
  whatsapp: "WhatsApp",
  gbp_qa: "Google",
  webchat: "Live Chat",
  sms: "SMS",
};

/** A v3 chip variant per channel (purely cosmetic grouping). */
function channelChip(channel: string): string {
  switch (channel) {
    case "facebook_msg":
    case "instagram_dm":
      return "chip--info";
    case "whatsapp":
      return "chip--ok";
    case "webchat":
      return "chip--pri";
    case "sms":
      return "chip--ok";
    case "gbp_qa":
      return "chip--warn";
    default:
      return "chip--out";
  }
}

function toneFor(seed: string): 1 | 2 | 3 | 4 | 5 | 6 | 7 {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return ((h % 7) + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString();
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
      <p className="dim" style={{ fontSize: 12.5, textAlign: "center", padding: 28 }}>
        No conversations match your filters.
      </p>
    );
  }

  return (
    <ul style={{ listStyle: "none", margin: 0, padding: "0 10px 12px" }}>
      {threads.map((t) => {
        const active = t.id === selectedId;
        const name = t.participantName || t.subject || "Unknown";
        const preview = t.lastMessageBody || t.subject || "—";
        return (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => onSelect(t.id)}
              aria-current={active}
              style={{
                width: "100%",
                textAlign: "left",
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                padding: 10,
                marginTop: 6,
                borderRadius: 10,
                border: "1px solid transparent",
                background: active ? "var(--pri-soft, #eef8f4)" : "transparent",
                cursor: "pointer",
              }}
            >
              <Avatar name={name} size={36} tone={toneFor(t.id)} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row" style={{ gap: 6, justifyContent: "space-between" }}>
                  <span
                    style={{
                      fontSize: 13.5,
                      fontWeight: 700,
                      color: "var(--ink)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {name}
                  </span>
                  <span className="mono dim" style={{ fontSize: 10.5, flexShrink: 0 }}>
                    {relativeTime(t.lastMessageAt)}
                  </span>
                </div>
                <p
                  className="dim"
                  style={{
                    margin: "2px 0 6px",
                    fontSize: 12,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {preview}
                </p>
                <div className="row" style={{ gap: 5, flexWrap: "wrap" }}>
                  <span className={`chip ${channelChip(t.channel)}`}>
                    {CHANNEL_LABEL[t.channel] ?? t.channel}
                  </span>
                  {t.startedViaWidget && (
                    <span className="chip chip--out" title="Conversation started from the website widget">
                      Started via Widget
                    </span>
                  )}
                  {t.status === "resolved" && (
                    <span className="chip chip--ok">Resolved</span>
                  )}
                  {t.unreadCount > 0 && (
                    <span
                      aria-label={`${t.unreadCount} unread`}
                      className="chip chip--bad"
                      style={{ marginLeft: "auto" }}
                    >
                      {t.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
