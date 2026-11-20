"use client";

import { AskAi } from "@/components/ask-ai";
import { ThemeProvider } from "@/components/theme-provider";
import { ToastProvider } from "@/components/toast";
import { SessionProvider, useSession } from "next-auth/react";

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
 * Only renders the floating chat launcher when the user is signed in.
 * Otherwise the landing page + login page would show a chat bubble that
 * 401s immediately. useSession runs purely on the client.
 */
function FloatingAskAi() {
  const { status } = useSession();
  if (status !== "authenticated") return null;
  return <AskAi />;
}
