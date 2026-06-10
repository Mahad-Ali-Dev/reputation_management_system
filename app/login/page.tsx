"use client";

import { Icon } from "@/components/shell/icon";
import { signIn } from "next-auth/react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { googleSignIn } from "./actions";
import "./auth.css";

/**
 * Login — premium split-screen redesign (design-mockups/auth-after.png).
 *
 * Layout:
 *   ┌──────────────────────┬──────────────────────┐
 *   │ Dark-navy hero       │ Mint gradient panel  │
 *   │ (logo, stat chip,    │ (ACCESS kicker,      │
 *   │  framed illustration,│  email field, pill   │
 *   │  display headline)   │  CTA, Google, fine   │
 *   │                      │  print)              │
 *   └──────────────────────┴──────────────────────┘
 *
 * Below 900px the hero collapses to a slim dark brand header above the form.
 *
 * Auth logic unchanged (passwordless — the mockup's password field is
 * illustrative only):
 *   - "resend" → magic link (15-min expiry) via next-auth/react signIn.
 *   - "google" → OAuth via server action (next-auth@5-beta's client helper
 *     bakes localhost into the bundle; see app/login/actions.ts).
 *   - callbackUrl honored for flows like /accept-invite (relative paths only).
 */
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}

function Brand({ teal = false }: { teal?: boolean }) {
  return (
    <>
      <Image
        src="/favicon.png?v=2"
        alt=""
        width={34}
        height={34}
        priority
        className="auth-brand-logo"
      />
      <span className="auth-brand-name">
        repu<span style={{ color: teal ? "#5eead4" : "var(--pri)" }}>labs</span>
      </span>
    </>
  );
}

function LoginInner() {
  const sp = useSearchParams();
  // Honor a post-login return path (e.g. the /accept-invite flow sends invitees
  // here as /login?callbackUrl=/accept-invite?token=...). Only allow same-site
  // relative paths to avoid an open-redirect.
  const rawCallback = sp.get("callbackUrl") || sp.get("next") || "/dashboard";
  const callbackUrl =
    rawCallback.startsWith("/") && !rawCallback.startsWith("//") ? rawCallback : "/dashboard";

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
    <main className="auth-shell">
      {/* Mobile-only slim dark brand header (replaces the hero <900px) */}
      <header className="auth-mobile-brand">
        <Brand teal />
      </header>

      {/* LEFT — dark navy hero */}
      <aside className="auth-hero">
        <div className="auth-hero-circle auth-hero-circle--a" aria-hidden="true" />
        <div className="auth-hero-circle auth-hero-circle--b" aria-hidden="true" />

        <div className="auth-brand">
          <Brand teal />
        </div>

        <div className="auth-chip">
          <div className="auth-chip-v">4.9 avg</div>
          <div className="auth-chip-l">Across 3 active locations</div>
        </div>

        <div className="auth-illo">
          <Image
            src="/assets/repulabs/illustrations/login-hero.svg"
            alt=""
            width={430}
            height={300}
            priority
            style={{ width: "100%", height: "auto" }}
          />
        </div>

        <h1 className="auth-headline">Welcome back to a clean command center.</h1>

        <div className="auth-hero-foot">
          <span>© repulabs {new Date().getFullYear()}</span>
          <span className="auth-hero-foot-links">
            <a href="/legal/privacy">Privacy</a>
            <a href="/legal/terms">Terms</a>
          </span>
        </div>
      </aside>

      {/* RIGHT — mint gradient form panel */}
      <section className="auth-panel">
        <div className="auth-panel-circle auth-panel-circle--a" aria-hidden="true" />
        <div className="auth-panel-circle auth-panel-circle--b" aria-hidden="true" />

        <div className="auth-form">
          <div className="auth-kicker">{sent ? "Check your inbox" : "Access"}</div>
          <h2 className="auth-title">{sent ? "Check your inbox" : "Log in to Repulabs"}</h2>
          <p className="auth-sub">
            {sent ? (
              <>
                We sent a sign-in link to <strong style={{ color: "var(--ink)" }}>{email}</strong>.
                The link expires in 15 minutes.
              </>
            ) : (
              "Use your work email — we'll send you a secure sign-in link."
            )}
          </p>

          {sent ? (
            <div className="auth-fields">
              <div className="auth-note">
                <div className="auth-note-head">
                  <Icon name="mail" size={14} style={{ color: "var(--pri)" }} />
                  Sign-in link sent
                </div>
                Click the button in the email to finish signing in. Didn&rsquo;t get it? Check your
                spam folder, or try again below.
              </div>
              <button
                type="button"
                className="auth-btn-ghost"
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
              <form onSubmit={onMagicLink} className="auth-fields">
                <label className="auth-field" htmlFor="login-email">
                  <span className="auth-field-label">Work email</span>
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
                    className="auth-field-input"
                  />
                </label>
                {/* Passwordless: this emails a magic link, no password field. */}
                <button type="submit" disabled={submitting || !email} className="auth-cta">
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

              <div className="auth-divider">OR</div>

              {/* Server action — NextAuth v5 requires POST for /api/auth/signin/*.
                  A bare <a> GET produces "UnknownAction: Unsupported action".
                  Using a <form> with a server action handles CSRF automatically
                  and runs signIn() server-side, where process.env.AUTH_URL is
                  correctly set. Bypasses the broken next-auth/react client
                  helper (which bakes localhost into the bundle in v5 beta.25). */}
              <form action={googleSignIn}>
                <input type="hidden" name="callbackUrl" value={callbackUrl} />
                <button type="submit" className="auth-btn-ghost">
                  <Icon name="google" size={14} />
                  Continue with Google
                </button>
              </form>

              <p className="auth-fine">
                Secure access, role-based permissions, and full activity history for every
                workspace.
              </p>

              <div className="auth-switch">
                New here?{" "}
                <a href="/signup" className="auth-link">
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
