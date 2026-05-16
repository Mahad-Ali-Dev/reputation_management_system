import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { Icon, type IconName } from "@/components/shell/icon";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import Link from "next/link";

/**
 * Content calendar — repulabs v2 design (screen 11).
 *
 * Monthly grid showing scheduled + published SocialPost rows. Each post
 * appears as a chip on the date it's scheduled / was published. Clicking
 * a chip jumps to the post editor in /social/posts.
 *
 * Real data: SocialPost.scheduledFor and SocialPost.postedAt. Empty
 * weeks render as grey.
 *
 * URL params:
 *   ?ym=YYYY-MM   — pick month to display (defaults to current).
 */

export const dynamic = "force-dynamic";

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

function parseMonth(ym?: string): { year: number; month: number } {
  if (ym && /^\d{4}-\d{2}$/.test(ym)) {
    const [y, m] = ym.split("-");
    const year = Number(y);
    const month = Number(m) - 1;
    if (!Number.isNaN(year) && !Number.isNaN(month) && month >= 0 && month <= 11) {
      return { year, month };
    }
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function ymString(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function shiftMonth(year: number, month: number, delta: number) {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

/**
 * Build a 6-week grid starting on Monday, covering the given month plus
 * leading/trailing days of adjacent months.
 */
function buildGrid(year: number, month: number): Date[][] {
  const firstOfMonth = new Date(year, month, 1);
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7; // Monday = 0
  const gridStart = new Date(year, month, 1 - firstWeekday);
  const weeks: Date[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(gridStart);
      day.setDate(gridStart.getDate() + w * 7 + d);
      week.push(day);
    }
    weeks.push(week);
  }
  return weeks;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default async function ContentCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string }>;
}) {
  const { orgId } = await getOrgContext();
  const sp = await searchParams;
  const { year, month } = parseMonth(sp.ym);

  // Pull the whole calendar window in one query.
  const gridStart = new Date(year, month, 1);
  gridStart.setDate(1 - ((gridStart.getDay() + 6) % 7));
  const gridEnd = new Date(gridStart);
  gridEnd.setDate(gridStart.getDate() + 42); // 6 weeks

  const posts = await withTenant(orgId, async (tx) =>
    tx.socialPost.findMany({
      where: {
        OR: [
          { scheduledFor: { gte: gridStart, lt: gridEnd } },
          { postedAt: { gte: gridStart, lt: gridEnd } },
        ],
      },
      orderBy: [{ scheduledFor: "asc" }, { postedAt: "asc" }],
      select: {
        id: true,
        caption: true,
        platforms: true,
        status: true,
        scheduledFor: true,
        postedAt: true,
      },
    }),
  );

  // Bucket posts by day-of-month string for fast lookup.
  const byDay = new Map<string, typeof posts>();
  const keyOf = (d: Date) => d.toISOString().slice(0, 10);
  for (const p of posts) {
    const when = p.postedAt ?? p.scheduledFor;
    if (!when) continue;
    const k = keyOf(when);
    const list = byDay.get(k) ?? [];
    list.push(p);
    byDay.set(k, list);
  }

  const grid = buildGrid(year, month);
  const today = new Date();
  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, +1);
  const totalThisMonth = posts.filter(
    (p) => (p.postedAt ?? p.scheduledFor)?.getMonth() === month,
  ).length;
  const scheduledCount = posts.filter((p) => p.status === "scheduled").length;
  const publishedCount = posts.filter((p) => p.status === "published").length;

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Engagement", "Social Studio", "Calendar"]}>
      <PageHeader
        kicker={`${totalThisMonth} posts this month`}
        title="Content calendar"
        description="See every scheduled and published post across all your social channels in one grid."
        actions={
          <>
            <Link href="/social/posts" className="btn">
              <Icon name="grid" size={12} />
              List view
            </Link>
            <Link href="/social/posts" className="btn btn--pri">
              <Icon name="plus" size={12} />
              New post
            </Link>
          </>
        }
      />

      {/* KPI strip */}
      <div className="grid-3" style={{ gap: 12, marginBottom: 18 }}>
        <Kpi l="Scheduled" v={String(scheduledCount)} d="Queued to publish" />
        <Kpi l="Published this window" v={String(publishedCount)} d="Across all channels" />
        <Kpi l="Posts per week" v={(totalThisMonth / 4).toFixed(1)} d="Avg this month" />
      </div>

      {/* Month nav */}
      <div className="ds-card" style={{ marginBottom: 14 }}>
        <div className="ds-card__head" style={{ paddingTop: 14, paddingBottom: 14 }}>
          <div className="row" style={{ gap: 8 }}>
            <Link
              href={`/social/calendar?ym=${ymString(prev.year, prev.month)}`}
              className="btn btn--sm"
              aria-label="Previous month"
            >
              <Icon name="chevL" size={12} />
            </Link>
            <Link
              href="/social/calendar"
              className="btn btn--sm"
              style={{ minWidth: 64, justifyContent: "center" }}
            >
              Today
            </Link>
            <Link
              href={`/social/calendar?ym=${ymString(next.year, next.month)}`}
              className="btn btn--sm"
              aria-label="Next month"
            >
              <Icon name="chevR" size={12} />
            </Link>
            <h3
              className="ds-card__title"
              style={{ marginLeft: 12, fontSize: 18, letterSpacing: "-0.02em" }}
            >
              {monthLabel(year, month)}
            </h3>
          </div>
          <div className="row" style={{ gap: 12 }}>
            <Legend c="var(--ok)" label="Published" />
            <Legend c="var(--warn)" label="Scheduled" />
            <Legend c="var(--rl-muted-2)" label="Draft" />
          </div>
        </div>

        {/* Day-of-week header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            borderTop: "1px solid var(--line)",
            background: "var(--surface-2)",
          }}
        >
          {DAY_NAMES.map((d) => (
            <div
              key={d}
              className="lbl-mono"
              style={{
                padding: "10px 14px",
                margin: 0,
                fontSize: 11,
                color: "var(--rl-muted)",
                borderRight: "1px solid var(--line)",
              }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
          {grid.map((week, wi) =>
            week.map((day, di) => {
              const inMonth = day.getMonth() === month;
              const isToday = isSameDay(day, today);
              const dayPosts = byDay.get(keyOf(day)) ?? [];
              return (
                <div
                  key={keyOf(day)}
                  style={{
                    minHeight: 110,
                    padding: 8,
                    borderRight: di < 6 ? "1px solid var(--line)" : "none",
                    borderTop: wi > 0 ? "1px solid var(--line)" : "none",
                    background: inMonth ? "var(--surface)" : "var(--surface-2)",
                    opacity: inMonth ? 1 : 0.55,
                    position: "relative",
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
                    {dayPosts.slice(0, 3).map((p) => {
                      const platform = (p.platforms ?? [])[0]?.toLowerCase() ?? "";
                      const icon = PLATFORM_ICON[platform] ?? "share";
                      const platformColor = PLATFORM_COLOR[platform] ?? "var(--rl-muted-2)";
                      const tone = STATUS_TONE[p.status] ?? "var(--rl-muted-2)";
                      return (
                        <Link
                          key={p.id}
                          href={`/social/posts?post=${p.id}`}
                          className="row"
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
                          }}
                        >
                          <span
                            aria-hidden="true"
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
                          <Icon
                            name={icon}
                            size={10}
                            style={{ color: platformColor, marginLeft: 4 }}
                          />
                          <span
                            style={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              flex: 1,
                            }}
                          >
                            {p.caption?.slice(0, 28) ?? `(${p.status})`}
                            {p.caption && p.caption.length > 28 && "…"}
                          </span>
                        </Link>
                      );
                    })}
                    {dayPosts.length > 3 && (
                      <span className="dim" style={{ fontSize: 10, paddingLeft: 6 }}>
                        +{dayPosts.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              );
            }),
          )}
        </div>
      </div>

      {posts.length === 0 && (
        <div
          className="ds-card"
          style={{
            padding: 32,
            textAlign: "center",
            color: "var(--rl-muted)",
            fontSize: 13,
          }}
        >
          <Icon name="cal" size={28} style={{ color: "var(--pri)" }} />
          <p style={{ marginTop: 8, marginBottom: 14 }}>
            No posts scheduled or published in this window.
          </p>
          <Link href="/social/posts" className="btn btn--pri">
            <Icon name="plus" size={12} />
            Create your first post
          </Link>
        </div>
      )}
    </AppShellServer>
  );
}

function Kpi({ l, v, d }: { l: string; v: string; d: string }) {
  return (
    <div className="ds-card">
      <div className="stat">
        <div className="stat__label">{l}</div>
        <div className="stat__value" style={{ fontSize: 30 }}>
          {v}
        </div>
        <div className="stat__delta">{d}</div>
      </div>
    </div>
  );
}

function Legend({ c, label }: { c: string; label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11,
        color: "var(--rl-muted)",
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 2, background: c }} />
      {label}
    </span>
  );
}
