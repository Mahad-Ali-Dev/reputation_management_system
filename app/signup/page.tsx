"use client";

import { googleSignIn } from "@/app/login/actions";
import { Icon } from "@/components/shell/icon";
import { ShieldCheck, Users, Zap } from "lucide-react";
import { signIn } from "next-auth/react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import "@/app/login/auth.css";

/**
 * Sign-up — premium split-screen (tasks/UI/free trial/mockup.png), mirrors
 * /login with onboarding copy: white form panel LEFT, light-grey illustration
 * panel RIGHT.
 *
 * Why we have it: Auth.js magic-link flow doesn't really distinguish sign-up
 * from sign-in (the resend provider creates the user on first verification).
 * But marketing surfaces, App-Store reviewers, and OAuth verification forms
 * all need a clear `/signup` URL to point at. This page provides one without
 * forking the auth backend.
 *
 * Behavior (unchanged — auth is passwordless):
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

function Brand({ light = false }: { light?: boolean }) {
  return (
    <>
      <Image
        src="/favicon.png?v=2"
        alt=""
        width={32}
        height={32}
        priority
        className="auth-logo-mark"
      />
      <span className="auth-logo-text" style={{ color: light ? "#fff" : "var(--ink)" }}>
        repu<span className="auth-grad">labs</span>
      </span>
    </>
  );
}

const FEATURES = [
  {
    icon: ShieldCheck,
    title: "Secure & Reliable",
    desc: "Enterprise-grade security to keep your data safe.",
  },
  {
    icon: Zap,
    title: "Built for Productivity",
    desc: "Powerful tools to streamline your workflow.",
  },
  {
    icon: Users,
    title: "Team Collaboration",
    desc: "Work together seamlessly across your organization.",
  },
] as const;

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
    <main className="auth-shell auth-shell--signup">
      {/* Mobile-only slim dark brand header (replaces the panel <900px) */}
      <header className="auth-mobile-brand">
        <Brand light />
      </header>

      {/* LEFT — white form panel */}
      <section className="auth-main">
        <div className="auth-card">
          <div className="auth-logo" style={{ marginBottom: 34 }}>
            <Brand />
          </div>

          {slugFromNext && !sent && (
            <div className="auth-note" style={{ marginBottom: 18 }}>
              <div className="auth-note-head">
                <Icon name="qr" size={13} style={{ color: "#7c3aed" }} />
                Activating QR {slugFromNext}
              </div>
              Sign up here and we&rsquo;ll take you straight to the activation page with this code
              pre-filled.
            </div>
          )}

          {!sent && <span className="auth-eyebrow">✦ Get started</span>}
          <h2 className="auth-title">{sent ? "Check your inbox" : "Create your workspace"}</h2>
          <p className="auth-sub">
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
            <div className="auth-fields">
              <div className="auth-note">
                <div className="auth-note-head">
                  <Icon name="mail" size={14} style={{ color: "#7c3aed" }} />
                  Verification link sent
                </div>
                Click the button in the email to complete signup. Didn&rsquo;t get it? Check your
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
                <label className="auth-field" htmlFor="signup-email">
                  <span className="auth-field-label">Work email</span>
                  <span className="auth-field-box">
                    <Icon name="mail" size={17} />
                    <input
                      id="signup-email"
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
                  </span>
                </label>
                {/* Passwordless: this emails a verification link, no password field. */}
                <button type="submit" disabled={submitting || !email} className="auth-cta">
                  {submitting ? (
                    "Sending…"
                  ) : (
                    <>
                      Create my workspace
                      <Icon name="arrowR" size={15} />
                    </>
                  )}
                </button>
              </form>

              <div className="auth-divider">OR</div>

              {/* Server action — same fix as /login. next-auth@5-beta's client
                  signIn() bakes the wrong base URL into the bundle (resolves to
                  localhost / apex), breaking the Google redirect_uri. Routing
                  through the server action keeps the whole OAuth start server-side. */}
              <form action={googleSignIn}>
                <input type="hidden" name="callbackUrl" value={next} />
                <button type="submit" className="auth-btn-ghost">
                  <Icon name="google" size={16} />
                  Continue with Google
                </button>
              </form>

              <p className="auth-fine auth-fine--center">
                By signing up you agree to our{" "}
                <a href="/legal/terms" className="auth-link">
                  Terms
                </a>{" "}
                and{" "}
                <a href="/legal/privacy" className="auth-link">
                  Privacy Policy
                </a>
                .
              </p>

              <div className="auth-switch">
                Already have an account?{" "}
                <a
                  href={`/login${next !== "/dashboard" ? `?next=${encodeURIComponent(next)}` : ""}`}
                  className="auth-link"
                >
                  Sign in →
                </a>
              </div>
            </>
          )}

          <div className="auth-foot">
            <span>© repulabs {new Date().getFullYear()}</span>
            <a href="/legal/privacy">Privacy</a>
            <a href="/legal/terms">Terms</a>
          </div>
        </div>
      </section>

      {/* RIGHT — light-grey illustration panel */}
      <aside className="auth-side">
        <div className="auth-side-dots" aria-hidden="true" />

        <div className="auth-side-body" style={{ marginTop: "auto", marginBottom: "auto" }}>
          <h1 className="auth-side-title">
            Start a reputation workspace with <span className="auth-grad">less friction.</span>
          </h1>
          <p className="auth-side-sub">
            All the tools you need to collect feedback, analyze insights and build better products.
          </p>

          <div className="auth-side-illo">
            <Image
              src="/assets/repulabs/illustrations/home-hero.png"
              alt=""
              width={520}
              height={360}
              priority
              style={{ width: "100%", height: "auto" }}
            />
          </div>

          <div className="auth-feats">
            {FEATURES.map((f) => (
              <div key={f.title}>
                <span className="auth-feat-ic">
                  <f.icon size={17} />
                </span>
                <div className="auth-feat-tt">{f.title}</div>
                <div className="auth-feat-dd">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </main>
  );
}
