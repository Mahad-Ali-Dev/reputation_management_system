"use client";

import Link from "next/link";
import { Icon } from "@/components/shell/icon";
import { Avatar } from "@/components/shell/avatar";
import { ChannelGlyph, channelLabel } from "./channel-glyph";
import type { WorkThreadDetail } from "./conversations-workspace";

/**
 * Customer context (client) — the right column of the conversations kit. Pastel
 * profile cover, avatar + quick actions, a Details grid, Labels, Recent
 * Conversations, and an Activity Timeline. Bound to the real selected thread;
 * sections with no backing data (labels, prior conversations) render an inline
 * empty hint rather than fabricated rows.
 */

function toneFor(seed: string): 1 | 2 | 3 | 4 | 5 | 6 | 7 {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return ((h % 7) + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
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

export function CustomerContext({
  thread,
  messageCount,
}: {
  thread: WorkThreadDetail | null;
  messageCount: number;
}) {
  if (!thread) {
    return (
      <p className="uik-mut" style={{ fontSize: 12.5, padding: 18 }}>
        Select a conversation to see customer context.
      </p>
    );
  }

  const name = thread.participantName || thread.subject || "Unknown";
  const handle = `@${name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "")}`;

  return (
    <div>
      {/* Profile cover */}
      <div className="uik-cover">
        <Link
          href="/support?tab=conversations"
          className="uik-cover__close"
          aria-label="Close profile"
          title="Close"
        >
          <Icon name="x" size={15} />
        </Link>
      </div>

      {/* Identity row (avatar overlaps cover) */}
      <div style={{ padding: "0 18px", marginTop: -34, position: "relative" }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ border: "4px solid #fff", borderRadius: "50%", position: "relative" }}>
            <Avatar name={name} size={72} tone={toneFor(thread.id)} />
            {thread.status !== "resolved" && (
              <span
                style={{
                  position: "absolute",
                  right: 2,
                  bottom: 2,
                  width: 15,
                  height: 15,
                  borderRadius: "50%",
                  background: "var(--uik-ok)",
                  border: "2.5px solid #fff",
                }}
              />
            )}
          </div>
          <div className="row" style={{ gap: 7, marginBottom: 6 }}>
            <Link href={`/support?tab=conversations&thread=${thread.id}`} className="uik-quick" aria-label="Message" title="Message">
              <Icon name="chat" size={16} />
            </Link>
            <Link href="/phone" className="uik-quick" aria-label="Call" title="Call">
              <Icon name="phone" size={16} />
            </Link>
            <Link href="/contacts" className="uik-quick" aria-label="Email / contact" title="Open contact">
              <Icon name="mail" size={16} />
            </Link>
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <div className="row" style={{ gap: 7, alignItems: "center" }}>
            <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: "var(--uik-ink)" }}>{name}</h3>
            <ChannelGlyph channel={thread.channel} size={15} />
          </div>
          <p className="uik-mut" style={{ fontSize: 12, margin: "2px 0 0" }}>{handle}</p>
          <p style={{ fontSize: 12, margin: "6px 0 0", display: "flex", alignItems: "center", gap: 6, color: "var(--uik-ink-2)" }}>
            <span
              style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: thread.status === "resolved" ? "#cbd5e1" : "var(--uik-ok)" }}
            />
            {thread.status === "resolved" ? "Resolved" : "Active now"}
          </p>
        </div>
      </div>

      {/* Details */}
      <div className="uik-sect" style={{ marginTop: 14 }}>
        <div className="uik-sect__head">
          <h4 className="uik-sect__title">Details</h4>
          <Link href="/contacts" className="uik-sect__action">Edit</Link>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", rowGap: 14, columnGap: 18 }}>
          <Detail icon="cal" label="Channel" value={channelLabel(thread.channel)} />
          <Detail icon="chat" label="Messages" value={String(messageCount)} />
          <Detail icon="info" label="Status" value={thread.status === "resolved" ? "Resolved" : "Open"} />
          {thread.startedViaWidget && <Detail icon="plug" label="Origin" value="Website widget" />}
        </div>
      </div>

      {/* AI assist nudge */}
      <div style={{ padding: "0 18px", marginTop: 4 }}>
        <div
          style={{
            border: "1px solid #e1e6ff",
            borderRadius: "var(--uik-r-lg)",
            background: "linear-gradient(180deg, #f3f1ff 0%, #f7f9ff 100%)",
            padding: 13,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 800, color: "var(--uik-ink)", display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="sparkle" size={14} style={{ color: "var(--uik-purple)" }} />
            AI assist
          </span>
          <p className="uik-mut" style={{ fontSize: 12, margin: "4px 0 0", lineHeight: 1.5 }}>
            Use AI Suggested Replies above the composer to draft an on-brand reply from this
            conversation and your knowledge base.
          </p>
        </div>
      </div>

      {/* Labels */}
      <div className="uik-sect">
        <div className="uik-sect__head">
          <h4 className="uik-sect__title">Labels</h4>
          <Link href="/contacts" className="uik-sect__action">Manage</Link>
        </div>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          {thread.startedViaWidget && (
            <span className="uik-pill uik-pill--needs">Website lead</span>
          )}
          {thread.status === "resolved" ? (
            <span className="uik-pill uik-pill--replied">Resolved</span>
          ) : (
            <span className="uik-pill uik-pill--info">Active</span>
          )}
          <Link href="/contacts" className="uik-chip" style={{ height: 24, color: "var(--uik-purple)", borderColor: "#d9d0ff" }}>
            <Icon name="plus" size={11} />
            Add label
          </Link>
        </div>
      </div>

      {/* Activity timeline */}
      <div className="uik-sect">
        <div className="uik-sect__head">
          <h4 className="uik-sect__title">Activity Timeline</h4>
        </div>
        <div className="uik-tl">
          <div className="uik-tl__item">
            <span className="uik-tl__dot" style={{ background: "var(--uik-ok)" }} />
            <p style={{ fontSize: 12, fontWeight: 600, margin: 0, color: "var(--uik-ink)" }}>
              Conversation opened via {channelLabel(thread.channel)}
            </p>
            <p className="uik-mut" style={{ fontSize: 11, margin: "1px 0 0" }}>{relativeTime(thread.lastMessageAt)}</p>
          </div>
          <div className="uik-tl__item">
            <span className="uik-tl__dot" style={{ background: "var(--uik-pri)" }} />
            <p style={{ fontSize: 12, fontWeight: 600, margin: 0, color: "var(--uik-ink)" }}>
              {messageCount} message{messageCount === 1 ? "" : "s"} in this thread
            </p>
            <p className="uik-mut" style={{ fontSize: 11, margin: "1px 0 0" }}>Last activity {relativeTime(thread.lastMessageAt)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Detail({ icon, label, value }: { icon: Parameters<typeof Icon>[0]["name"]; label: string; value: string }) {
  return (
    <div>
      <span className="uik-field__label">
        <Icon name={icon} size={12} />
        {label}
      </span>
      <span className="uik-field__value">{value}</span>
    </div>
  );
}
