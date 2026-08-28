import { Icon } from "@/components/shell/icon";
import { updateSecurityPrefs } from "@/lib/account/actions";
import { NEW_2FA_BACKUP_CODES_COOKIE } from "@/lib/account/constants";
import {
  cancelTotpSetup,
  confirmTotpSetup,
  disableTotp,
  regenerateBackupCodes,
  startTotpSetup,
} from "@/lib/account/two-factor-actions";
import { getOrgContext } from "@/lib/auth/org-context";
import { buildOtpAuthUri, decryptTotpSecret } from "@/lib/auth/totp";
import { prisma } from "@/lib/db/client";
import { cookies } from "next/headers";
import QRCode from "qrcode";
import { SettingsFrame } from "../_components/settings-frame";
import { loadSettingsData } from "../_lib/data";

/**
 * Security (designs/settings/security/security.png) — session timeout (bound
 * to updateSecurityPrefs) plus a fully functional TOTP two-factor
 * authentication flow (Google Authenticator / Authy / 1Password etc.) and a
 * read-only preview of upcoming SSO.
 */
export const dynamic = "force-dynamic";

const TIMEOUTS: Array<[string, string]> = [
  ["15", "After 15 minutes of inactivity"],
  ["30", "After 30 minutes of inactivity"],
  ["60", "After 1 hour of inactivity"],
  ["120", "After 2 hours of inactivity"],
  ["480", "After 8 hours of inactivity"],
];

const TOTP_ERROR_MESSAGES: Record<string, string> = {
  invalid_code: "That code didn't match. Check your authenticator app and try again.",
  rate_limited: "Too many attempts — wait a few minutes and try again.",
  no_setup: "Setup expired — start again below.",
};

const TOTP_SUCCESS_MESSAGES: Record<string, string> = {
  enabled: "Two-factor authentication is on. Save your backup codes somewhere safe.",
  disabled: "Two-factor authentication has been turned off.",
  codes_regenerated: "New backup codes generated — your old codes no longer work.",
};

/** Groups of 4 for readability: "ABCDEFGHIJ..." -> "ABCD EFGH IJ..." */
function formatSecretForDisplay(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

export default async function SecuritySettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ totp_error?: string; totp?: string }>;
}) {
  const [{ settingsObj }, ctx, sp] = await Promise.all([
    loadSettingsData(),
    getOrgContext(),
    searchParams,
  ]);
  const sessionTimeoutMinutes = settingsObj.security?.sessionTimeoutMinutes ?? 30;

  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { email: true, totpEnabled: true, totpSecret: true, totpBackupCodes: true },
  });

  const totpError = sp.totp_error ? (TOTP_ERROR_MESSAGES[sp.totp_error] ?? null) : null;
  const totpSuccess = sp.totp ? (TOTP_SUCCESS_MESSAGES[sp.totp] ?? null) : null;
  const revealedBackupCodes = (await cookies()).get(NEW_2FA_BACKUP_CODES_COOKIE)?.value;

  const isPendingSetup = !user?.totpEnabled && !!user?.totpSecret;
  let qrDataUrl: string | null = null;
  let manualKey: string | null = null;
  if (isPendingSetup && user?.totpSecret && user.email) {
    const secret = decryptTotpSecret(user.totpSecret, ctx.userId);
    const uri = buildOtpAuthUri(secret, user.email);
    qrDataUrl = await QRCode.toDataURL(uri, { errorCorrectionLevel: "M", margin: 1, width: 200 });
    manualKey = formatSecretForDisplay(secret);
  }

  return (
    <SettingsFrame>
      <section className="set-card">
        <div className="set-sec-head" style={{ alignItems: "center" }}>
          <span className="set-tile set-tile--sm set-tile--emerald">
            <Icon name="lock" size={16} />
        </span>
        <div style={{ flex: 1 }}>
          <h2 className="set-card__title set-card__title--sm">Security</h2>
          <p className="set-card__sub">Access, sessions and sign-in protection.</p>
        </div>
        <span className={`set-pill ${user?.totpEnabled ? "set-pill--ok" : "set-pill--muted"}`}>
          <span className="set-pill__dot" />
          {user?.totpEnabled ? "Strong" : "Basic"}
        </span>
      </div>

      <form action={updateSecurityPrefs} style={{ marginTop: 18 }}>
        <label className="set-field" style={{ maxWidth: 420 }}>
          <span className="set-field__label">Session timeout</span>
          <select
            className="set-select"
            name="sessionTimeoutMinutes"
            defaultValue={String(sessionTimeoutMinutes)}
          >
            {TIMEOUTS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <span className="set-field__hint">
            Saved to your workspace now. Active enforcement of the timeout ships with the Phase 0
            session-policy update.
          </span>
        </label>
        <div className="set-actions">
          <button type="submit" className="set-btn set-btn--primary">
            <Icon name="check" size={16} className="set-btn__ic" />
            Save security settings
          </button>
        </div>
      </form>

      <div className="set-sep" />

      {/* ── Two-factor authentication ─────────────────────────────────── */}
      <div className="set-sec-head" style={{ alignItems: "center", marginBottom: 4 }}>
        <span className="set-tile set-tile--sm" style={{ background: "#f1f5f9", color: "var(--set-mut)" }}>
          <Icon name="smartphone" size={16} />
        </span>
        <div style={{ flex: 1 }}>
          <div className="set-export-row__title" style={{ fontSize: 15 }}>
            Two-factor authentication
          </div>
          <div className="set-export-row__note">
            Use Google Authenticator, Authy, or any TOTP app as a second sign-in step.
          </div>
        </div>
        {user?.totpEnabled ? (
          <span className="set-pill set-pill--ok">
            <Icon name="checkCircle" size={12} />
            Enabled
          </span>
        ) : (
          <span className="set-pill set-pill--muted">Off</span>
        )}
      </div>

      {totpError && (
        <div className="set-callout set-callout--danger" style={{ marginTop: 14 }}>
          <Icon name="alert" size={16} className="set-callout__ic" />
          <span>{totpError}</span>
        </div>
      )}
      {totpSuccess && !totpError && (
        <div className="set-callout set-callout--success" style={{ marginTop: 14 }}>
          <Icon name="checkCircle" size={16} className="set-callout__ic" />
          <span>{totpSuccess}</span>
        </div>
      )}

      {revealedBackupCodes && user?.totpEnabled && (
        <div style={{ marginTop: 14 }}>
          <div className="set-callout set-callout--danger" style={{ marginBottom: 10 }}>
            <Icon name="alert" size={16} className="set-callout__ic" />
            <span>
              <strong>Save these backup codes now.</strong> Each one signs you in once if you lose
              your authenticator. They won&apos;t be shown again.
            </span>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
              gap: 8,
              padding: 14,
              borderRadius: 10,
              background: "#f8fafc",
              border: "1px solid var(--set-line)",
              fontFamily: "var(--f-mono, monospace)",
              fontSize: 13,
            }}
          >
            {revealedBackupCodes.split(",").map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
        </div>
      )}

      {!user?.totpEnabled && !isPendingSetup && (
        <div className="set-export-row" style={{ marginTop: 14 }}>
          <div className="set-export-row__info">
            <div>
              <div className="set-export-row__title" style={{ fontSize: 13.5 }}>
                Not enabled
              </div>
              <div className="set-export-row__note">
                Protects your account even if your password (or email access) is compromised.
              </div>
            </div>
          </div>
          <form action={startTotpSetup}>
            <button type="submit" className="set-btn set-btn--primary set-btn--sm">
              <Icon name="lock" size={14} className="set-btn__ic" />
              Enable 2FA
            </button>
          </form>
        </div>
      )}

      {isPendingSetup && qrDataUrl && manualKey && (
        <div className="set-export-row" style={{ marginTop: 14, flexDirection: "column", alignItems: "stretch" }}>
          <div className="set-export-row__title" style={{ fontSize: 13.5, marginBottom: 10 }}>
            Scan this with your authenticator app
          </div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
            {/* biome-ignore lint/performance/noImgElement: server-rendered data: URI, not a static asset */}
            <img
              src={qrDataUrl}
              alt="Scan with your authenticator app"
              width={160}
              height={160}
              style={{ borderRadius: 10, border: "1px solid var(--set-line)", flexShrink: 0 }}
            />
            <div style={{ flex: 1, minWidth: 220 }}>
              <div className="set-dl__label">Can&apos;t scan? Enter this key manually</div>
              <code
                style={{
                  display: "block",
                  marginTop: 6,
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: "#f8fafc",
                  border: "1px solid var(--set-line)",
                  fontFamily: "var(--f-mono, monospace)",
                  fontSize: 13,
                  wordBreak: "break-all",
                }}
              >
                {manualKey}
              </code>

              <form action={confirmTotpSetup} style={{ marginTop: 14 }}>
                <label className="set-field">
                  <span className="set-field__label">Enter the 6-digit code from the app</span>
                  <input
                    type="text"
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="123456"
                    required
                    className="set-input"
                    style={{ maxWidth: 160, letterSpacing: 2, fontVariantNumeric: "tabular-nums" }}
                  />
                </label>
                <div className="set-actions" style={{ marginTop: 12, justifyContent: "flex-start" }}>
                  <button type="submit" className="set-btn set-btn--primary set-btn--sm">
                    <Icon name="check" size={14} className="set-btn__ic" />
                    Confirm and enable
                  </button>
                </div>
              </form>
              {/* A separate top-level <form> — nesting a form inside the
                  confirm form above isn't valid HTML. */}
              <form action={cancelTotpSetup} style={{ marginTop: -6 }}>
                <button type="submit" className="set-btn set-btn--sm">
                  Cancel setup
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {user?.totpEnabled && (
        <div className="set-export-row" style={{ marginTop: 14, flexDirection: "column", alignItems: "stretch", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div className="set-export-row__title" style={{ fontSize: 13.5 }}>
                Backup codes
              </div>
              <div className="set-export-row__note">
                {user.totpBackupCodes.length} unused code{user.totpBackupCodes.length === 1 ? "" : "s"}{" "}
                remaining. Regenerating invalidates the old ones.
              </div>
            </div>
          </div>

          <form action={regenerateBackupCodes} className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="text"
              name="code"
              inputMode="text"
              placeholder="Current code or backup code"
              required
              className="set-input"
              style={{ maxWidth: 220 }}
            />
            <button type="submit" className="set-btn set-btn--sm">
              <Icon name="refresh" size={14} className="set-btn__ic" />
              Regenerate backup codes
            </button>
          </form>

          <div className="set-sep" style={{ margin: "4px 0" }} />

          <div>
            <div className="set-export-row__title" style={{ fontSize: 13.5, color: "var(--set-red, #dc2626)" }}>
              Disable two-factor authentication
            </div>
            <div className="set-export-row__note">
              Your account goes back to sign-in-link-only protection.
            </div>
          </div>
          <form action={disableTotp} className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="text"
              name="code"
              inputMode="text"
              placeholder="Current code or backup code"
              required
              className="set-input"
              style={{ maxWidth: 220 }}
            />
            <button type="submit" className="set-btn set-btn--danger set-btn--sm">
              <Icon name="x" size={14} className="set-btn__ic" />
              Disable 2FA
            </button>
          </form>
        </div>
      )}

      <div className="set-sep" />

      <FeatureRow
        title="Single sign-on (SSO)"
        sub="Google Workspace + Microsoft 365 — included in the Scale plan."
        icon="users"
        status="plan_locked"
      />

        <div className="set-sep" />
        <div className="set-dl__label">Active sessions</div>
        <p className="set-dim" style={{ fontSize: 13, marginTop: 8 }}>
          Session management UI lands with WebAuthn admin policies (Phase 0).
        </p>
      </section>
    </SettingsFrame>
  );
}

/**
 * Plan-gated feature row. Deliberately NOT a toggle: SSO needs the Scale
 * plan, so a switch would be a dead control. Shows an explicit Upgrade link.
 */
function FeatureRow({
  title,
  sub,
  icon,
  status,
}: {
  title: string;
  sub: string;
  icon: "lock" | "users" | "clock";
  status: "coming_soon" | "plan_locked";
}) {
  return (
    <div
      className="set-export-row"
      style={{ marginTop: 0, marginBottom: 10, background: "#fbfcfe" }}
    >
      <div className="set-export-row__info">
        <span className="set-tile set-tile--sm" style={{ background: "#f1f5f9", color: "var(--set-mut)" }}>
          <Icon name={icon} size={16} />
        </span>
        <div>
          <div className="set-export-row__title" style={{ fontSize: 14 }}>
            {title}
          </div>
          <div className="set-export-row__note">{sub}</div>
        </div>
      </div>
      {status === "coming_soon" ? (
        <span className="set-pill set-pill--muted" title="This feature hasn't shipped yet">
          <Icon name="clock" size={12} />
          Coming soon
        </span>
      ) : (
        <a
          href="/subscription?feature=sso"
          className="set-pill set-pill--neutral"
          style={{ textDecoration: "none" }}
          title="SSO is included in the Scale plan"
        >
          <Icon name="lock" size={12} />
          Upgrade to Scale
        </a>
      )}
    </div>
  );
}
