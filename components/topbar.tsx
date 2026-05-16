import { Icon } from "@/components/shell/icon";
import { signOut } from "@/lib/auth/config";
import { NotificationsBell } from "./notifications-bell";

/**
 * Right side of the AppShell topbar — repulabs v2 style.
 *
 * Renders help, notifications, and an "Ask AI" pill button.
 * Sign-out is exposed via the user profile in the sidebar; we keep a tiny
 * ghost button here as a fallback while session management UI is built out.
 *
 * Slot into <AppShell topBar={<TopBar />}>.
 */
export function TopBar({
  title,
  subtitle: _subtitle,
}: {
  title?: string;
  subtitle?: string;
} = {}) {
  // title kept in API for backward-compat with existing callers; the new shell
  // renders the page title via PageHeader + crumbs in the AppShell topbar.
  // We surface a small mobile-only label using `title` so existing pages still
  // show something useful before they're updated to pass crumbs.
  return (
    <>
      {title && (
        <div className="row" style={{ gap: 6, fontSize: 13, fontWeight: 500 }}>
          <span className="dim" style={{ fontSize: 11 }}>
            ›
          </span>
          {title}
        </div>
      )}

      <button type="button" className="tb__iconbtn" aria-label="Help">
        <Icon name="help" size={15} />
      </button>

      <div className="tb__iconbtn" aria-label="Notifications">
        <NotificationsBell />
      </div>

      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
        style={{ marginLeft: 4 }}
      >
        <button type="submit" className="btn btn--xs btn--ghost" aria-label="Sign out">
          Sign out
        </button>
      </form>
    </>
  );
}
