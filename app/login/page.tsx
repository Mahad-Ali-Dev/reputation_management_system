"use client";

import { Icon } from "@/components/shell/icon";
import { ShieldCheck, User, Users, Zap } from "lucide-react";
import { signIn } from "next-auth/react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { googleSignIn } from "./actions";
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
    <main className="auth-shell auth-shell--login">
      {/* Mobile-only slim dark brand header (replaces the panel <900px) */}
      <header className="auth-mobile-brand">
        <Brand light />
      </header>

      {/* LEFT — dark navy brand panel */}
      <aside className="auth-side">
        <div className="auth-side-glow auth-side-glow--a" aria-hidden="true" />
        <div className="auth-side-glow auth-side-glow--b" aria-hidden="true" />
        <div className="auth-side-dots" aria-hidden="true" />

        <div className="auth-logo">
          <Brand light />
        </div>

        <div className="auth-side-body">
          <h1 className="auth-side-title">
            Welcome back to
            <br />
            <span className="auth-grad">repulabs</span>
          </h1>
          <p className="auth-side-sub">
            Your command center for feedback, insights and better products.
          </p>

          <div className="auth-side-illo">
            <Image
              src="/assets/repulabs/illustrations/login-hero.svg"
              alt=""
              width={500}
              height={340}
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

        <div className="auth-side-foot">
          <span>© repulabs {new Date().getFullYear()}</span>
          <a href="/legal/privacy">Privacy</a>
          <a href="/legal/terms">Terms</a>
        </div>
      </aside>

      {/* RIGHT — white form card */}
      <section className="auth-main">
        <div className="auth-card">
          <span className="auth-badge">
            <User size={24} />
          </span>
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

              <div className="auth-info">
                <span className="auth-info-ic">
                  <ShieldCheck size={16} />
                </span>
                <span className="auth-info-tx">
                  We never use your password. It’s just one-click, magic link access.
                </span>
              </div>

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
