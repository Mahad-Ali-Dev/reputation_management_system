"use client";

import { Icon } from "@/components/shell/icon";
import { useState, useTransition } from "react";

/**
 * Activity Timeline (client). Renders the merged, normalized timeline events
 * (reviews, surveys, review requests, inbox, social, live chat, phone, scans,
 * and directory events) handed down from the server, and pages further via
 * `GET /api/contacts/[id]/timeline?cursor=`. Each event shows a channel glyph +
 * badge + title + relative time + body + an optional deep-link. (AC: aggregates
 * events from all Unified-Inbox channels + reviews + surveys.)
 */

type WireEvent = {
  id: string;
  kind: string;
  channel: string;
  title: string;
  body: string | null;
  occurredAt: string; // ISO
  href: string | null;
  icon: string;
};

const CHANNEL_META: Record<string, { label: string; chip: string }> = {
  review: { label: "Review", chip: "chip--ok" },
  review_request: { label: "Request", chip: "chip--pri" },
  survey: { label: "Survey", chip: "chip--warn" },
  inbox: { label: "Inbox", chip: "chip--info" },
  social: { label: "Social", chip: "chip--pri" },
  live_chat: { label: "Live chat", chip: "chip--info" },
  phone: { label: "Phone", chip: "chip--info" },
  scan: { label: "Scan", chip: "chip--out" },
  note: { label: "Note", chip: "chip--out" },
  system: { label: "System", chip: "chip--out" },
};

export function ActivityTimeline({
  contactId,
  initialEvents,
  initialCursor,
}: {
  contactId: string;
  initialEvents: WireEvent[];
  initialCursor: string | null;
}) {
  const [events, setEvents] = useState<WireEvent[]>(initialEvents);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function loadMore() {
    if (!cursor) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/contacts/${contactId}/timeline?cursor=${encodeURIComponent(cursor)}`, {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error(`Failed (${res.status})`);
        const data = (await res.json()) as { events: WireEvent[]; nextCursor: string | null };
        setEvents((prev) => [...prev, ...data.events]);
        setCursor(data.nextCursor);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load more activity.");
      }
    });
  }

  return (
    <div className="ds-card">
      <div className="ds-card__head">
        <h3 className="ds-card__title">Activity timeline</h3>
        <span className="dim mono" style={{ fontSize: 10.5 }}>
          {events.length}
          {cursor ? "+" : ""} EVENT{events.length === 1 && !cursor ? "" : "S"}
        </span>
      </div>

      {events.length === 0 ? (
        <div className="ds-card__body" style={{ textAlign: "center", padding: 48 }}>
          <span style={{ color: "var(--rl-muted-3)", display: "inline-flex" }}>
            <Icon name="clock" size={28} />
          </span>
          <h4 style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", marginTop: 10 }}>No activity yet</h4>
          <p className="dim" style={{ fontSize: 12.5, marginTop: 4 }}>
            Reviews, surveys, messages, and other interactions will appear here as they happen.
          </p>
        </div>
      ) : (
        <div className="ds-card__body" style={{ paddingTop: 8, paddingBottom: 8 }}>
          <ol style={{ listStyle: "none", margin: 0, padding: 0, position: "relative" }}>
            {events.map((e, i) => (
              <TimelineRow key={e.id} event={e} isLast={i === events.length - 1} />
            ))}
          </ol>

          {error && (
            <p className="chip chip--bad" style={{ display: "inline-flex", marginTop: 12 }} role="alert">
              {error}
            </p>
          )}

          {cursor && (
            <div style={{ textAlign: "center", marginTop: 12 }}>
              <button type="button" className="btn btn--sm" disabled={pending} onClick={loadMore}>
                {pending ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TimelineRow({ event, isLast }: { event: WireEvent; isLast: boolean }) {
  const meta = CHANNEL_META[event.channel] ?? CHANNEL_META.system!;
  return (
    <li style={{ display: "flex", gap: 12, paddingBottom: isLast ? 0 : 16 }}>
      {/* Rail */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <span
          aria-hidden
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: "var(--surface-3)",
            color: "var(--ink-2)",
            display: "grid",
            placeItems: "center",
            fontSize: 14,
            flexShrink: 0,
          }}
        >
          {event.icon || "•"}
        </span>
        {!isLast && <span style={{ flex: 1, width: 1, background: "var(--line)", marginTop: 4 }} />}
      </div>

      {/* Body */}
      <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
        <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>{event.title}</span>
          <span className={`chip ${meta.chip}`} style={{ height: 18, fontSize: 10.5 }}>
            {meta.label}
          </span>
          <span className="dim mono" style={{ fontSize: 10.5 }}>
            {relativeTime(event.occurredAt)}
          </span>
        </div>
        {event.body && (
          <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.55 }}>{event.body}</p>
        )}
        {event.href && (
          <a
            href={event.href}
            className="row"
            style={{ gap: 4, fontSize: 12, color: "var(--pri)", marginTop: 4, textDecoration: "none" }}
          >
            View
            <Icon name="arrowR" size={12} />
          </a>
        )}
      </div>
    </li>
  );
}

function relativeTime(iso: string): string {
  const date = new Date(iso);
  const ms = Date.now() - date.getTime();
  if (Number.isNaN(ms)) return "";
  if (ms < 0) return date.toLocaleDateString();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}
