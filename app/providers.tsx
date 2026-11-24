"use client";

import { AskAi } from "@/components/ask-ai";
import { ThemeProvider } from "@/components/theme-provider";
import { ToastProvider } from "@/components/toast";
import { SessionProvider, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        <ToastProvider>
          {children}
          <FloatingAskAi />
        </ToastProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}

/**
 * Public pages (marketing site, docs, legal, auth, customer-facing review and
 * survey links, embeds, design previews). The Ask AI launcher is an in-app
 * tool, so it never shows on these, even for a signed-in visitor.
 */
const PUBLIC_PREFIXES = [
  "/about",
  "/accept-invite",
  "/activate",
  "/contact",
  "/customers",
  "/design-preview",
  "/docs",
  "/faqs",
  "/glass",
  "/kitchen-sink",
  "/legal",
  "/login",
  "/not-activated",
  "/press",
  "/pricing",
  "/r/",
  "/restricted",
  "/s/",
  "/signup",
  "/tour",
  "/u",
  "/widget",
];

function isPublicPath(pathname: string | null): boolean {
  if (!pathname || pathname === "/") return true;
  return PUBLIC_PREFIXES.some((p) =>
    p.endsWith("/")
      ? pathname.startsWith(p)
      : pathname === p || pathname.startsWith(`${p}/`) || pathname.startsWith(`${p}-`),
  );
}

/**
 * Renders the floating chat launcher only for a signed-in user inside the
 * app. Signed out, it would 401 immediately; on public pages it doesn't
 * belong. useSession and usePathname run purely on the client.
 */
function FloatingAskAi() {
  const { status } = useSession();
  const pathname = usePathname();
  if (status !== "authenticated" || isPublicPath(pathname)) return null;
  return <AskAi />;
}
