import Image from "next/image";
import "../auth.css";

/**
 * /login/verify — NextAuth `pages.verifyRequest` target (lib/auth/config.ts).
 * Shown after a magic-link email is sent when the flow goes through the
 * default NextAuth redirect (e.g. POST to /api/auth/signin/resend without
 * redirect:false). Centered card on the same mint canvas as /login.
 */
export const metadata = {
  title: "Check your email — Repulabs",
};

export default function VerifyRequestPage() {
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
            src="/assets/repulabs/illustrations/success.svg"
            alt=""
            width={150}
            height={120}
            priority
            className="auth-solo-illo"
          />
          <div className="auth-kicker">Check your inbox</div>
          <h1 className="auth-title" style={{ fontSize: 26 }}>
            Your sign-in link is on its way
          </h1>
          <p className="auth-sub">
            We emailed you a secure sign-in link. Click it on this device to continue — it expires
            in 15 minutes. Didn&rsquo;t get it? Check your spam folder.
          </p>
          <div className="auth-solo-actions">
            <a href="/login" className="auth-btn-ghost">
              Use a different email
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
