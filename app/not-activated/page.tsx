import { auth } from "@/lib/auth/config";
import { ArrowRight, ExternalLink, Star } from "lucide-react";
import Link from "next/link";

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
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(at 0% 0%, rgba(37, 99, 235, 0.06) 0%, transparent 40%), " +
          "radial-gradient(at 100% 100%, rgba(94, 234, 212, 0.08) 0%, transparent 50%), " +
          "linear-gradient(180deg, #f6f7f4 0%, #ecf1ec 100%)",
        display: "grid",
        placeItems: "center",
        padding: "32px 20px",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        color: "#0b0d0e",
      }}
    >
      <div style={{ maxWidth: 540, width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 56, marginBottom: 10 }} aria-hidden>
            ⌛
          </div>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 600,
              letterSpacing: "-0.025em",
              margin: 0,
              lineHeight: 1.15,
            }}
          >
            This QR isn&rsquo;t live yet.
          </h1>
          <p
            style={{
              fontSize: 15,
              color: "#475569",
              lineHeight: 1.55,
              marginTop: 12,
              maxWidth: 440,
              marginInline: "auto",
            }}
          >
            The business owner hasn&rsquo;t finished setting up this device. Either you bought it
            and need to activate it, or you&rsquo;re here to leave a review the regular way.
          </p>
          {slug && (
            <p
              style={{
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                fontSize: 11,
                color: "#94a3b8",
                marginTop: 14,
                letterSpacing: ".1em",
              }}
            >
              CODE · {slug}
            </p>
          )}
        </div>

        {/* CTA 1 — Activate this QR (most prominent) */}
        <Link
          href={isSignedIn ? activateHref : signupHref}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "18px 22px",
            borderRadius: 14,
            background: "#0b0d0e",
            color: "#fff",
            textDecoration: "none",
            marginBottom: 12,
            boxShadow: "0 10px 30px -10px rgba(11,13,14,.5)",
          }}
        >
          <span>
            <span
              style={{
                fontSize: 11,
                fontFamily: "ui-monospace, monospace",
                letterSpacing: ".12em",
                color: "#5eead4",
                fontWeight: 600,
              }}
            >
              I BOUGHT THIS PRODUCT
            </span>
            <div style={{ fontSize: 17, fontWeight: 600, marginTop: 4, letterSpacing: "-0.01em" }}>
              Activate this QR{slug ? ` (${slug})` : ""}
            </div>
            <div style={{ fontSize: 12.5, color: "#9aa1ad", marginTop: 2 }}>
              {isSignedIn
                ? "Enter your activation code — takes 30 seconds."
                : "Free workspace, 30-day trial, no card required."}
            </div>
          </span>
          <ArrowRight size={18} />
        </Link>

        {/* Already-has-account link — only when not signed in */}
        {!isSignedIn && (
          <p
            style={{
              textAlign: "center",
              fontSize: 12.5,
              color: "#64748b",
              marginBottom: 22,
            }}
          >
            Already have a Repulabs workspace?{" "}
            <Link
              href={loginHref}
              style={{
                color: "#2563eb",
                textDecoration: "none",
                fontWeight: 500,
              }}
            >
              Sign in instead →
            </Link>
          </p>
        )}

        {/* CTA 2 — Leave a review (customer path) */}
        <a
          href="https://www.google.com/maps/search/leave+a+review"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "16px 20px",
            borderRadius: 12,
            background: "#fff",
            color: "#0b0d0e",
            textDecoration: "none",
            border: "1px solid #eceeea",
            marginBottom: 10,
          }}
        >
          <span>
            <span
              style={{
                fontSize: 11,
                fontFamily: "ui-monospace, monospace",
                letterSpacing: ".12em",
                color: "#92400e",
                fontWeight: 600,
              }}
            >
              I&rsquo;M JUST LEAVING A REVIEW
            </span>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                marginTop: 4,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              Leave a review on Google
              <Star size={14} fill="#f59e0b" stroke="#f59e0b" />
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
              Find the business by name and post directly there.
            </div>
          </span>
          <ExternalLink size={15} color="#94a3b8" />
        </a>

        {/* CTA 3 — Visit Google (lowest-friction exit) */}
        <Link
          href="https://www.google.com"
          style={{
            display: "block",
            textAlign: "center",
            fontSize: 12.5,
            color: "#94a3b8",
            textDecoration: "none",
            padding: "10px 0",
          }}
        >
          Or just go to Google →
        </Link>

        {/* Footer reassurance */}
        <p
          style={{
            marginTop: 28,
            textAlign: "center",
            fontSize: 11,
            color: "#94a3b8",
            lineHeight: 1.5,
            maxWidth: 380,
            marginInline: "auto",
          }}
        >
          This QR was made by{" "}
          <Link href="/" style={{ color: "#64748b", textDecoration: "none" }}>
            repulabs.com
          </Link>{" "}
          — every code is one-time-use and tied to a single business. We never sell or share scanner
          data.
        </p>
      </div>
    </main>
  );
}
