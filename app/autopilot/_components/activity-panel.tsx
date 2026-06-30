"use client";

import { Icon } from "@/components/shell/icon";
import Link from "next/link";
import { type JSX, useState } from "react";
import type { ActivityFeedItem } from "@/lib/autopilot/queries";
import "./autopilot-activity.css";

/**
 * Activity tab (Module 15) — presentational. Built to the design kit in
 * designs/autopilot/Activity section/ (active + empty state): a two-column
 * "Activity" + "Needs you" card grid where each row carries a REAL kit
 * illustration (designs/autopilot/Activity section/active state/illustrations/*),
 * extracted to /assets/repulabs/autopilot/{act,needs}-*.png — not line icons.
 * Pure props; rows come from getAutopilotActivityFeed / getNeedsHumanQueue.
 */

const ASSETS = "/assets/repulabs/autopilot";

type Tone = "primary" | "purple" | "success" | "warning" | "danger";

/**
 * Per-loop label + REAL kit illustration. `art` points at the extracted kit
 * asset (see designs/autopilot/Activity section/.../illustrations). The mockup
 * pairs: AI reply→chat, review request→paper plane, voice→mic, digest→envelope,
 * rating→trend; loops without a dedicated kit illo reuse the nearest one.
 */
const LOOP_META: Record<string, { label: string; art: string; tone: Tone }> = {
  auto_reply: { label: "AI reply published", art: `${ASSETS}/act-ai-reply.png`, tone: "success" },
  low_star_draft: { label: "Low-star reply drafted", art: `${ASSETS}/act-ai-reply.png`, tone: "warning" },
  review_request: { label: "Review request sent", art: `${ASSETS}/act-review-req.png`, tone: "purple" },
  voice_review: { label: "Voice → Review request", art: `${ASSETS}/act-voice.svg`, tone: "primary" },
  dispute: { label: "Review dispute drafted", art: `${ASSETS}/needs-reviews.png`, tone: "warning" },
  geo_post: { label: "Geo post published", art: `${ASSETS}/act-rating.svg`, tone: "primary" },
  inbox_reply: { label: "Inbox reply sent", art: `${ASSETS}/needs-approve.png`, tone: "success" },
  escalation: { label: "Escalated to you", art: `${ASSETS}/needs-reviews.png`, tone: "warning" },
};

const FALLBACK_META = { label: "Autopilot action", art: `${ASSETS}/act-ai-reply.png`, tone: "primary" as Tone };

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
  if (item.status === "failed") return "Failed — needs another try";
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
            {/* Real kit empty-state illustration (Activity section/empty state). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${ASSETS}/empty-activity.png`}
              alt=""
              className="apa-empty__img"
              width={300}
              height={183}
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
            {/* Real kit "all caught up" illustration (Needs you, empty state). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${ASSETS}/empty-needs.png`}
              alt=""
              className="apa-empty__img apa-empty__img--check"
              width={150}
              height={150}
            />
            <p className="apa-empty__text">All caught up — nothing needs your attention right now.</p>
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="apa-icon__art" src={meta.art} alt="" loading="lazy" />
      </span>
      <div style={{ minWidth: 0 }}>
        <div className="apa-row__title">{meta.label}</div>
        <div className={`apa-row__desc${failed ? " apa-row__desc--danger" : ""}`}>{subLine(item)}</div>
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
      ? "Failed — check and retry"
      : item.loop === "escalation"
        ? "High priority"
        : "Waiting for your approval");
  const href = hrefFor(item);

  const body = (
    <>
      <span className={`apa-icon apa-icon--${failed ? "danger" : meta.tone}`} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="apa-icon__art" src={meta.art} alt="" loading="lazy" />
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
