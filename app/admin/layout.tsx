import { AdminShell } from "@/components/admin/admin-shell";
import { getAdminSession } from "@/lib/admin/session";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const headerList = await headers();
  const pathname = headerList.get("x-pathname") ?? "";

  // The /admin/login page must not be wrapped by the auth-gated layout
  if (pathname.startsWith("/admin/login")) {
    return <>{children}</>;
  }

  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  return (
    <AdminShell
      pathname={pathname}
      session={{
        email: session.email,
        role: session.role,
        imp: session.imp
          ? { orgId: session.imp.orgId, reason: session.imp.reason }
          : undefined,
      }}
    >
      {children}
    </AdminShell>
  );
}
