import Link from "next/link";
import { getOrgContext } from "@/lib/auth/org-context";
import { listNotificationsWithCount } from "@/lib/notifications/queries";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/notifications/actions";

/**
 * Notification bell + dropdown for the dashboard header.
 *
 * Uses the `details` HTML element for the popover so we don't need client state.
 * The dropdown shows the 20 most recent notifications, with unread items
 * highlighted. "Mark all read" submits a form; per-item click marks just that one.
 */
export async function NotificationsBell() {
  const { orgId, userId } = await getOrgContext();
  // listNotificationsWithCount runs both queries inside one tenant transaction
  // — one Postgres round-trip with SET LOCAL ROLE applied once.
  const { notifs, count } = await listNotificationsWithCount(orgId, userId, 20);

  return (
    <details className="relative">
      <summary
        className="relative cursor-pointer list-none rounded-full p-2 hover:bg-slate-100"
        aria-label={`Notifications, ${count} unread`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {count > 0 && (
          <span className="absolute -right-0 -top-0 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </summary>

      <div className="absolute right-0 z-40 mt-2 w-96 rounded-lg border bg-white shadow-lg">
        <div className="flex items-center justify-between border-b px-4 py-2">
          <h3 className="text-sm font-semibold">Notifications</h3>
          {count > 0 && (
            <form action={markAllNotificationsRead}>
              <button type="submit" className="text-xs text-primary hover:underline">
                Mark all read
              </button>
            </form>
          )}
        </div>

        <ul className="max-h-96 overflow-y-auto">
          {notifs.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-muted-foreground">
              No notifications yet
            </li>
          ) : (
            notifs.map((n) => (
              <li
                key={n.id}
                className={`border-b last:border-b-0 ${n.readAt ? "" : "bg-indigo-50/40"}`}
              >
                <NotificationItem
                  id={n.id}
                  title={n.title}
                  body={n.body}
                  href={n.href}
                  createdAt={n.createdAt}
                  unread={!n.readAt}
                />
              </li>
            ))
          )}
        </ul>
      </div>
    </details>
  );
}

function NotificationItem({
  id,
  title,
  body,
  href,
  createdAt,
  unread,
}: {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
  createdAt: Date;
  unread: boolean;
}) {
  const content = (
    <div className="flex w-full items-start gap-3 px-4 py-3 hover:bg-slate-50">
      {unread && (
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-indigo-500" aria-hidden />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 truncate">{title}</p>
        {body && <p className="text-xs text-slate-600 line-clamp-2 mt-0.5">{body}</p>}
        <p className="text-[10px] text-muted-foreground mt-1">
          {timeAgo(createdAt)}
        </p>
      </div>
      {unread && (
        <form action={markNotificationRead}>
          <input type="hidden" name="id" value={id} />
          <button
            type="submit"
            className="text-[10px] text-muted-foreground hover:text-primary"
            aria-label="Mark as read"
          >
            ✓
          </button>
        </form>
      )}
    </div>
  );

  return href ? (
    <Link href={href} className="block">{content}</Link>
  ) : (
    <div>{content}</div>
  );
}

function timeAgo(date: Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(date).toLocaleDateString();
}
