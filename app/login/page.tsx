"use client";

import { Icon } from "@/components/shell/icon";
import { signIn } from "next-auth/react";
import Image from "next/image";
import { useState } from "react";

/**
 * Login — repulabs v2 design, side-by-side 2-pane layout.
 *
 * Layout:
 *   ┌──────────────────┬──────────────────┐
 *   │ Teal hero panel  │  Login card      │
 *   │ (brand, kicker,  │  (Google,        │
 *   │  headline, copy, │   magic link,    │
 *   │  stats, footer)  │   trial CTA)     │
 *   └──────────────────┴──────────────────┘
 *
 * Below 960px the hero collapses to the top and the form sits below.
 *
 * Auth logic unchanged:
 *   - "resend" → magic link (15-min expiry)
 *   - "google" → OAuth, callbackUrl=/dashboard
 */
export default function LoginPage() {
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
        callbackUrl: "/dashboard",
      });
      setSent(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-shell">
      {/* LEFT — teal hero */}
      <aside className="login-hero spot">
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            right: -120,
            top: -120,
            width: 480,
            height: 480,
            borderRadius: "50%",
            background: "rgba(255,255,255,.12)",
          }}
        />
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: -180,
            bottom: -180,
            width: 480,
            height: 480,
            borderRadius: "50%",
            background: "rgba(255,255,255,.06)",
          }}
        />

        <div className="row" style={{ position: "relative", marginBottom: "auto", gap: 10 }}>
          <Image
            src="/repulabs-logo.png"
            alt=""
            width={36}
            height={36}
            priority
            style={{
              borderRadius: 9,
              objectFit: "contain",
              background: "rgba(255,255,255,.15)",
              padding: 3,
            }}
          />
          <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em" }}>repulabs</div>
        </div>

        <div style={{ position: "relative" }}>
          <div className="lbl-mono" style={{ color: "rgba(255,255,255,.7)", marginBottom: 18 }}>
            <span
              aria-hidden="true"
              style={{
                display: "inline-block",
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#fff",
                boxShadow: "0 0 0 3px rgba(255,255,255,.25)",
                marginRight: 8,
                verticalAlign: 1,
              }}
            />
            THE REPUTATION OS
          </div>
          <h1
            style={{
              fontSize: "clamp(32px, 4vw, 48px)",
              fontWeight: 600,
              margin: 0,
              lineHeight: 1.05,
              letterSpacing: "-0.025em",
              maxWidth: 480,
            }}
          >
            Run your reputation like you run your business.
          </h1>
          <p
            style={{
              fontSize: 15,
              opacity: 0.88,
              marginTop: 18,
              maxWidth: 440,
              lineHeight: 1.55,
            }}
          >
            Requests, replies, surveys, social and phone — all under one workspace. AI handles the
            busywork, you handle the brand.
          </p>

          <div
            style={{
              marginTop: 36,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 18,
              maxWidth: 460,
            }}
          >
            {[
              { v: "1,284+", l: "reviews collected this month" },
              { v: "92%", l: "AI reply approval rate" },
              { v: "9.2d", l: "avg time-to-dispute outcome" },
              { v: "4.7★", l: "median customer rating" },
            ].map((s) => (
              <div key={s.l}>
                <div
                  style={{
                    fontSize: 26,
                    fontWeight: 600,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {s.v}
                </div>
                <div style={{ fontSize: 11.5, opacity: 0.78 }}>{s.l}</div>
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
            opacity: 0.7,
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
        <div className="login-card">
          {/* Mobile-only inline brand */}
          <div className="login-mobile-brand row" style={{ marginBottom: 24, gap: 10 }}>
            <Image
              src="/repulabs-logo.png"
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

          <h2
            style={{
              fontSize: 26,
              fontWeight: 600,
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            {sent ? "Check your inbox" : "Welcome back"}
          </h2>
          <p className="dim" style={{ fontSize: 13.5, marginTop: 6, lineHeight: 1.55 }}>
            {sent ? (
              <>
                We sent a sign-in link to <strong style={{ color: "var(--ink)" }}>{email}</strong>.
                The link expires in 15 minutes.
              </>
            ) : (
              "Sign in to your repulabs workspace."
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
              <div style={{ marginTop: 24 }}>
                <button
                  type="button"
                  className="btn btn--lg"
                  style={{ width: "100%", justifyContent: "center" }}
                  onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
                >
                  <Icon name="google" size={14} />
                  Continue with Google
                </button>
              </div>

              <div className="row" style={{ margin: "20px 0" }}>
                <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
                <span
                  className="dim mono"
                  style={{
                    fontSize: 10,
                    padding: "0 12px",
                    letterSpacing: ".08em",
                  }}
                >
                  OR EMAIL
                </span>
                <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
              </div>

              <form onSubmit={onMagicLink} className="col" style={{ gap: 12 }}>
                <label className="col" style={{ gap: 6 }}>
                  <span className="lbl">Work email</span>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    inputMode="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@business.com"
                    aria-label="Work email"
                    style={{
                      width: "100%",
                      height: 42,
                      padding: "0 14px",
                      borderRadius: "var(--r)",
                      border: "1px solid var(--line)",
                      background: "var(--surface)",
                      color: "var(--ink)",
                      fontFamily: "var(--f-mono)",
                      fontSize: 13,
                      outline: "none",
                    }}
                  />
                </label>
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
                      Email me a sign-in link
                      <Icon name="arrowR" size={13} />
                    </>
                  )}
                </button>
              </form>

              <div className="dim" style={{ fontSize: 12.5, marginTop: 22, textAlign: "center" }}>
                New here?{" "}
                <a
                  href="/"
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
