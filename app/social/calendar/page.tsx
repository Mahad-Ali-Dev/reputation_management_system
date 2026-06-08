import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/shell/icon";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { isMissingRelation } from "@/lib/contacts/fail-soft";
import { withTenant } from "@/lib/db/with-tenant";
import Link from "next/link";
import { CalendarClient, type CalendarPost } from "./_components/calendar-client";
import { HubTabs } from "../posts/_components/hub-tabs";

/**
 * Content calendar (Module 10) — monthly/weekly grid of scheduled + published
 * `SocialPost` rows, with drag-to-reschedule.
 *
 * This stays a SERVER component: it runs the DB query + computes the month math
 * (the calendar window) and hands a flat, serializable `posts` array to the
 * `<CalendarClient>` island, which renders the grid and adds the interactivity
 * (HTML5 drag-and-drop → `rescheduleSocialPost`, week/month toggle). Lifting only
 * the grid render to the client keeps handlers out of the RSC.
 *
 * URL params:
 *   ?ym=YYYY-MM     — month to display (defaults to current).
 *   ?view=month|week — grid mode (defaults to month).
 */

export const dynamic = "force-dynamic";

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
  return new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function ymString(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function shiftMonth(year: number, month: number, delta: number) {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

export default async function ContentCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string; view?: string }>;
}) {
  const { orgId } = await getOrgContext();
  const sp = await searchParams;
  const { year, month } = parseMonth(sp.ym);
  const view: "month" | "week" = sp.view === "week" ? "week" : "month";

  // Window: a week view still loads the surrounding month so navigation + counts
  // stay consistent; the client only renders the relevant rows.
  const gridStart = new Date(year, month, 1);
  gridStart.setDate(1 - ((gridStart.getDay() + 6) % 7));
  const gridEnd = new Date(gridStart);
  gridEnd.setDate(gridStart.getDate() + 42);

  // FAIL-SOFT: degrade to an empty calendar when the `social_posts` relation /
  // a selected column isn't migrated yet (Postgres 42P01 / 42703 → the empty
  // state below renders) rather than 500-ing the page; re-throw real errors.
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
  ).catch((err: unknown) => {
    if (isMissingRelation(err)) return [];
    throw err;
  });

  // Flatten to the serializable shape the client island consumes.
  const calendarPosts: CalendarPost[] = posts
    .map((p): CalendarPost | null => {
      const when = p.postedAt ?? p.scheduledFor;
      if (!when) return null;
      return {
        id: p.id,
        caption: p.caption,
        platforms: p.platforms ?? [],
        status: p.status,
        when: when.toISOString(),
        movable: p.status === "draft" || p.status === "scheduled",
      };
    })
    .filter((p): p is CalendarPost => p !== null);

  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, +1);
  const totalThisMonth = posts.filter((p) => (p.postedAt ?? p.scheduledFor)?.getMonth() === month).length;
  const scheduledCount = posts.filter((p) => p.status === "scheduled").length;
  const publishedCount = posts.filter((p) => p.status === "published").length;

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Engagement", "Social Studio", "Calendar"]}>
      <PageHeader
        kicker={`${totalThisMonth} posts this month`}
        title="Content calendar"
        description="See every scheduled and published post across your channels — drag to reschedule."
        actions={
          <Link href="/social/posts?tab=create" className="btn btn--pri">
            <Icon name="plus" size={12} />
            New post
          </Link>
        }
      />

      <div className="grid-3" style={{ gap: 12, marginBottom: 18 }}>
        <Kpi l="Scheduled" v={String(scheduledCount)} d="Queued to publish" />
        <Kpi l="Published this window" v={String(publishedCount)} d="Across all channels" />
        <Kpi l="Posts per week" v={(totalThisMonth / 4).toFixed(1)} d="Avg this month" />
      </div>

      <HubTabs active="calendar" />

      {/* Month nav */}
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
        <div className="row" style={{ gap: 8 }}>
          <Link
            href={`/social/calendar?ym=${ymString(prev.year, prev.month)}&view=${view}`}
            className="btn btn--sm"
            aria-label="Previous month"
          >
            <Icon name="chevL" size={12} />
          </Link>
          <Link
            href={`/social/calendar?view=${view}`}
            className="btn btn--sm"
            style={{ minWidth: 64, justifyContent: "center" }}
          >
            Today
          </Link>
          <Link
            href={`/social/calendar?ym=${ymString(next.year, next.month)}&view=${view}`}
            className="btn btn--sm"
            aria-label="Next month"
          >
            <Icon name="chevR" size={12} />
          </Link>
          <h3 className="ds-card__title" style={{ marginLeft: 8, fontSize: 18, letterSpacing: "-0.02em" }}>
            {monthLabel(year, month)}
          </h3>
        </div>
        <div className="row" style={{ gap: 12 }}>
          <Legend c="var(--ok)" label="Published" />
          <Legend c="var(--warn)" label="Scheduled" />
          <Legend c="var(--rl-muted-2)" label="Draft" />
        </div>
      </div>

      <CalendarClient posts={calendarPosts} year={year} month={month} view={view} />

      {posts.length === 0 && (
        <div
          className="ds-card"
          style={{ padding: 32, textAlign: "center", color: "var(--rl-muted)", fontSize: 13, marginTop: 14 }}
        >
          <Icon name="cal" size={28} style={{ color: "var(--pri)" }} />
          <p style={{ marginTop: 8, marginBottom: 14 }}>No posts scheduled or published in this window.</p>
          <Link href="/social/posts?tab=create" className="btn btn--pri">
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
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--rl-muted)" }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: c }} />
      {label}
    </span>
  );
}
