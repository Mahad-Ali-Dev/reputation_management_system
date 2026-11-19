import { auth } from "@/lib/auth/config";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import "./not-activated.css";

export const dynamic = "force-dynamic";

/**
 * /not-activated — the page customers land on when they scan a QR plaque
 * whose owner hasn't redeemed the activation code yet.
 *
 * A vertical "how it works" flow: each step is a circle (image) with its
 * instruction beside it, connected by curved arrows — Scan the stand → Sign up
 * → Add your Google review link — then the Activate CTA.
 *
 * Session logic preserved: Activate CTA routes to /activate (signed in) or
 * /signup?next=/activate (signed out), slug pre-fills the activate form.
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

  const activateHref = slug ? `/activate?slug=${slug}` : "/activate";
  const signupHref = `/signup?next=${encodeURIComponent(activateHref)}`;
  const loginHref = `/login?next=${encodeURIComponent(activateHref)}`;

  const STEPS = [
    {
      n: 1,
      img: "/assets/repulabs/not-activated/step-stand.jpg",
      label: "Scan the stand",
      desc: "Scan the QR code on your Repulabs stand (or tap it to your phone).",
    },
    {
      n: 2,
      img: "/assets/repulabs/not-activated/step-signup.png",
      label: "Sign up",
      desc: "Sign up and create a free account on our website.",
    },
    {
      n: 3,
      img: "/assets/repulabs/not-activated/step-reviewlink.svg",
      label: "Add your review link",
      desc: "Add your Google Business Profile review link so every tap and scan goes straight to your Google reviews.",
    },
  ];

  return (
    <main className="na">
      <div className="na__card">
        <div className="na__status">
          <span className="na__badge">
            <span className="na__badge-dot" aria-hidden />
            QR not activated yet
          </span>
          {slug && (
            <span className="na__code">
              CODE&nbsp;·&nbsp;<b>{slug}</b>
            </span>
          )}
        </div>

        <h1 className="na__title">Set up your stand in 3 easy steps</h1>

        <div className="na-flow2">
          {STEPS.map((s, i) => {
            // Alternate sides: step 1 circle-left (text right), step 2 circle-right
            // (text left), step 3 circle-left (text right).
            const circleLeft = i % 2 === 0;
            return (
              <div key={s.n} className="na-stepwrap">
                <div className={`na-stepitem${circleLeft ? "" : " na-stepitem--rev"}`}>
                  <div className="na-circle na-circle--img">
                    <span className="na-circle__num">{s.n}</span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="na-circle__img" src={s.img} alt="" />
                  </div>
                  <div className="na-stepitem__text">
                    <span className="na-steptag">Step {s.n}</span>
                    <div className="na-stepitem__label">{s.label}</div>
                    <p className="na-stepitem__desc">{s.desc}</p>
                    {i < STEPS.length - 1 && (
                      <div
                        className={`na-arrow ${circleLeft ? "na-arrow--r" : "na-arrow--l"}`}
                        aria-hidden
                      >
                        <ArrowSvg />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Activate this stand (owner path) */}
        <Link href={isSignedIn ? activateHref : signupHref} className="na__cta">
          <span>
            <span className="na__cta-kicker">I bought this stand</span>
            <span className="na__cta-title">Activate this stand{slug ? ` · ${slug}` : ""}</span>
            <span className="na__cta-sub">
              {isSignedIn
                ? "Enter your activation code takes 30 seconds."
                : "Free workspace · 30-day trial · no card required."}
            </span>
          </span>
          <ArrowRight className="na__cta-arrow" size={18} />
        </Link>

        {!isSignedIn && (
          <p className="na__signin">
            Already have a Repulabs workspace? <Link href={loginHref}>Sign in instead →</Link>
          </p>
        )}

        <p className="na__foot">
          This QR was made by <Link href="/">repulabs.com</Link> every code is one-time-use and tied
          to a single business. We never sell or share scanner data.
        </p>
      </div>
    </main>
  );
}

/** Curved violet connector arrow — sweeps left→right-down. The `--l` wrapper
 * mirrors it (scaleX) for the right→left-down leg of the zig-zag. */
function ArrowSvg() {
  return (
    <svg width="118" height="52" viewBox="0 0 118 52" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M10 8C60 2 104 12 104 36"
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <path
        d="M95 28 104 40 113 28"
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
