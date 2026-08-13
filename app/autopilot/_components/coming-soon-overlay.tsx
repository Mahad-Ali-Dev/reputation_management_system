import type { ReactNode } from "react";
import "./coming-soon-overlay.css";

/**
 * Blurs already-built content in place and shows a "Coming soon" message on
 * top of it, instead of hiding the section (which reads as broken/blank).
 *
 * Distinct from components/coming-soon.tsx's `ComingSoonPage` (a full-page
 * lock for a whole route) — this is for a section within a page that already
 * has working, wired-up content that's just being held back a release. The
 * blurred content stays mounted (so removing the lock later is deleting this
 * wrapper, not rebuilding anything) and non-interactive via pointer-events.
 */
export function ComingSoonOverlay({
  children,
  message,
}: {
  children: ReactNode;
  message: string;
}) {
  return (
    <div className="cs-overlay">
      <div className="cs-overlay__content" aria-hidden="true" inert>
        {children}
      </div>
      <div className="cs-overlay__veil">
        <span className="cs-overlay__badge">Coming soon</span>
        <p className="cs-overlay__message">{message}</p>
      </div>
    </div>
  );
}
