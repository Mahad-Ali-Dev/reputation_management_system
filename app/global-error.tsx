"use client";

import { ErrorScreen } from "@/components/error-screen";
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * Last-resort boundary: catches errors thrown by the ROOT layout itself. It
 * replaces the root layout entirely, so it must render its own <html>/<body>
 * and cannot rely on the global stylesheets — ErrorScreen is fully self-styled.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <ErrorScreen
          illustration="/assets/repulabs/illustrations/error.svg"
          title="Something went wrong."
          message="A critical error interrupted the app and our team has been notified. Please try again in a moment."
          onRetry={reset}
          primary={{ label: "Reload Repulabs", href: "/" }}
          digest={error.digest}
        />
      </body>
    </html>
  );
}
