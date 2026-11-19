"use client";

import { Icon } from "@/components/shell/icon";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { googleSignIn } from "./actions";
import { AuthBackground, parseAuthBg } from "./auth-background";
import "./auth.css";

/**
 * Login — premium split-screen (tasks/UI/login/mockup.png).
 *
 * Layout:
 *   ┌──────────────────────┬──────────────────────┐
 *   │ Dark-navy brand panel│ White form card      │
 *   │ (logo, display head, │ (person tile, magic  │
 *   │  illustration, 3     │  link email, Google, │
 *   │  feature items)      │  reassurance box)    │
 *   └──────────────────────┴──────────────────────┘
 * Below 900px the panel collapses to a slim dark brand header.
 *
 * Auth logic is unchanged and passwordless:
 *   - "resend" → magic link (15-min expiry) via next-auth/react signIn.
 *   - "google" → OAuth via server action (next-auth@5-beta's client helper
 *     bakes localhost into the bundle; see app/login/actions.ts).
 *   - callbackUrl honored for flows like /accept-invite (relative paths only).
 * There is no Microsoft provider, so no Microsoft button is shown.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const sp = useSearchParams();
  const bg = parseAuthBg(sp.get("bg"));
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
    <main className={`auth-shell auth-shell--login auth-shell--vortex auth-shell--bg-${bg}`}>
      {/* Full-page animated wavy background. */}
      <AuthBackground variant={bg} />

      <section className="auth-main">
        <div className="auth-card">
          <h2 className="auth-title">{sent ? "Check your inbox" : "Log in to your account"}</h2>
          <p className="auth-sub">
            {sent ? (
              <>
                We sent a sign-in link to <strong style={{ color: "var(--ink)" }}>{email}</strong>.
                The link expires in 15 minutes.
              </>
            ) : (
              "Enter your work email and we’ll send you a secure sign-in link."
            )}
          </p>

          {sent ? (
            <div className="auth-fields">
              <div className="auth-note">
                <div className="auth-note-head">
                  <Icon name="mail" size={14} style={{ color: "#7c3aed" }} />
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
                  <span className="auth-field-box">
                    <Icon name="mail" size={17} />
                    <input
                      id="login-email"
                      type="email"
                      required
                      autoComplete="email"
                      inputMode="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      aria-label="Work email"
                      className="auth-field-input"
                    />
                  </span>
                </label>
                {/* Passwordless: this emails a magic link, no password field. */}
                <button type="submit" disabled={submitting || !email} className="auth-cta">
                  {submitting ? (
                    "Sending…"
                  ) : (
                    <>
                      <Icon name="send" size={16} />
                      Send sign-in link
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
                  <Icon name="google" size={16} />
                  Continue with Google
                </button>
              </form>

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
