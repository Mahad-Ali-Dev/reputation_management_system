import type { Metadata } from "next";
import Link from "next/link";
import "./system-states.css";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

/**
 * App-wide 404. Renders inside the root layout, so it gets full-page brand
 * styling instead of Next's default plain-text 404. Server component — no
 * client JS needed.
 */
export default function NotFound() {
  return (
    <main className="sys-wrap">
      <div className="sys-card">
        {/* biome-ignore lint/a11y/useAltText: decorative illustration, aria-hidden */}
        <img
          src="/assets/repulabs/illustrations/not-found.svg"
          alt=""
          width={176}
          height={176}
          aria-hidden
          className="sys-illo"
        />
        <div className="sys-kicker">404</div>
        <h1 className="sys-title">Page not found</h1>
        <p className="sys-sub">
          The page moved or was renamed. Let&rsquo;s get you back to your reviews and
          customers.
        </p>
        <div className="sys-actions">
          <Link href="/dashboard" className="sys-btn sys-btn--pri">
            Back to dashboard
          </Link>
          <Link href="/" className="sys-btn sys-btn--ghost">
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
