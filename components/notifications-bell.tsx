import { getOrgContext } from "@/lib/auth/org-context";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/notifications/actions";
import { listNotificationsWithCount } from "@/lib/notifications/queries";
import {
  Bell,
  Check,
  CheckCheck,
  FileText,
  Flag,
  type LucideIcon,
  MessageCircle,
  Reply,
  Settings2,
  Star,
} from "lucide-react";
import Link from "next/link";

/**
 * Notification bell + dropdown for the app top bar.
 *
 * Uses the `details` HTML element for the popover so we don't need client state.
 * The card shows the 20 most recent notifications: a header with the unread
 * count and "Mark all read", rows with a tinted type icon, title, one-line
 * body, time and an unread dot (hover reveals a mark-as-read tick), and a
 * footer link to notification settings. Styles: `.nb-*` in app/glass-chrome.css.
 */

/** Notification.type → icon + tint (see prisma Notification.type). */
const TYPE_META: Record<string, { icon: LucideIcon; tone: string }> = {
  new_review: { icon: Star, tone: "gold" },
  new_comment: { icon: MessageCircle, tone: "pink" },
  reply_needed: { icon: Reply, tone: "violet" },
  dispute_update: { icon: Flag, tone: "red" },
  digest_ready: { icon: FileText, tone: "blue" },
  system: { icon: Settings2, tone: "grey" },
};

export async function NotificationsBell() {
  const { orgId, userId } = await getOrgContext();
  // listNotificationsWithCount runs both queries inside one tenant transaction
  // — one Postgres round-trip with SET LOCAL ROLE applied once.
  const { notifs, count } = await listNotificationsWithCount(orgId, userId, 20);

  return (
    <details className="nb">
      <summary className="nb__btn" aria-label={`Notifications, ${count} unread`}>
        <Bell size={19} strokeWidth={1.8} aria-hidden="true" />
        {count > 0 && <span className="nb__count">{count > 99 ? "99+" : count}</span>}
      </summary>

      <div className="nb__card">
        <div className="nb__head">
          <div className="nb__title">
            Notifications
            {count > 0 && <span className="nb__pill">{count} new</span>}
          </div>
          {count > 0 && (
            <form action={markAllNotificationsRead}>
              <button type="submit" className="nb__markall">
                <CheckCheck size={14} strokeWidth={2} aria-hidden="true" />
                Mark all read
              </button>
            </form>
          )}
        </div>

        <ul className="nb__list">
          {notifs.length === 0 ? (
            <li className="nb__empty">
              <span className="nb__empty-icon">
                <Bell size={20} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <p className="nb__empty-title">You're all caught up</p>
              <p className="nb__empty-sub">New reviews, replies and updates will show up here.</p>
            </li>
          ) : (
            notifs.map((n) => (
              <li key={n.id}>
                <NotificationItem
                  id={n.id}
                  type={n.type}
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

        <Link href="/settings/notifications" className="nb__foot">
          Notification settings
        </Link>
      </div>
    </details>
  );
}

function NotificationItem({
  id,
  type,
  title,
  body,
  href,
  createdAt,
  unread,
}: {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  createdAt: Date;
  unread: boolean;
}) {
  const meta = TYPE_META[type] ?? TYPE_META.system;
  const TypeIcon = meta?.icon ?? Settings2;

  const content = (
    <>
      <span className={`nb__icon nb__icon--${meta?.tone ?? "grey"}`} aria-hidden="true">
        <TypeIcon size={16} strokeWidth={1.9} />
      </span>
      <span className="nb__text">
        <span className="nb__row-title">{title}</span>
        {body && <span className="nb__row-body">{body}</span>}
        <span className="nb__time">{timeAgo(createdAt)}</span>
      </span>
    </>
  );

  return (
    <div className={`nb__item${unread ? " is-unread" : ""}`}>
      {href ? (
        <Link href={href} className="nb__main">
          {content}
        </Link>
      ) : (
        <div className="nb__main">{content}</div>
      )}
      {unread && (
        <form action={markNotificationRead} className="nb__read">
          <input type="hidden" name="id" value={id} />
          <span className="nb__dot" aria-hidden="true" />
          <button type="submit" className="nb__tick" aria-label="Mark as read" title="Mark as read">
            <Check size={13} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </form>
      )}
    </div>
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
