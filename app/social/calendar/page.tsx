import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/shell/icon";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { isMissingRelation } from "@/lib/contacts/fail-soft";
import { withTenant } from "@/lib/db/with-tenant";
import Link from "next/link";
import { CalendarClient, type CalendarPost } from "./_components/calendar-client";
import { StudioKpis, StudioTabs } from "../posts/_components/studio-kit";
import "../posts/social-compose.css";

/**
 * Content calendar (Module 10) — monthly/weekly grid of scheduled + published
 * `SocialPost` rows, with drag-to-reschedule. Rebuilt to the delivered design
 * kit (.sk-page / .sk-cal-*).
 *
 * This stays a SERVER component: it runs the DB query + computes the month math
 * (the calendar window) and hands a flat, serializable `posts` array to the
 * `<CalendarClient>` island, which renders the grid (month / week) + the toolbar
 * and adds the interactivity (HTML5 drag-and-drop → `rescheduleSocialPost`,
 * week/month toggle). Lifting only the grid render to the client keeps handlers
 * out of the RSC.
 *
 * URL params:
 *   ?ym=YYYY-MM      — month to display (defaults to current).
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

export default async function ContentCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string; view?: string; __empty?: string }>;
}) {
  const { orgId } = await getOrgContext();
  const sp = await searchParams;
  const { year, month } = parseMonth(sp.ym);
  const view: "month" | "week" = sp.view === "week" ? "week" : "month";
  const forceEmpty = sp.__empty === "1";

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
        mediaUrl: true,
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
        mediaUrl: p.mediaUrl,
        when: when.toISOString(),
        movable: p.status === "draft" || p.status === "scheduled",
      };
    })
    .filter((p): p is CalendarPost => p !== null);

  const totalThisMonth = posts.filter((p) => (p.postedAt ?? p.scheduledFor)?.getMonth() === month).length;
  const scheduledCount = posts.filter((p) => p.status === "scheduled").length;
  const publishedCount = posts.filter(
    (p) => p.status === "published" || p.status === "posted",
  ).length;

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Engagement", "Social Studio", "Calendar"]}>
      <div className="sk-page">
        <PageHeader
          kicker={`${totalThisMonth} posts this month`}
          title="Content calendar"
          description="See every scheduled and published post across your channels — drag to reschedule."
          actions={
            <>
              <Link href="/social/posts?tab=create" className="btn btn--pri">
                <Icon name="plus" size={13} />
                New post
              </Link>
              <Link href="/social/posts/bulk" className="btn">
                <Icon name="cal" size={13} />
                Bulk schedule
              </Link>
            </>
          }
        />

        <StudioKpis
          items={[
            {
              label: "Scheduled",
              value: String(scheduledCount),
              helper: "Queued to publish",
              icon: "cal",
              tone: "pri",
              art: "/assets/repulabs/post-creator/cal-calendar.svg",
            },
            {
              label: "Published this window",
              value: String(publishedCount),
              helper: "Across all channels",
              icon: "send",
              tone: "green",
              art: "/assets/repulabs/post-creator/cal-post.svg",
            },
            {
              label: "Posts per week",
              value: (totalThisMonth / 4).toFixed(1),
              helper: "Avg this month",
              icon: "trend",
              tone: "orange",
              art: "/assets/repulabs/post-creator/cal-postperweek.svg",
            },
          ]}
        />

        <StudioTabs active="calendar" />

        <CalendarClient
          posts={forceEmpty ? [] : calendarPosts}
          year={year}
          month={month}
          view={view}
        />
      </div>
    </AppShellServer>
  );
}
