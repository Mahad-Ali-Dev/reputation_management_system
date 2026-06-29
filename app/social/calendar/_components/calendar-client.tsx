"use client";

import { Icon, type IconName } from "@/components/shell/icon";
import { rescheduleSocialPost } from "@/lib/social/post-actions";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type JSX, useMemo, useState, useTransition } from "react";

/**
 * `<CalendarClient>` (Module 10) — drag-to-reschedule calendar island, rebuilt
 * to the delivered design kit (.sk-cal-* / .sk-week-*).
 *
 * The server page (`/social/calendar`) runs the DB query + keeps the month math;
 * it hands this island a flat, serializable `posts` array plus `year`/`month`/
 * `view`. The island renders the toolbar (prev/today/next + month label +
 * month/week toggle + legend + drag helper), the grid (month 6-week, or a rich
 * week board with thumbnails + status badges + per-day add buttons) and adds:
 *   - HTML5 drag-and-drop: drop a post chip/card on a day → `rescheduleSocialPost`
 *     (only `draft`/`scheduled` are draggable) → optimistic move + `router.refresh()`.
 *   - a week / month view toggle.
 *
 * RSC-safety: all interactivity lives here; the page stays a server component.
 */

export type CalendarPost = {
  id: string;
  caption: string | null;
  platforms: string[];
  status: string;
  mediaUrl: string | null;
  /** ISO string of the day this chip sits on (postedAt ?? scheduledFor). */
  when: string;
  /** Whether this post can be dragged (draft | scheduled). */
  movable: boolean;
};

const PLATFORM_ICON: Record<string, IconName> = {
  facebook: "fb",
  instagram: "insta",
  linkedin: "linkedin",
  twitter: "twitter",
};
const PLATFORM_COLOR: Record<string, string> = {
  facebook: "#1877F2",
  instagram: "#E1306C",
  linkedin: "#0A66C2",
  twitter: "#0F1419",
};

/** Map a post status → the kit's 3 calendar event tones. */
function eventTone(status: string): "published" | "scheduled" | "draft" {
  if (status === "published" || status === "posted") return "published";
  if (status === "draft") return "draft";
  return "scheduled"; // scheduled / publishing / failed all read as scheduled-purple
}

const DAY_NAMES = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

function keyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildMonthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const firstWeekday = (first.getDay() + 6) % 7; // Mon = 0
  const start = new Date(year, month, 1 - firstWeekday);
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  return days;
}

function buildWeekGrid(year: number, month: number): Date[] {
  // Week containing "today" if today is in this month, else the first week.
  const today = new Date();
  const anchor =
    today.getFullYear() === year && today.getMonth() === month ? today : new Date(year, month, 1);
  const weekday = (anchor.getDay() + 6) % 7;
  const start = new Date(anchor);
  start.setDate(anchor.getDate() - weekday);
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  return days;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function ymString(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}
function hrefFor(year: number, month: number, view: "month" | "week"): string {
  return `/social/calendar?ym=${ymString(year, month)}&view=${view}`;
}
function shiftMonth(year: number, month: number, delta: number) {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

export function CalendarClient({
  posts,
  year,
  month,
  view,
}: {
  posts: CalendarPost[];
  year: number;
  month: number;
  view: "month" | "week";
}): JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Optimistic overrides: postId → new ISO day (so a dropped chip moves instantly).
  const [moved, setMoved] = useState<Record<string, string>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const days = useMemo(
    () => (view === "week" ? buildWeekGrid(year, month) : buildMonthGrid(year, month)),
    [view, year, month],
  );

  // Bucket posts by day (honoring optimistic moves).
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarPost[]>();
    for (const p of posts) {
      const iso = moved[p.id] ?? p.when;
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) continue;
      const k = keyOf(d);
      const list = map.get(k) ?? [];
      list.push(p);
      map.set(k, list);
    }
    return map;
  }, [posts, moved]);

  function onDrop(day: Date) {
    const id = dragId;
    setOverKey(null);
    setDragId(null);
    if (!id) return;
    const post = posts.find((p) => p.id === id);
    if (!post || !post.movable) {
      setError("Only drafts and scheduled posts can be moved.");
      return;
    }
    // Preserve the original time-of-day; just change the date.
    const orig = new Date(moved[id] ?? post.when);
    const target = new Date(day);
    target.setHours(orig.getHours(), orig.getMinutes(), 0, 0);
    if (keyOf(target) === keyOf(orig)) return; // no-op

    setError(null);
    setMoved((m) => ({ ...m, [id]: target.toISOString() }));

    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("id", id);
        fd.set("scheduledFor", target.toISOString());
        await rescheduleSocialPost(fd);
        router.refresh();
      } catch (e) {
        // Roll back the optimistic move on failure.
        setMoved((m) => {
          const next = { ...m };
          delete next[id];
          return next;
        });
        setError(e instanceof Error ? friendlyError(e.message) : "Couldn’t reschedule.");
      }
    });
  }

  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, +1);
  const monthLabel = new Date(year, month, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const weekLabel = (() => {
    const w = buildWeekGrid(year, month);
    const a = w[0]!;
    const b = w[6]!;
    const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${fmt(a)} - ${fmt(b)}, ${b.getFullYear()}`;
  })();

  return (
    <div>
      {/* toolbar */}
      <div className="sk-cal-toolbar">
        <div className="sk-cal-nav">
          <Link
            href={hrefFor(prev.year, prev.month, view)}
            className="sk-cal-navbtn"
            aria-label="Previous"
          >
            <Icon name="chevL" size={15} />
          </Link>
          <Link href={`/social/calendar?view=${view}`} className="sk-cal-today">
            Today
          </Link>
          <Link
            href={hrefFor(next.year, next.month, view)}
            className="sk-cal-navbtn"
            aria-label="Next"
          >
            <Icon name="chevR" size={15} />
          </Link>
          <span className="sk-cal-month">{view === "week" ? weekLabel : monthLabel}</span>
        </div>

        <div className="sk-cal-right">
          <div className="sk-seg">
            <Link
              href={hrefFor(year, month, "month")}
              className={`sk-seg__b${view === "month" ? " is-active" : ""}`}
            >
              Month
            </Link>
            <Link
              href={hrefFor(year, month, "week")}
              className={`sk-seg__b${view === "week" ? " is-active" : ""}`}
            >
              Week
            </Link>
          </div>
          <div className="sk-legend">
            <span className="sk-legend__item">
              <span className="sk-legend__dot" style={{ background: "var(--sk-published)" }} />
              Published
            </span>
            <span className="sk-legend__item">
              <span className="sk-legend__dot" style={{ background: "var(--sk-scheduled)" }} />
              Scheduled
            </span>
            <span className="sk-legend__item">
              <span className="sk-legend__dot" style={{ background: "var(--sk-draft)" }} />
              Draft
            </span>
          </div>
          <span className="sk-cal-help">
            {pending ? (
              <>
                <Icon name="refresh" size={13} /> Saving…
              </>
            ) : error ? (
              <span style={{ color: "#c0344a" }} role="alert">
                <Icon name="alert" size={13} /> {error}
              </span>
            ) : (
              <>
                <Icon name="move" size={13} /> Drag drafts &amp; scheduled posts to reschedule
              </>
            )}
          </span>
        </div>
      </div>

      {view === "week" ? (
        <WeekBoard
          days={days}
          byDay={byDay}
          overKey={overKey}
          dragId={dragId}
          setDragId={setDragId}
          setOverKey={setOverKey}
          onDrop={onDrop}
        />
      ) : (
        <MonthGrid
          days={days}
          month={month}
          byDay={byDay}
          overKey={overKey}
          dragId={dragId}
          setDragId={setDragId}
          setOverKey={setOverKey}
          onDrop={onDrop}
        />
      )}
    </div>
  );
}

/* ------------------------------- month grid ------------------------------- */

function MonthGrid({
  days,
  month,
  byDay,
  overKey,
  dragId,
  setDragId,
  setOverKey,
  onDrop,
}: {
  days: Date[];
  month: number;
  byDay: Map<string, CalendarPost[]>;
  overKey: string | null;
  dragId: string | null;
  setDragId: (id: string | null) => void;
  setOverKey: (k: string | null) => void;
  onDrop: (day: Date) => void;
}) {
  const today = new Date();
  return (
    <div className="sk-cal-card">
      <div className="sk-cal-weekhead">
        {DAY_NAMES.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="sk-cal-grid">
        {days.map((day) => {
          const inMonth = day.getMonth() === month;
          const isToday = isSameDay(day, today);
          const k = keyOf(day);
          const dayPosts = byDay.get(k) ?? [];
          const isOver = overKey === k;
          return (
            // biome-ignore lint/a11y/useKeyWithClickEvents: drop targets are pointer-only; keyboard reschedule is available via the post editor's date field
            <div
              key={k}
              className={`sk-cal-cell${inMonth ? "" : " sk-cal-cell--out"}${isOver ? " is-over" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (overKey !== k) setOverKey(k);
              }}
              onDragLeave={() => {
                if (overKey === k) setOverKey(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                onDrop(day);
              }}
            >
              <div className="sk-cal-cell__top">
                <span className={`sk-cal-daynum${isToday ? " sk-cal-daynum--today" : ""}`}>
                  {day.getDate()}
                </span>
                {dayPosts.length > 0 && <span className="sk-cal-count">{dayPosts.length}</span>}
              </div>
              {dayPosts.slice(0, 3).map((p) => (
                <MonthChip
                  key={p.id}
                  post={p}
                  dragging={dragId === p.id}
                  onDragStart={() => setDragId(p.id)}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverKey(null);
                  }}
                />
              ))}
              {dayPosts.length > 3 && <span className="sk-cal-more">+{dayPosts.length - 3} more</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthChip({
  post,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  post: CalendarPost;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const tone = eventTone(post.status);
  const time = new Date(post.when).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <Link
      href={`/social/posts?tab=create&post=${post.id}`}
      draggable={post.movable}
      onDragStart={(e) => {
        if (!post.movable) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", post.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={`sk-chip-event sk-chip-event--${tone}`}
      title={post.movable ? "Drag to reschedule · click to edit" : "Click to view"}
      style={{ opacity: dragging ? 0.4 : 1, cursor: post.movable ? "grab" : "pointer" }}
    >
      <span className="sk-chip-event__dot" />
      <span className="sk-chip-event__txt">{time}</span>
    </Link>
  );
}

/* -------------------------------- week board ------------------------------ */

function WeekBoard({
  days,
  byDay,
  overKey,
  dragId,
  setDragId,
  setOverKey,
  onDrop,
}: {
  days: Date[];
  byDay: Map<string, CalendarPost[]>;
  overKey: string | null;
  dragId: string | null;
  setDragId: (id: string | null) => void;
  setOverKey: (k: string | null) => void;
  onDrop: (day: Date) => void;
}) {
  const today = new Date();
  const hasAny = days.some((d) => (byDay.get(keyOf(d)) ?? []).length > 0);
  return (
    <div className="sk-week">
      {days.map((day, idx) => {
        const k = keyOf(day);
        const dayPosts = byDay.get(k) ?? [];
        const isOver = overKey === k;
        const isToday = isSameDay(day, today);
        const publishedCount = dayPosts.filter(
          (p) => p.status === "published" || p.status === "posted",
        ).length;
        const badgeTone = publishedCount >= dayPosts.length && dayPosts.length > 0 ? "published" : "scheduled";
        return (
          // biome-ignore lint/a11y/useKeyWithClickEvents: drop targets are pointer-only; keyboard reschedule is available via the post editor's date field
          <div
            key={k}
            className={`sk-weekcol${isOver ? " is-over" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              if (overKey !== k) setOverKey(k);
            }}
            onDragLeave={() => {
              if (overKey === k) setOverKey(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              onDrop(day);
            }}
          >
            <div className="sk-weekcol__head">
              <div className="sk-weekcol__day">{DAY_NAMES[idx]}</div>
              <div className={`sk-weekcol__date${isToday ? " sk-weekcol__date--today" : ""}`}>
                {day.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                {dayPosts.length > 0 && (
                  <span className={`sk-weekcount sk-weekcount--${badgeTone}`}>{dayPosts.length}</span>
                )}
              </div>
            </div>
            {dayPosts.map((p) => (
              <WeekCard
                key={p.id}
                post={p}
                dragging={dragId === p.id}
                onDragStart={() => setDragId(p.id)}
                onDragEnd={() => {
                  setDragId(null);
                  setOverKey(null);
                }}
              />
            ))}
            <Link
              href={`/social/posts?tab=create`}
              className="sk-week-add"
              aria-label={`Create post on ${day.toLocaleDateString("en-US", { month: "long", day: "numeric" })}`}
              title="Create post on this day"
            >
              <Icon name="plus" size={15} />
            </Link>
          </div>
        );
      })}

      {!hasAny && (
        <div className="sk-week-empty">
          <span className="sk-week-empty__art" aria-hidden>
            {/* biome-ignore lint/performance/noImgElement: static illustration-kit asset */}
            <img src="/assets/repulabs/post-creator/cal-calendar.svg" alt="" />
          </span>
          <h3 className="sk-empty-center__title" style={{ fontSize: 20 }}>
            Your calendar is empty
          </h3>
          <p className="sk-empty-center__body" style={{ margin: "6px 0 16px" }}>
            No posts scheduled for this week.
          </p>
          <Link href="/social/posts?tab=create" className="btn btn--pri" style={{ height: 44 }}>
            <Icon name="plus" size={14} />
            Create your first post
          </Link>
        </div>
      )}
    </div>
  );
}

function WeekCard({
  post,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  post: CalendarPost;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const platform = (post.platforms ?? [])[0]?.toLowerCase() ?? "";
  const icon = PLATFORM_ICON[platform] ?? "share";
  const platformColor = PLATFORM_COLOR[platform] ?? "var(--sk-muted)";
  const tone = eventTone(post.status);
  const time = new Date(post.when).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <Link
      href={`/social/posts?tab=create&post=${post.id}`}
      draggable={post.movable}
      onDragStart={(e) => {
        if (!post.movable) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", post.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className="sk-weekcard"
      title={post.movable ? "Drag to reschedule · click to edit" : "Click to view"}
      style={{ opacity: dragging ? 0.4 : 1, cursor: post.movable ? "grab" : "pointer" }}
    >
      <div className="sk-weekcard__top">
        <span className="sk-weekcard__time">{time}</span>
        <Icon name={icon} size={15} style={{ color: platformColor }} />
      </div>
      {post.mediaUrl && (
        // biome-ignore lint/performance/noImgElement: post thumbnail (user/blob asset)
        <img
          src={post.mediaUrl}
          alt=""
          style={{
            width: "100%",
            height: 64,
            objectFit: "cover",
            borderRadius: 8,
            marginTop: 8,
            border: "1px solid var(--sk-line)",
          }}
        />
      )}
      <div className="sk-weekcard__copy">{post.caption || "(no caption)"}</div>
      <div className="sk-weekcard__foot">
        <span className={`sk-status sk-status--${tone}`} style={{ height: 22, fontSize: 11 }}>
          <span className="sk-status__dot" />
          {tone}
        </span>
      </div>
    </Link>
  );
}

function friendlyError(code: string): string {
  if (code.includes("not_reschedulable")) return "That post can’t be moved (already published).";
  return "Couldn’t reschedule.";
}
