import { Icon } from "@/components/shell/icon";
import { SESSION_COOKIE_NAME, auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { cookies } from "next/headers";
import Image from "next/image";
import { redirect } from "next/navigation";
import { verifyLoginTotp } from "./actions";
import "../auth.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Two-factor verification — Repulabs",
};

const ERROR_MESSAGES: Record<string, string> = {
  invalid_code: "That code didn't match. Check your authenticator app and try again.",
  rate_limited: "Too many attempts — wait a few minutes and try again.",
};

function safeCallback(raw: string | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  return raw;
}

export default async function Login2faPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!session?.user || !userId) redirect("/login");

  const sp = await searchParams;
  const callbackUrl = safeCallback(sp.callbackUrl);

  const sessionToken = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const [user, sessionRow] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { totpEnabled: true, email: true } }),
    sessionToken
      ? prisma.session.findUnique({ where: { sessionToken }, select: { twoFactorVerified: true } })
      : Promise.resolve(null),
  ]);

  // Nothing to verify (2FA off, or this session already passed) — don't
  // strand the user on a dead-end page.
  if (!user?.totpEnabled || sessionRow?.twoFactorVerified) {
    redirect(callbackUrl);
  }

  const error = sp.error ? (ERROR_MESSAGES[sp.error] ?? null) : null;

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
          <span
            style={{
              display: "inline-flex",
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "rgba(124, 58, 237, 0.1)",
              color: "#7c3aed",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 6px",
            }}
          >
            <Icon name="smartphone" size={26} />
          </span>
          <div className="auth-kicker">Two-factor verification</div>
          <h1 className="auth-title" style={{ fontSize: 24 }}>
            Enter your authentication code
          </h1>
          <p className="auth-sub">
            Signed in as <strong style={{ color: "var(--ink)" }}>{user.email}</strong>. Open your
            authenticator app for the current 6-digit code, or use a backup code.
          </p>

          {error && (
            <div className="auth-error" role="alert" style={{ marginBottom: 14 }}>
              <Icon name="alert" size={15} />
              {error}
            </div>
          )}

          <form action={verifyLoginTotp} className="auth-fields">
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            <label className="auth-field" htmlFor="totp-code">
              <span className="auth-field-label">Authentication code</span>
              <span className="auth-field-box">
                <Icon name="lock" size={17} />
                <input
                  id="totp-code"
                  name="code"
                  type="text"
                  inputMode="text"
                  autoComplete="one-time-code"
                  required
                  maxLength={11}
                  placeholder="123456 or backup code"
                  aria-label="Authentication code"
                  className="auth-field-input"
                  style={{ letterSpacing: 2, fontVariantNumeric: "tabular-nums" }}
                />
              </span>
            </label>
            <button type="submit" className="auth-cta">
              <Icon name="checkCircle" size={16} />
              Verify and continue
            </button>
          </form>

          <div className="auth-note" style={{ marginTop: 16 }}>
            <div className="auth-note-head">
              <Icon name="info" size={14} style={{ color: "#7c3aed" }} />
              Lost your device?
            </div>
            Use one of the backup codes you saved when you set up 2FA in Account → Security. Each
            one works once.
          </div>
        </div>
      </div>
    </main>
  );
}
