"use client";

import { Icon, type IconName } from "@/components/shell/icon";
import Link from "next/link";
import type { JSX } from "react";
import type { ActivityFeedItem } from "@/lib/autopilot/queries";

/**
 * Activity panel (Module 15) — presentational. Renders the AutopilotAction feed
 * grouped by day ("Replied to 12 reviews", "Sent 8 review requests") plus the
 * "Needs you" queue (escalations / drafts awaiting approval) with deep-links.
 * Pure props; no data fetching.
 */

const LOOP_META: Record<string, { label: string; icon: IconName }> = {
  auto_reply: { label: "Replied to a review", icon: "reply" },
  low_star_draft: { label: "Drafted a low-star reply", icon: "edit" },
  review_request: { label: "Sent a review request", icon: "send" },
  voice_review: { label: "Turned a call into a review request", icon: "phone" },
  dispute: { label: "Drafted a review dispute", icon: "flag" },
  geo_post: { label: "Published a geo post", icon: "pin" },
  inbox_reply: { label: "Replied in the inbox", icon: "chat" },
  escalation: { label: "Escalated to you", icon: "alert" },
};

const ACTION_VERB: Record<string, string> = {
  published: "published",
  drafted: "drafted",
  scheduled_request: "scheduled",
  escalated: "escalated",
};

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const yest = new Date(today.getTime() - 86400000);
  const isYest = d.toDateString() === yest.toDateString();
  if (isToday) return "Today";
  if (isYest) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/** Best-effort deep link to the resource an action touched. */
function hrefFor(item: ActivityFeedItem): string | null {
  switch (item.loop) {
    case "auto_reply":
    case "low_star_draft":
    case "escalation":
      return "/reviews";
    case "review_request":
    case "voice_review":
      return "/outreach";
    case "dispute":
      return "/reviews/dispute";
    case "geo_post":
      return "/social/posts";
    case "inbox_reply":
      return "/support";
    default:
      return null;
  }
}

export function ActivityPanel({
  feed,
  needsYou,
}: {
  feed: ActivityFeedItem[];
  needsYou: ActivityFeedItem[];
}): JSX.Element {
  const groups = new Map<string, ActivityFeedItem[]>();
  for (const item of feed) {
    const k = dayKey(item.createdAt);
    const arr = groups.get(k) ?? [];
    arr.push(item);
    groups.set(k, arr);
  }
  const dayKeys = [...groups.keys()].sort((a, b) => (a < b ? 1 : -1));

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1fr)",
        gap: 14,
        alignItems: "start",
      }}
    >
      {/* Activity feed */}
      <div className="ds-card">
        <div className="ds-card__head">
          <h3 className="ds-card__title">Activity</h3>
          <span className="dim" style={{ fontSize: 12 }}>
            {feed.length} recent action{feed.length === 1 ? "" : "s"}
          </span>
        </div>
        {feed.length === 0 ? (
          <div className="ds-card__body dim" style={{ textAlign: "center", padding: 32 }}>
            <Icon name="bolt" size={26} style={{ color: "var(--pri)" }} />
            <p style={{ marginTop: 10, fontSize: 13 }}>
              Nothing yet. When Autopilot is on, everything it does shows up here.
            </p>
          </div>
        ) : (
          <div style={{ padding: 4 }}>
            {dayKeys.map((k) => {
              const items = groups.get(k) ?? [];
              const firstItem = items[0];
              if (!firstItem) return null;
              return (
                <div key={k} style={{ marginBottom: 6 }}>
                  <div
                    className="dim"
                    style={{
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      padding: "10px 12px 4px",
                    }}
                  >
                    {dayLabel(firstItem.createdAt)}
                  </div>
                  {items.map((item, i) => (
                    <ActivityRow key={item.id} item={item} first={i === 0} />
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Needs you */}
      <div className="ds-card">
        <div className="ds-card__head">
          <h3 className="ds-card__title">Needs you</h3>
          {needsYou.length > 0 && <span className="chip chip--warn">{needsYou.length}</span>}
        </div>
        {needsYou.length === 0 ? (
          <div className="ds-card__body dim" style={{ textAlign: "center", padding: 28 }}>
            <Icon name="checkCircle" size={24} style={{ color: "var(--ok)" }} />
            <p style={{ marginTop: 10, fontSize: 13 }}>All caught up — nothing needs you right now.</p>
          </div>
        ) : (
          <div style={{ padding: 4 }}>
            {needsYou.map((item, i) => {
              const meta = LOOP_META[item.loop] ?? { label: item.loop, icon: "alert" as IconName };
              const href = hrefFor(item);
              const detail =
                item.detail && typeof item.detail === "object"
                  ? ((item.detail as Record<string, unknown>).summary as string | undefined)
                  : undefined;
              const body = (
                <div
                  className="row"
                  style={{
                    padding: 12,
                    gap: 10,
                    borderTop: i ? "1px solid var(--line)" : "none",
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <span style={{ color: "var(--warn)", flexShrink: 0 }}>
                    <Icon name={meta.icon} size={15} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{meta.label}</div>
                    <div className="dim" style={{ fontSize: 11.5 }}>
                      {detail ?? "Awaiting your review"}
                    </div>
                  </div>
                  {href && <Icon name="chevR" size={13} style={{ color: "var(--rl-muted-2)" }} />}
                </div>
              );
              return href ? (
                <Link key={item.id} href={href} style={{ display: "block" }}>
                  {body}
                </Link>
              ) : (
                <div key={item.id}>{body}</div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ActivityRow({ item, first }: { item: ActivityFeedItem; first: boolean }): JSX.Element {
  const meta = LOOP_META[item.loop] ?? { label: item.loop, icon: "bolt" as IconName };
  const verb = ACTION_VERB[item.action] ?? item.action;
  const time = new Date(item.createdAt).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const failed = item.status === "failed";
  return (
    <div
      className="row"
      style={{
        padding: "10px 12px",
        gap: 10,
        borderTop: first ? "none" : "1px solid var(--line)",
      }}
    >
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          background: failed ? "var(--bad-soft)" : "var(--pri-50)",
          color: failed ? "var(--bad)" : "var(--pri)",
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
      >
        <Icon name={meta.icon} size={13} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13 }}>
          {meta.label}
          {item.requiresHuman && (
            <span className="chip chip--warn" style={{ marginLeft: 8, fontSize: 10 }}>
              needs you
            </span>
          )}
        </div>
        <div className="dim" style={{ fontSize: 11 }}>
          {failed ? "Failed" : verb} · {time}
        </div>
      </div>
    </div>
  );
}
