"use client";

import { Icon } from "@/components/shell/icon";
import { signIn } from "next-auth/react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

/**
 * Sign-up — visually identical to /login but with onboarding copy.
 *
 * Why we have it: Auth.js magic-link flow doesn't really distinguish sign-up
 * from sign-in (the resend provider creates the user on first verification).
 * But marketing surfaces, App-Store reviewers, and OAuth verification forms
 * all need a clear `/signup` URL to point at. This page provides one without
 * forking the auth backend.
 *
 * Behavior:
 *   - Magic-link via `signIn("resend")` — same flow as login.
 *   - `?next=<path>` query is honored as the callback URL after verification.
 *     The QR scan-to-signup flow uses this: `/signup?next=/activate?slug=ABCD`.
 *   - If the user has already signed up, the link still works — Auth.js just
 *     logs them in. We don't add an awkward "this email already exists" gate.
 */
export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupInner />
    </Suspense>
  );
}

function SignupInner() {
  const sp = useSearchParams();
  const next = sp.get("next") || "/dashboard";
  // Best-effort: if `?next=/activate?slug=XYZ` was passed, show a contextual
  // banner explaining what's about to happen after signup.
  const slugFromNext = (() => {
    try {
      const m = next.match(/[?&]slug=([A-Za-z0-9]+)/);
      return m?.[1] ?? null;
    } catch {
      return null;
    }
  })();

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
        callbackUrl: next,
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
            src="/favicon.png"
            alt=""
            width={36}
            height={36}
            priority
            style={{
              borderRadius: 9,
              objectFit: "cover",
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
            30-DAY FREE TRIAL · NO CARD
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
            Start running reputation like a system in 90 seconds.
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
            Drop your email, click the verification link, you&rsquo;re in. Connect Google Business
            Profile next and your first batch of reviews land within a minute.
          </p>

          <ul
            style={{
              marginTop: 32,
              padding: 0,
              listStyle: "none",
              display: "grid",
              gap: 10,
              maxWidth: 460,
            }}
          >
            {[
              "Generate a QR for your business — free, forever",
              "AI reply drafts trained on your brand voice",
              "Bulk SMS + email review requests with deliverability built in",
              "AI phone receptionist takes after-hours calls",
            ].map((l) => (
              <li
                key={l}
                className="row"
                style={{ gap: 10, fontSize: 13.5, lineHeight: 1.4, alignItems: "flex-start" }}
              >
                <span
                  aria-hidden
                  style={{
                    flexShrink: 0,
                    display: "inline-grid",
                    placeItems: "center",
                    width: 18,
                    height: 18,
                    borderRadius: 999,
                    background: "rgba(255,255,255,.18)",
                    marginTop: 1,
                  }}
                >
                  <Icon name="check" size={10} />
                </span>
                <span style={{ opacity: 0.92 }}>{l}</span>
              </li>
            ))}
          </ul>
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

      {/* RIGHT — sign-up card */}
      <section className="login-form-wrap">
        <div className="login-card">
          {/* Mobile-only inline brand */}
          <div className="login-mobile-brand row" style={{ marginBottom: 24, gap: 10 }}>
            <Image
              src="/favicon.png"
              alt=""
              width={36}
              height={36}
              priority
              style={{ borderRadius: 9, objectFit: "cover" }}
            />
            <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.025em" }}>
              repu<span style={{ color: "var(--pri)" }}>labs</span>
            </div>
          </div>

          {slugFromNext && !sent && (
            <div
              className="ds-card ds-card--pri"
              style={{
                padding: "10px 12px",
                fontSize: 12.5,
                lineHeight: 1.55,
                marginBottom: 16,
              }}
            >
              <div className="row" style={{ marginBottom: 4, gap: 6 }}>
                <Icon name="qr" size={13} style={{ color: "var(--pri)" }} />
                <strong>Activating QR {slugFromNext}</strong>
              </div>
              Sign up here and we&rsquo;ll take you straight to the activation page with this code
              pre-filled.
            </div>
          )}

          <h2 style={{ fontSize: 26, fontWeight: 600, margin: 0, letterSpacing: "-0.02em" }}>
            {sent ? "Check your inbox" : "Create your workspace"}
          </h2>
          <p className="dim" style={{ fontSize: 13.5, marginTop: 6, lineHeight: 1.55 }}>
            {sent ? (
              <>
                We sent a verification link to{" "}
                <strong style={{ color: "var(--ink)" }}>{email}</strong>. Open it on this device to
                finish signing up. Link expires in 15 minutes.
              </>
            ) : (
              "Free for 30 days. No card required."
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
                  <strong>Verification link sent</strong>
                </div>
                Click the button in the email to complete signup. Didn&rsquo;t get it? Check your
                spam folder, or try again below.
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
                  onClick={() => signIn("google", { callbackUrl: next })}
                >
                  <Icon name="google" size={14} />
                  Continue with Google
                </button>
              </div>

              <div className="row" style={{ margin: "20px 0" }}>
                <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
                <span
                  className="dim mono"
                  style={{ fontSize: 10, padding: "0 12px", letterSpacing: ".08em" }}
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
                      Create my workspace
                      <Icon name="arrowR" size={13} />
                    </>
                  )}
                </button>
              </form>

              <p
                className="dim"
                style={{
                  fontSize: 11.5,
                  marginTop: 14,
                  lineHeight: 1.55,
                  textAlign: "center",
                }}
              >
                By signing up you agree to our{" "}
                <a href="/legal/terms" style={{ color: "var(--pri)" }}>
                  Terms
                </a>{" "}
                and{" "}
                <a href="/legal/privacy" style={{ color: "var(--pri)" }}>
                  Privacy Policy
                </a>
                .
              </p>

              <div className="dim" style={{ fontSize: 12.5, marginTop: 14, textAlign: "center" }}>
                Already have an account?{" "}
                <a
                  href={`/login${next !== "/dashboard" ? `?next=${encodeURIComponent(next)}` : ""}`}
                  style={{ color: "var(--pri)", fontWeight: 500, textDecoration: "none" }}
                >
                  Sign in →
                </a>
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
