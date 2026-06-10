import Image from "next/image";
import "../auth.css";

/**
 * /login/error — NextAuth `pages.error` target (lib/auth/config.ts).
 * NextAuth redirects here with ?error=<code> when sign-in fails
 * (expired magic link, OAuth denial, misconfiguration). Centered card
 * on the same mint canvas as /login.
 */
export const metadata = {
  title: "Sign-in problem — Repulabs",
};

const DEFAULT_COPY = {
  title: "We couldn't sign you in",
  body: "Something went wrong during sign-in. It's usually temporary — head back and try again.",
};

const ERROR_COPY: Record<string, { title: string; body: string }> = {
  Verification: {
    title: "That link has expired",
    body: "Sign-in links are single-use and expire after 15 minutes. Request a fresh one and you'll be in within seconds.",
  },
  AccessDenied: {
    title: "Access denied",
    body: "You don't have permission to sign in with that account. If you were invited to a workspace, use the email address the invite was sent to.",
  },
  OAuthAccountNotLinked: {
    title: "Email already in use",
    body: "That email is already registered with a different sign-in method. Try continuing with your work email instead — we'll send you a secure link.",
  },
  Configuration: {
    title: "Something's off on our end",
    body: "A configuration problem stopped the sign-in. Try again in a minute — if it keeps happening, reach out and we'll sort it fast.",
  },
  Default: DEFAULT_COPY,
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const copy = ERROR_COPY[sp.error ?? "Default"] ?? DEFAULT_COPY;

  return (
    <main className="auth-solo">
      <header className="auth-solo-brand">
        <Image
          src="/favicon.png?v=2"
          alt=""
          width={34}
          height={34}
          priority
          className="auth-brand-logo"
        />
        <span className="auth-brand-name">
          repu<span style={{ color: "#5eead4" }}>labs</span>
        </span>
      </header>

      <div className="auth-solo-main">
        <div className="auth-panel-circle auth-panel-circle--a" aria-hidden="true" />
        <div className="auth-panel-circle auth-panel-circle--b" aria-hidden="true" />

        <div className="auth-solo-card">
          <Image
            src="/assets/repulabs/illustrations/error.svg"
            alt=""
            width={150}
            height={120}
            priority
            className="auth-solo-illo"
          />
          <div className="auth-kicker">Sign-in problem</div>
          <h1 className="auth-title" style={{ fontSize: 26 }}>
            {copy.title}
          </h1>
          <p className="auth-sub">{copy.body}</p>
          <div className="auth-solo-actions">
            <a href="/login" className="auth-cta">
              Back to log in
            </a>
            <a href="/contact" className="auth-btn-ghost">
              Contact support
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
