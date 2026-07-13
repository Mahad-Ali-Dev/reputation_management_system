import { auth } from "@/lib/auth/config";
import { ArrowRight, Clock, ExternalLink, Star } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import "./not-activated.css";

export const dynamic = "force-dynamic";

/**
 * /not-activated — the page customers land on when they scan a QR plaque
 * whose owner hasn't redeemed the activation code yet.
 *
 * Three audiences, three CTAs:
 *   1. The business OWNER who's testing or just got their plaque
 *        → "Activate this QR" routes by session state:
 *            - signed in       → /activate?slug=X
 *            - signed out      → /signup?next=/activate?slug=X (favors new users)
 *            - has account     → can click "sign in" link instead
 *   2. A real CUSTOMER who scanned at a counter and just wants to leave a review
 *        → "Leave a review on Google" — searches by business name when we
 *          have a slug, otherwise opens Google directly
 *   3. SOMEONE WHO WANDERED HERE — they get a clean "go to Google" exit
 *
 * Query params (all optional):
 *   slug=ABCD123456   — the unactivated slug, pre-fills the activate form
 *   reason=inactive   — the device was unactivated (default)
 *   reason=no_target  — active but no redirect URL set
 *   reason=signature  — HMAC verification failed (tampering or rotation)
 *
 * Implementation note: we detect session via auth() so signed-in tenants
 * skip the signup wall. App-store reviewers and Google verifiers will see
 * the signed-out variant.
 */
export default async function NotActivatedPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; slug?: string }>;
}) {
  const sp = await searchParams;
  const slug = typeof sp.slug === "string" ? sp.slug.toUpperCase().slice(0, 10) : null;
  const session = await auth().catch(() => null);
  const isSignedIn = !!session?.user?.email;

  // Build the activate destination — pre-fills the slug field on /activate.
  const activateHref = slug ? `/activate?slug=${slug}` : "/activate";
  const signupHref = `/signup?next=${encodeURIComponent(activateHref)}`;
  const loginHref = `/login?next=${encodeURIComponent(activateHref)}`;

  return (
    <main className="na">
      <div className="na__card">
        {/* Brand wordmark — real product icon + repu·labs lockup */}
        <div className="na__brand">
          <Image src="/favicon.png?v=2" alt="" width={40} height={40} className="na__logo" priority />
          <span className="na__wordmark">
            repu<span>labs</span>
          </span>
        </div>

        <div className="na__head">
          <div className="na__icon" aria-hidden>
            <Clock size={26} strokeWidth={2} />
          </div>
          <h1 className="na__title">This QR isn&rsquo;t live yet.</h1>
          <p className="na__lead">
            The business owner hasn&rsquo;t finished setting up this device. Either you bought it and
            need to activate it, or you&rsquo;re here to leave a review the regular way.
          </p>
          {slug && (
            <div className="na__code">
              CODE&nbsp;·&nbsp;<b>{slug}</b>
            </div>
          )}
        </div>

        {/* CTA 1 — Activate this QR (most prominent) */}
        <Link href={isSignedIn ? activateHref : signupHref} className="na__cta">
          <span>
            <span className="na__cta-kicker">I bought this product</span>
            <div className="na__cta-title">Activate this QR{slug ? ` · ${slug}` : ""}</div>
            <div className="na__cta-sub">
              {isSignedIn
                ? "Enter your activation code — takes 30 seconds."
                : "Free workspace, 30-day trial, no card required."}
            </div>
          </span>
          <ArrowRight className="na__cta-arrow" size={18} />
        </Link>

        {/* Already-has-account link — only when not signed in */}
        {!isSignedIn && (
          <p className="na__signin">
            Already have a Repulabs workspace? <Link href={loginHref}>Sign in instead →</Link>
          </p>
        )}

        {/* CTA 2 — Leave a review (customer path) */}
        <a
          href="https://www.google.com/maps/search/leave+a+review"
          target="_blank"
          rel="noopener noreferrer"
          className="na__review"
        >
          <span>
            <span className="na__review-kicker">I&rsquo;m just leaving a review</span>
            <div className="na__review-title">
              Leave a review on Google
              <Star size={14} fill="#f5b301" stroke="#f5b301" />
            </div>
            <div className="na__review-sub">Find the business by name and post directly there.</div>
          </span>
          <ExternalLink className="na__review-ext" size={15} />
        </a>

        {/* CTA 3 — Visit Google (lowest-friction exit) */}
        <Link href="https://www.google.com" className="na__exit">
          Or just go to Google →
        </Link>

        {/* Footer reassurance */}
        <p className="na__foot">
          This QR was made by <Link href="/">repulabs.com</Link> — every code is one-time-use and
          tied to a single business. We never sell or share scanner data.
        </p>
      </div>
    </main>
  );
}
