"use client";

import { Icon, type IconName } from "@/components/shell/icon";
import { rescheduleSocialPost } from "@/lib/social/post-actions";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type JSX, useMemo, useState, useTransition } from "react";

/**
 * `<CalendarClient>` (Module 10) — drag-to-reschedule calendar island.
 *
 * The server page (`/social/calendar`) runs the DB query + keeps the month math;
 * it hands this island a flat, serializable `posts` array plus `year`/`month`/
 * `view`. The island renders the grid (month 6-week, or a single week) and adds:
 *   - HTML5 drag-and-drop: drop a post chip on a day → `rescheduleSocialPost`
 *     (only `draft`/`scheduled` are draggable) → optimistic move + `router.refresh()`.
 *   - a week / month view toggle.
 * Platform-colored status bars are preserved from the original server render.
 *
 * RSC-safety: all interactivity lives here; the page stays a server component.
 */

export type CalendarPost = {
  id: string;
  caption: string | null;
  platforms: string[];
  status: string;
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
  facebook: "var(--pri)",
  instagram: "#F59E0B",
  linkedin: "#0A66C2",
  twitter: "#1DA1F2",
};
const STATUS_TONE: Record<string, string> = {
  draft: "var(--rl-muted-2)",
  scheduled: "var(--warn)",
  publishing: "var(--info)",
  published: "var(--ok)",
  failed: "var(--bad)",
};

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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

  const today = new Date();
  const colCount = 7;
  const rowCount = view === "week" ? 1 : 6;

  return (
    <div>
      {/* view toggle + status line */}
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 10, gap: 12 }}>
        <div className="seg">
          <ViewBtn label="Month" active={view === "month"} href={hrefFor(year, month, "month")} />
          <ViewBtn label="Week" active={view === "week"} href={hrefFor(year, month, "week")} />
        </div>
        <div style={{ minHeight: 18, display: "flex", alignItems: "center", gap: 8 }}>
          {pending && (
            <span className="dim" style={{ fontSize: 11.5 }}>
              <Icon name="refresh" size={11} /> Saving…
            </span>
          )}
          {error && (
            <span style={{ fontSize: 11.5, color: "var(--bad)" }} role="alert">
              <Icon name="alert" size={11} /> {error}
            </span>
          )}
          <span className="dim" style={{ fontSize: 11 }}>
            <Icon name="move" size={11} /> Drag drafts & scheduled posts to reschedule
          </span>
        </div>
      </div>

      <div className="ds-card" style={{ overflow: "hidden", padding: 0 }}>
        {/* weekday header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            background: "var(--surface-2)",
            borderBottom: "1px solid var(--line)",
          }}
        >
          {DAY_NAMES.map((d) => (
            <div
              key={d}
              className="lbl-mono"
              style={{ padding: "10px 14px", margin: 0, fontSize: 11, borderRight: "1px solid var(--line)" }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
          {days.map((day, idx) => {
            const inMonth = day.getMonth() === month;
            const isToday = isSameDay(day, today);
            const k = keyOf(day);
            const dayPosts = byDay.get(k) ?? [];
            const isOver = overKey === k;
            const di = idx % colCount;
            const wi = Math.floor(idx / colCount);
            return (
              // biome-ignore lint/a11y/useKeyWithClickEvents: drop targets are pointer-only; keyboard reschedule is available via the post editor's date field
              <div
                key={k}
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
                style={{
                  minHeight: view === "week" ? 320 : 112,
                  padding: 8,
                  borderRight: di < 6 ? "1px solid var(--line)" : "none",
                  borderTop: wi > 0 ? "1px solid var(--line)" : "none",
                  background: isOver
                    ? "var(--pri-50)"
                    : inMonth || view === "week"
                      ? "var(--surface)"
                      : "var(--surface-2)",
                  opacity: inMonth || view === "week" ? 1 : 0.5,
                  outline: isOver ? "2px dashed var(--pri)" : "none",
                  outlineOffset: -2,
                  position: "relative",
                  transition: "background .12s",
                }}
              >
                <div className="row" style={{ marginBottom: 6 }}>
                  <span
                    style={{
                      fontSize: 11.5,
                      fontWeight: isToday ? 600 : 500,
                      width: 22,
                      height: 22,
                      borderRadius: 999,
                      display: "grid",
                      placeItems: "center",
                      background: isToday ? "var(--pri)" : "transparent",
                      color: isToday ? "#fff" : "var(--ink-2)",
                      fontFamily: "var(--f-mono)",
                    }}
                  >
                    {day.getDate()}
                  </span>
                  {dayPosts.length > 0 && (
                    <span className="mono dim" style={{ marginLeft: "auto", fontSize: 10 }}>
                      {dayPosts.length}
                    </span>
                  )}
                </div>
                <div className="col" style={{ gap: 4 }}>
                  {dayPosts.slice(0, view === "week" ? 12 : 3).map((p) => (
                    <PostChip
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
                  {view === "month" && dayPosts.length > 3 && (
                    <span className="dim" style={{ fontSize: 10, paddingLeft: 6 }}>
                      +{dayPosts.length - 3} more
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {/* a11y note: rowCount/colCount kept for grid semantics in week vs month */}
      <span hidden aria-hidden>
        {rowCount}x{colCount}
      </span>
    </div>
  );
}

function PostChip({
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
  const platformColor = PLATFORM_COLOR[platform] ?? "var(--rl-muted-2)";
  const tone = STATUS_TONE[post.status] ?? "var(--rl-muted-2)";

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
      className="row"
      title={post.movable ? "Drag to reschedule · click to edit" : "Click to view"}
      style={{
        gap: 5,
        padding: "4px 6px",
        borderRadius: 6,
        background: "var(--surface-2)",
        border: "1px solid var(--line)",
        fontSize: 10.5,
        textDecoration: "none",
        color: "inherit",
        overflow: "hidden",
        position: "relative",
        cursor: post.movable ? "grab" : "pointer",
        opacity: dragging ? 0.4 : 1,
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background: tone,
          borderRadius: "0 2px 2px 0",
        }}
      />
      <Icon name={icon} size={10} style={{ color: platformColor, marginLeft: 4 }} />
      <span
        style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}
      >
        {post.caption?.slice(0, 26) ?? `(${post.status})`}
        {post.caption && post.caption.length > 26 && "…"}
      </span>
    </Link>
  );
}

function ViewBtn({ label, active, href }: { label: string; active: boolean; href: string }) {
  return (
    <Link
      href={href}
      className="seg__b"
      aria-pressed={active}
      style={{
        padding: "6px 14px",
        fontSize: 12.5,
        borderRadius: "calc(var(--r) - 3px)",
        textDecoration: "none",
        background: active ? "var(--surface)" : "transparent",
        color: active ? "var(--ink)" : "var(--rl-muted)",
        fontWeight: active ? 600 : 450,
        boxShadow: active ? "var(--sh)" : "none",
      }}
    >
      {label}
    </Link>
  );
}

function hrefFor(year: number, month: number, view: "month" | "week"): string {
  const ym = `${year}-${String(month + 1).padStart(2, "0")}`;
  return `/social/calendar?ym=${ym}&view=${view}`;
}

function friendlyError(code: string): string {
  if (code.includes("not_reschedulable")) return "That post can’t be moved (already published).";
  return "Couldn’t reschedule.";
}
