import { auth } from "@/lib/auth/config";
import { ArrowRight, QrCode, Search, UserPlus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import "./not-activated.css";

export const dynamic = "force-dynamic";

/**
 * /not-activated — the page customers land on when they scan a QR plaque
 * whose owner hasn't redeemed the activation code yet.
 *
 * Laid out as the printed "Setup Your Stand in 3 Easy Steps" card: a staggered
 * zig-zag of three circular step badges (Scan stand ↘ Sign up ↙ Search your
 * business) with a READY! badge, then a Step 1 / Step 2 / Step 3 description
 * row. The circles are image placeholders (owner-supplied art drops in later).
 *
 * The real flow is preserved: Activate CTA (session-aware), a customer
 * "leave a review" path, and a "see your stats" link.
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
      pos: "a",
      icon: <QrCode size={34} strokeWidth={1.6} />,
      label: "Scan stand",
      desc: "Scan the QR code on your Repulabs stand (or tap it to your phone).",
    },
    {
      n: 2,
      pos: "b",
      icon: <UserPlus size={34} strokeWidth={1.6} />,
      label: "Sign up",
      desc: "Sign up and create a free account on our website.",
    },
    {
      n: 3,
      pos: "c",
      icon: <Search size={34} strokeWidth={1.6} />,
      label: "Search your business",
      desc: "Search for your business and activate it to your Repulabs stand.",
    },
  ] as const;

  return (
    <main className="na">
      <div className="na__card">
        <header className="na__top">
          <div className="na__brand">
            <Image
              src="/favicon.png?v=2"
              alt=""
              width={34}
              height={34}
              className="na__logo"
              priority
            />
            <span className="na__wordmark">
              repu<span>labs</span>
            </span>
          </div>
          <Link href={loginHref} className="na__stats">
            See your stats
            <ArrowRight size={13} />
          </Link>
        </header>

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

        {/* Staggered zig-zag of the three step circles + the READY badge,
            mirroring the printed card. Circles are image placeholders. */}
        <div className="na-flow">
          {STEPS.map((s) => (
            <div key={s.n} className={`na-flow__cell na-flow__${s.pos}`}>
              <div className="na-circle" aria-hidden>
                <span className="na-circle__num">{s.n}</span>
                <span className="na-circle__ph">{s.icon}</span>
              </div>
              <span className="na-flow__label">{s.label}</span>
            </div>
          ))}
          <div className="na-flow__cell na-flow__ready">
            <span className="na-ready-badge">Ready!</span>
          </div>
        </div>

        {/* Step 1 / Step 2 / Step 3 descriptions. */}
        <div className="na-steps3">
          {STEPS.map((s) => (
            <div key={s.n} className="na-step3">
              <span className="na-step3__tag">Step {s.n}</span>
              <p className="na-step3__d">{s.desc}</p>
            </div>
          ))}
        </div>

        {/* CTA 1 — Activate this stand (owner path, most prominent) */}
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
