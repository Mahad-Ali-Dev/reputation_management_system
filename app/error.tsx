"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";
import "./system-states.css";

/**
 * App-wide error boundary for the route segment. Catches render/data errors in
 * pages and shows a branded recovery screen with a working "Try again" (reset).
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to Sentry + the server logs; the digest links the two.
    Sentry.captureException(error);
    console.error(error);
  }, [error]);

  return (
    <main className="sys-wrap">
      <div className="sys-card">
        {/* biome-ignore lint/a11y/useAltText: decorative illustration, aria-hidden */}
        <img
          src="/assets/repulabs/illustrations/error.svg"
          alt=""
          width={176}
          height={176}
          aria-hidden
          className="sys-illo"
        />
        <div className="sys-kicker">Error</div>
        <h1 className="sys-title">Something went wrong</h1>
        <p className="sys-sub">
          An unexpected error interrupted this page. You can try again, or head back
          to your dashboard.
        </p>
        <div className="sys-actions">
          <button type="button" onClick={reset} className="sys-btn sys-btn--pri">
            Try again
          </button>
          <Link href="/dashboard" className="sys-btn sys-btn--ghost">
            Go to dashboard
          </Link>
        </div>
        {error.digest && <div className="sys-digest">Ref: {error.digest}</div>}
      </div>
    </main>
  );
}
