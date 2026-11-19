"use client";

import { Icon } from "@/components/shell/icon";
import type { ActivityFeedItem } from "@/lib/autopilot/queries";
import {
  CheckCheck,
  Flag,
  Inbox,
  type LucideIcon,
  MapPin,
  MessageSquareReply,
  Mic,
  PenLine,
  Send,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { type JSX, useState } from "react";
import "./autopilot-activity.css";

/**
 * Activity tab (Module 15) — presentational. Built to the design kit in
 * designs/autopilot/Activity section/ (active + empty state): a two-column
 * "Activity" + "Needs you" card grid where each row carries a bare Lucide
 * line icon in its tone colour (2026-11: the kit's PNG illustrations were
 * swapped out because they carried their own backgrounds).
 * Pure props; rows come from getAutopilotActivityFeed / getNeedsHumanQueue.
 */

type Tone = "primary" | "purple" | "success" | "warning" | "danger";

/**
 * Per-loop label + bare Lucide line icon (replaced the kit's PNG
 * illustrations, which carried their own backgrounds). The icon takes the
 * row's tone colour; there is no tile behind it.
 */
const LOOP_META: Record<string, { label: string; icon: LucideIcon; tone: Tone }> = {
  auto_reply: { label: "AI reply published", icon: MessageSquareReply, tone: "success" },
  low_star_draft: { label: "Low-star reply drafted", icon: PenLine, tone: "warning" },
  review_request: { label: "Review request sent", icon: Send, tone: "purple" },
  voice_review: { label: "Voice → Review request", icon: Mic, tone: "primary" },
  dispute: { label: "Review dispute drafted", icon: Flag, tone: "warning" },
  geo_post: { label: "Geo post published", icon: MapPin, tone: "primary" },
  inbox_reply: { label: "Inbox reply sent", icon: Inbox, tone: "success" },
  escalation: { label: "Escalated to you", icon: TriangleAlert, tone: "warning" },
};

const FALLBACK_META = {
  label: "Autopilot action",
  icon: Sparkles as LucideIcon,
  tone: "primary" as Tone,
};

/** How many rows each card shows before "View all" expands it. */
const VISIBLE_ROWS = 7;

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

/** `detail.summary` when the engine recorded one (real per-action copy). */
function detailSummary(item: ActivityFeedItem): string | null {
  if (item.detail && typeof item.detail === "object") {
    const d = item.detail as Record<string, unknown>;
    if (typeof d.summary === "string" && d.summary.trim().length > 0) return d.summary;
  }
  return null;
}

/** Sub-line for a ledger row: real summary first, then an action/status verb. */
function subLine(item: ActivityFeedItem): string {
  const summary = detailSummary(item);
  if (summary) return summary;
  if (item.status === "failed") return "Failed needs another try";
  if (item.requiresHuman) return "Waiting for your approval";
  if (item.status === "pending") return "Queued to run";
  switch (item.action) {
    case "published":
      return "Published automatically";
    case "drafted":
      return "Draft saved for you";
    case "scheduled_request":
      return "Scheduled to send";
    case "escalated":
      return "Flagged for your attention";
    default:
      return item.action.replace(/_/g, " ");
  }
}

/** "12m ago" style relative timestamp (kit shows relative times). */
function relTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ActivityPanel({
  feed,
  needsYou,
}: {
  feed: ActivityFeedItem[];
  needsYou: ActivityFeedItem[];
}): JSX.Element {
  const [allFeed, setAllFeed] = useState(false);
  const [allNeeds, setAllNeeds] = useState(false);

  const visibleFeed = allFeed ? feed : feed.slice(0, VISIBLE_ROWS);
  const visibleNeeds = allNeeds ? needsYou : needsYou.slice(0, VISIBLE_ROWS);

  return (
    <div className="apa-grid">
      {/* ---- Activity card ---- */}
      <section className="apa-card" aria-label="Autopilot activity">
        <div className="apa-card__head">
          <div className="apa-card__title-wrap">
            <h3 className="apa-card__title">Activity</h3>
          </div>
          {feed.length > VISIBLE_ROWS ? (
            <button
              type="button"
              className="apa-link"
              aria-expanded={allFeed}
              onClick={() => setAllFeed((v) => !v)}
            >
              {allFeed ? "Show less" : "View all"}
            </button>
          ) : (
            <span className="apa-meta">
              {feed.length} recent action{feed.length === 1 ? "" : "s"}
            </span>
          )}
        </div>

        {feed.length === 0 ? (
          <div className="apa-empty">
            {/* unDraw illustration (free, no attribution), brand-recoloured. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/assets/repulabs/illustrations/undraw-reviews.svg"
              alt=""
              className="apa-empty__img apa-empty__img--undraw"
              width={220}
              height={160}
            />
            <p className="apa-empty__text">
              Nothing yet. When Autopilot is on, everything it does shows up here.
            </p>
          </div>
        ) : (
          <div className="apa-list">
            {visibleFeed.map((item) => (
              <ActivityRow key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>

      {/* ---- Needs you card ---- */}
      <section className="apa-card" aria-label="Needs your attention">
        <div className="apa-card__head">
          <div className="apa-card__title-wrap">
            <h3 className="apa-card__title">Needs you</h3>
          </div>
          {needsYou.length > VISIBLE_ROWS && (
            <button
              type="button"
              className="apa-link"
              aria-expanded={allNeeds}
              onClick={() => setAllNeeds((v) => !v)}
            >
              {allNeeds ? "Show less" : "View all"}
            </button>
          )}
        </div>

        {needsYou.length === 0 ? (
          <div className="apa-empty">
            <span className="apa-empty__done" aria-hidden="true">
              <CheckCheck size={30} strokeWidth={1.9} />
            </span>
            <p className="apa-empty__text">
              All caught up. Nothing needs your attention right now.
            </p>
          </div>
        ) : (
          <div className="apa-list">
            {visibleNeeds.map((item) => (
              <NeedsRow key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ActivityRow({ item }: { item: ActivityFeedItem }): JSX.Element {
  const meta = LOOP_META[item.loop] ?? { ...FALLBACK_META, label: item.loop.replace(/_/g, " ") };
  const failed = item.status === "failed";
  const tone: Tone = failed ? "danger" : meta.tone;
  const href = hrefFor(item);

  // Kit shows a relative timestamp only on the right of each Activity row
  // (no status chip) — the status is conveyed by the sub-line copy.
  const body = (
    <>
      <span className={`apa-icon apa-icon--${tone}`} aria-hidden="true">
        <meta.icon size={18} strokeWidth={1.8} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div className="apa-row__title">{meta.label}</div>
        <div className={`apa-row__desc${failed ? " apa-row__desc--danger" : ""}`}>
          {subLine(item)}
        </div>
      </div>
      <div className="apa-row__side">
        <span className="apa-time" suppressHydrationWarning>
          {relTime(item.createdAt)}
        </span>
      </div>
    </>
  );

  return href ? (
    <Link href={href} className="apa-row">
      {body}
    </Link>
  ) : (
    <div className="apa-row">{body}</div>
  );
}

function NeedsRow({ item }: { item: ActivityFeedItem }): JSX.Element {
  const meta = LOOP_META[item.loop] ?? { ...FALLBACK_META, label: item.loop.replace(/_/g, " ") };
  const failed = item.status === "failed";
  const urgent = failed || item.loop === "escalation";
  const desc =
    detailSummary(item) ??
    (failed
      ? "Failed check and retry"
      : item.loop === "escalation"
        ? "High priority"
        : "Waiting for your approval");
  const href = hrefFor(item);

  const body = (
    <>
      <span className={`apa-icon apa-icon--${failed ? "danger" : meta.tone}`} aria-hidden="true">
        <meta.icon size={18} strokeWidth={1.8} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div className="apa-row__title">{meta.label}</div>
        <div className={`apa-row__desc${urgent ? " apa-row__desc--danger" : ""}`}>{desc}</div>
      </div>
      <div className="apa-needs-end">{href && <Icon name="chevR" size={14} />}</div>
    </>
  );

  return href ? (
    <Link href={href} className="apa-row">
      {body}
    </Link>
  ) : (
    <div className="apa-row">{body}</div>
  );
}
