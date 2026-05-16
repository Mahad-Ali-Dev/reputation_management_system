import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { Avatar } from "@/components/shell/avatar";
import { Icon } from "@/components/shell/icon";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import Link from "next/link";

/**
 * Support inbox — Comments tab, repulabs v2 design.
 *
 * Real data: SocialComment list, status counts grouped.
 */

export const dynamic = "force-dynamic";

const TABS = [
  { key: "comments", label: "Comments", href: "/support/comments" },
  { key: "dms", label: "DMs", href: "/support/dms" },
  { key: "live-chat", label: "Live chat", href: "/support/live-chat" },
] as const;

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "needs_reply", label: "Needs reply" },
  { key: "replied", label: "Replied" },
  { key: "live", label: "Live" },
  { key: "hidden", label: "Hidden" },
  { key: "starred", label: "Starred" },
] as const;

export default async function CommentsInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { orgId } = await getOrgContext();

  const { status: statusFilter } = await searchParams;
  const activeFilter = (statusFilter ?? "all") as
    | "all"
    | "needs_reply"
    | "replied"
    | "live"
    | "hidden"
    | "starred";

  const where = activeFilter !== "all" ? { status: activeFilter } : {};

  const [comments, statusCounts] = await withTenant(orgId, async (tx) =>
    Promise.all([
      tx.socialComment.findMany({
        where,
        orderBy: { postedAt: "desc" },
        take: 100,
      }),
      tx.socialComment.groupBy({ by: ["status"], _count: true }),
    ]),
  );

  const counts: Record<string, number> = {};
  for (const c of statusCounts) counts[c.status] = c._count;
  const total = comments.length;
  const needs = counts.needs_reply ?? 0;

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Engagement", "Support Inbox"]}>
      <PageHeader
        kicker={`${total} threads · ${needs} need reply`}
        title="Support inbox"
        description="Every public comment and DM across your connected social pages — in one queue."
        actions={
          <button type="button" className="btn btn--pri">
            <Icon name="sparkle" size={12} />
            Draft pending
          </button>
        }
      />

      {/* Sub-tabs */}
      <div className="tabs" style={{ marginBottom: 14 }}>
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            className={`tabs__t${t.key === "comments" ? " is-active" : ""}`}
            style={{ textDecoration: "none" }}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* Filter chips */}
      <div className="row" style={{ marginBottom: 14, gap: 6, flexWrap: "wrap" }}>
        {STATUS_FILTERS.map((f) => {
          const active = activeFilter === f.key;
          const count = counts[f.key] ?? 0;
          return (
            <Link
              key={f.key}
              href={f.key === "all" ? "/support/comments" : `/support/comments?status=${f.key}`}
              className={`chip${active ? " chip--ink" : " chip--out"}`}
              style={{ textDecoration: "none" }}
            >
              {f.label}
              {count > 0 && (
                <span className="mono" style={{ marginLeft: 5, opacity: 0.7 }}>
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      <div className="ds-card">
        <div className="ds-card__head">
          <h3 className="ds-card__title">Comments · {comments.length}</h3>
          <span className="mono dim" style={{ fontSize: 10.5 }}>
            {activeFilter === "all" ? "ALL" : activeFilter.toUpperCase()}
          </span>
        </div>
        {comments.length === 0 ? (
          <div className="ds-card__body dim" style={{ textAlign: "center", padding: 48 }}>
            <Icon name="chat" size={28} style={{ color: "var(--pri)" }} />
            <h3 style={{ fontSize: 15, fontWeight: 600, marginTop: 12, color: "var(--ink)" }}>
              {activeFilter === "all"
                ? "No public comments yet"
                : `No ${activeFilter.replace("_", " ")} comments`}
            </h3>
            <p style={{ fontSize: 13, marginTop: 6 }}>
              Connect your Facebook and Instagram pages to start syncing comments here.
            </p>
            <Link href="/connections" className="btn btn--pri" style={{ marginTop: 14 }}>
              <Icon name="plug" size={12} />
              Connect social pages
            </Link>
          </div>
        ) : (
          <div style={{ padding: 4 }}>
            {comments.map((c, i) => {
              const tone = ((i % 7) + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
              return (
                <div
                  key={c.id}
                  className="row"
                  style={{
                    padding: 14,
                    borderTop: i ? "1px solid var(--line)" : "none",
                    alignItems: "flex-start",
                    gap: 12,
                  }}
                >
                  <Avatar name={c.authorName ?? "User"} size={32} tone={tone} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row" style={{ marginBottom: 4, gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>
                        {c.authorName ?? "Anonymous"}
                      </span>
                      <span className="dim mono" style={{ fontSize: 10.5 }}>
                        {c.platform} · {c.postedAt ? relativeTime(c.postedAt) : "—"}
                      </span>
                      <span
                        className={`chip ${statusChip(c.status)}`}
                        style={{ marginLeft: "auto" }}
                      >
                        {c.status.replace("_", " ")}
                      </span>
                    </div>
                    {c.body && (
                      <p
                        style={{
                          margin: 0,
                          fontSize: 12.5,
                          color: "var(--ink-2)",
                          lineHeight: 1.55,
                        }}
                      >
                        {c.body}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShellServer>
  );
}

function statusChip(status: string): string {
  switch (status) {
    case "needs_reply":
      return "chip--bad";
    case "replied":
      return "chip--ok";
    case "live":
      return "chip--info";
    case "hidden":
      return "chip--warn";
    case "starred":
      return "chip--pri";
    default:
      return "chip--out";
  }
}

function relativeTime(d: Date): string {
  const ms = Date.now() - d.getTime();
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}
