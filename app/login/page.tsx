"use client";

import { Icon } from "@/components/shell/icon";
import { signIn } from "next-auth/react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { googleSignIn } from "./actions";

/**
 * Login — repulabs v3 design, side-by-side 2-pane layout.
 *
 * Layout:
 *   ┌──────────────────┬──────────────────┐
 *   │ Dark-navy hero   │  Login card      │
 *   │ (brand, kicker,  │  (WELCOME BACK,  │
 *   │  headline, copy, │   email link,    │
 *   │  stats, footer)  │   Google, trial) │
 *   └──────────────────┴──────────────────┘
 *
 * Re-skinned to match tasks/premium-ui-redesign/02_auth.png:
 *   - Hero panel is deep slate (--ink) with a cool teal/blue spotlight glow
 *   - Card uses the "WELCOME BACK" blue eyebrow + "Log in to Repulabs" heading
 *   - v3 .ds-input / .lbl-mono / .btn--pri primitives (no bespoke inline inputs)
 *
 * Below 960px the hero collapses to the top and the form sits below.
 *
 * Auth logic unchanged:
 *   - "resend" → magic link (15-min expiry). The artboard's password field is
 *     illustrative; the backend is passwordless, so we keep the email-link form.
 *   - "google" → OAuth, callbackUrl=/dashboard
 */
const HERO_BG = "#0f172a"; // --ink (deep slate navy, matches artboard #101820)

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const sp = useSearchParams();
  // Honor a post-login return path (e.g. the /accept-invite flow sends invitees
  // here as /login?callbackUrl=/accept-invite?token=...). Only allow same-site
  // relative paths to avoid an open-redirect.
  const rawCallback = sp.get("callbackUrl") || "/dashboard";
  const callbackUrl = rawCallback.startsWith("/") && !rawCallback.startsWith("//")
    ? rawCallback
    : "/dashboard";

  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function onMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await signIn("resend", {
        email,
        redirect: false,
        callbackUrl,
      });
      setSent(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-shell">
      {/* LEFT — deep-slate hero */}
      <aside className="login-hero" style={{ background: HERO_BG, color: "#fff" }}>
        {/* Cool teal/blue spotlight glows */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            right: -140,
            top: -160,
            width: 520,
            height: 520,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(37,99,235,.45) 0%, transparent 70%)",
            filter: "blur(20px)",
          }}
        />
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: -180,
            bottom: -180,
            width: 460,
            height: 460,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(94,234,212,.28) 0%, transparent 70%)",
            filter: "blur(20px)",
          }}
        />

        <div className="row" style={{ position: "relative", marginBottom: "auto", gap: 11 }}>
          <Image
            src="/favicon.png?v=2"
            alt=""
            width={38}
            height={38}
            priority
            style={{
              borderRadius: 10,
              objectFit: "contain",
              background: "#fff",
              padding: 4,
            }}
          />
          <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em" }}>
            repu<span style={{ color: "#5eead4" }}>labs</span>
          </div>
        </div>

        <div style={{ position: "relative" }}>
          <div className="lbl-mono" style={{ color: "rgba(255,255,255,.6)", marginBottom: 18 }}>
            <span
              aria-hidden="true"
              style={{
                display: "inline-block",
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#5eead4",
                boxShadow: "0 0 0 3px rgba(94,234,212,.25)",
                marginRight: 8,
                verticalAlign: 1,
              }}
            />
            THE REPUTATION OS
          </div>
          <h1
            style={{
              fontSize: "clamp(32px, 4vw, 50px)",
              fontWeight: 600,
              margin: 0,
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              maxWidth: 500,
            }}
          >
            Sign in to the workspace that protects your local brand.
          </h1>
          <p
            style={{
              fontSize: 15,
              color: "rgba(255,255,255,.72)",
              marginTop: 18,
              maxWidth: 440,
              lineHeight: 1.55,
            }}
          >
            Requests, replies, surveys, social and phone — all under one workspace. AI handles the
            busywork, you handle the brand.
          </p>

          <div
            className="ds-card"
            style={{
              marginTop: 36,
              maxWidth: 480,
              background: "rgba(255,255,255,.05)",
              border: "1px solid rgba(255,255,255,.10)",
              boxShadow: "none",
              borderRadius: "var(--r-md)",
              padding: "20px 22px",
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 18,
            }}
          >
            {[
              { v: "1,284+", l: "reviews collected this month" },
              { v: "92%", l: "AI reply approval rate" },
              { v: "4.7★", l: "median customer rating" },
            ].map((s) => (
              <div key={s.l}>
                <div
                  style={{
                    fontSize: 26,
                    fontWeight: 600,
                    letterSpacing: "-0.025em",
                  }}
                >
                  {s.v}
                </div>
                <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.6)", marginTop: 3 }}>
                  {s.l}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div
          className="row"
          style={{
            position: "relative",
            marginTop: "auto",
            fontSize: 11.5,
            color: "rgba(255,255,255,.55)",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          © repulabs {new Date().getFullYear()}
          <span style={{ marginLeft: "auto", display: "flex", gap: 12 }}>
            <a href="/legal/privacy" style={{ color: "inherit", textDecoration: "none" }}>
              Privacy
            </a>
            <a href="/legal/terms" style={{ color: "inherit", textDecoration: "none" }}>
              Terms
            </a>
          </span>
        </div>
      </aside>

      {/* RIGHT — login card */}
      <section className="login-form-wrap">
        <div className="login-card ds-card" style={{ padding: 32 }}>
          {/* Mobile-only inline brand */}
          <div className="login-mobile-brand row" style={{ marginBottom: 24, gap: 10 }}>
            <Image
              src="/favicon.png?v=2"
              alt=""
              width={36}
              height={36}
              priority
              style={{ borderRadius: 9, objectFit: "contain" }}
            />
            <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.025em" }}>
              repu<span style={{ color: "var(--pri)" }}>labs</span>
            </div>
          </div>

          <div
            className="lbl-mono"
            style={{ color: "var(--pri)", marginBottom: 10, fontWeight: 600 }}
          >
            {sent ? "CHECK YOUR INBOX" : "WELCOME BACK"}
          </div>
          <h2
            style={{
              fontSize: 26,
              fontWeight: 600,
              margin: 0,
              letterSpacing: "-0.025em",
              color: "var(--ink)",
            }}
          >
            {sent ? "Check your inbox" : "Log in to Repulabs"}
          </h2>
          <p className="dim" style={{ fontSize: 13.5, marginTop: 6, lineHeight: 1.55 }}>
            {sent ? (
              <>
                We sent a sign-in link to <strong style={{ color: "var(--ink)" }}>{email}</strong>.
                The link expires in 15 minutes.
              </>
            ) : (
              "Use your work email to continue."
            )}
          </p>

          {sent ? (
            <div className="col" style={{ gap: 12, marginTop: 24 }}>
              <div
                className="ds-card ds-card--pri"
                style={{ padding: 14, fontSize: 12.5, lineHeight: 1.55 }}
              >
                <div className="row" style={{ marginBottom: 4, gap: 6 }}>
                  <Icon name="mail" size={14} style={{ color: "var(--pri)" }} />
                  <strong>Sign-in link sent</strong>
                </div>
                Click the button in the email to finish signing in. Didn't get it? Check your spam
                folder, or try again below.
              </div>
              <button
                type="button"
                className="btn btn--ghost"
                style={{ width: "100%", justifyContent: "center" }}
                onClick={() => {
                  setSent(false);
                  setEmail("");
                }}
              >
                Use a different email
              </button>
            </div>
          ) : (
            <>
              <form onSubmit={onMagicLink} className="col" style={{ gap: 14, marginTop: 24 }}>
                <div>
                  <label htmlFor="login-email" className="lbl-mono">
                    Email
                  </label>
                  <input
                    id="login-email"
                    type="email"
                    required
                    autoComplete="email"
                    inputMode="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@business.com"
                    aria-label="Work email"
                    className="ds-input"
                    style={{ height: 44 }}
                  />
                </div>
                {/* Primary CTA — dark "Continue"-style button (passwordless: emails a link). */}
                <button
                  type="submit"
                  disabled={submitting || !email}
                  className="btn btn--pri btn--lg"
                  style={{
                    width: "100%",
                    justifyContent: "center",
                    opacity: submitting ? 0.7 : 1,
                  }}
                >
                  {submitting ? (
                    "Sending…"
                  ) : (
                    <>
                      Continue with email
                      <Icon name="arrowR" size={13} />
                    </>
                  )}
                </button>
              </form>

              <div className="row" style={{ margin: "18px 0" }}>
                <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
                <span
                  className="dim mono"
                  style={{
                    fontSize: 10,
                    padding: "0 12px",
                    letterSpacing: ".08em",
                  }}
                >
                  OR
                </span>
                <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
              </div>

              {/* Server action — NextAuth v5 requires POST for /api/auth/signin/*.
                  A bare <a> GET produces "UnknownAction: Unsupported action".
                  Using a <form> with a server action handles CSRF automatically
                  and runs signIn() server-side, where process.env.AUTH_URL is
                  correctly set. Bypasses the broken next-auth/react client
                  helper (which bakes localhost into the bundle in v5 beta.25). */}
              <form action={googleSignIn}>
                <input type="hidden" name="callbackUrl" value={callbackUrl} />
                <button
                  type="submit"
                  className="btn btn--lg"
                  style={{ width: "100%", justifyContent: "center" }}
                >
                  <Icon name="google" size={14} />
                  Continue with Google
                </button>
              </form>

              <div className="dim" style={{ fontSize: 12.5, marginTop: 22, textAlign: "center" }}>
                New here?{" "}
                <a
                  href="/signup"
                  style={{
                    color: "var(--pri)",
                    fontWeight: 500,
                    textDecoration: "none",
                  }}
                >
                  Start a free trial →
                </a>
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
