import { Avatar } from "@/components/shell/avatar";
import { Icon } from "@/components/shell/icon";
import { auth, signOut } from "@/lib/auth/config";
import Link from "next/link";
import { NotificationsBell } from "./notifications-bell";

/**
 * Right side of the AppShell topbar — repulabs v3.
 *
 * Help · notifications · user identity (avatar + name + role) · sign-out.
 * `title` kept optional for backward-compat with older callers.
 */
export async function TopBar({ title }: { title?: string } = {}) {
  const session = await auth();
  const name =
    session?.user?.name ?? session?.user?.email?.split("@")[0] ?? "Account";
  const role = (session as { role?: string } | null)?.role ?? "Member";
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);

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
        <Icon name="help" size={16} />
      </button>

      <div className="tb__iconbtn" aria-label="Notifications">
        <NotificationsBell />
      </div>

      <Link href="/settings" className="tb__user">
        <Avatar name={name} size={32} tone={4} />
        <span className="tb__user-meta">
          <span className="tb__user-name">{name}</span>
          <span className="tb__user-role">{roleLabel}</span>
        </span>
        <Icon name="chevD" size={11} style={{ color: "var(--rl-muted)" }} />
      </Link>

      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
      >
        <button type="submit" className="tb__iconbtn" aria-label="Sign out">
          <Icon name="ext" size={15} />
        </button>
      </form>
    </>
  );
}
