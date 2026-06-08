"use client";

import Link from "next/link";
import { Icon } from "@/components/shell/icon";
import type { WorkThreadDetail } from "./conversations-workspace";

/**
 * Customer context (client) — the right column. Shows the participant profile +
 * metadata derived from the thread, an "AI assist" card (detected channel /
 * status with a deep-link to draft via the composer's AI Suggest), quick actions
 * (View Contact, Add note), and a lightweight timeline.
 *
 * Matches the 05_support-inbox "Customer context" column. Kept dependency-light:
 * richer profile + booking actions land with the contacts/phone integrations in
 * later phases; this surfaces what the thread already knows.
 */

const CHANNEL_LABEL: Record<string, string> = {
  email: "Email",
  facebook_msg: "Facebook",
  instagram_dm: "Instagram",
  gbp_qa: "Google Business",
  webchat: "Website chat",
  sms: "SMS",
};

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--line)",
        borderRadius: 12,
        background: "#fff",
        padding: 14,
        marginBottom: 12,
      }}
    >
      <h4 style={{ fontSize: 14, fontWeight: 800, margin: "0 0 8px", color: "var(--ink)" }}>
        {title}
      </h4>
      {children}
    </div>
  );
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
      <p className="dim" style={{ fontSize: 12.5 }}>
        Select a conversation to see customer context.
      </p>
    );
  }

  const name = thread.participantName || thread.subject || "Unknown";

  return (
    <div>
      <h3 style={{ fontSize: 17, fontWeight: 800, margin: "0 0 12px", color: "var(--ink)" }}>
        Customer context
      </h3>

      <Card title={name}>
        <dl style={{ margin: 0, fontSize: 12.5, color: "var(--ink-2)" }}>
          <Row label="Channel" value={CHANNEL_LABEL[thread.channel] ?? thread.channel} />
          <Row label="Status" value={thread.status === "resolved" ? "Resolved" : "Open"} />
          <Row label="Messages" value={String(messageCount)} />
          {thread.startedViaWidget && <Row label="Origin" value="Website widget" />}
        </dl>
        <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          {thread.startedViaWidget && <span className="chip chip--out">Started via Widget</span>}
          {thread.status === "resolved" ? (
            <span className="chip chip--ok">Resolved</span>
          ) : (
            <span className="chip chip--info">Active</span>
          )}
        </div>
      </Card>

      <div
        style={{
          border: "1px solid var(--line)",
          borderRadius: 12,
          background: "linear-gradient(180deg, #f7f9ff 0%, #ffffff 100%)",
          padding: 14,
          marginBottom: 12,
        }}
      >
        <h4 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 6px", color: "var(--ink)" }}>
          <Icon name="sparkle" size={14} style={{ color: "var(--pri)" }} /> AI assist
        </h4>
        <p className="dim" style={{ fontSize: 12.5, margin: 0, lineHeight: 1.5 }}>
          Use AI Suggest in the composer to draft an on-brand reply from this conversation and
          your knowledge base.
        </p>
      </div>

      <Card title="Quick actions">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Link href="/contacts" className="btn btn--sm" style={{ textDecoration: "none", justifyContent: "flex-start" }}>
            <Icon name="user" size={13} />
            View in Contacts
          </Link>
          <Link href="/phone" className="btn btn--sm" style={{ textDecoration: "none", justifyContent: "flex-start" }}>
            <Icon name="phone" size={13} />
            Call back
          </Link>
        </div>
      </Card>

      <Card title="Timeline">
        <ul style={{ listStyle: "none", margin: 0, padding: 0, fontSize: 12.5 }}>
          <li className="dim" style={{ display: "flex", gap: 8, padding: "4px 0" }}>
            <Icon name="clock" size={13} />
            Last message {relativeTime(thread.lastMessageAt)}
          </li>
          <li className="dim" style={{ display: "flex", gap: 8, padding: "4px 0" }}>
            <Icon name="chat" size={13} />
            {messageCount} message{messageCount === 1 ? "" : "s"} in this thread
          </li>
        </ul>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="row" style={{ justifyContent: "space-between", padding: "3px 0" }}>
      <dt className="dim" style={{ fontSize: 12 }}>
        {label}
      </dt>
      <dd style={{ margin: 0, fontWeight: 600, color: "var(--ink)" }}>{value}</dd>
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
