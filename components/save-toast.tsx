"use client";

import { useToast } from "@/components/toast";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Fires a themed toast from a `?<param>=1|error` query flag left by a
 * server-action redirect (the same pattern `/establishments/[id]/settings`
 * already uses for its static banner — see that page's `saveAction`), then
 * strips the param from the URL so a refresh doesn't re-fire it.
 *
 * Redirect-based rather than an optimistic client-side toast on submit: the
 * flag only lands after the server action actually ran, so it can't claim
 * success for a save that validation rejected.
 *
 * Renders nothing — drop it anywhere in a page that redirects with `?saved=`.
 */
export function SaveToast({
  param = "saved",
  successMessage = "Changes saved.",
  errorMessage = "Couldn't save, check the fields and try again.",
}: {
  param?: string;
  successMessage?: string;
  errorMessage?: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fired = useRef(false);

  // toast/router/pathname are re-created every render (ToastProvider has no
  // useMemo); the `fired` ref guard makes re-running on those a harmless
  // no-op, and listing them would just churn the effect on every unrelated
  // toast fired elsewhere in the app.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see comment above
  useEffect(() => {
    if (fired.current) return;
    const value = searchParams?.get(param);
    if (!value) return;
    fired.current = true;

    if (value === "error") toast.error(errorMessage);
    else toast.success(successMessage);

    const next = new URLSearchParams(searchParams?.toString() ?? "");
    next.delete(param);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [searchParams, param]);

  return null;
}
