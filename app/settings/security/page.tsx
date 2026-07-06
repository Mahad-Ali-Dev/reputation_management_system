import { Icon } from "@/components/shell/icon";
import { updateSecurityPrefs } from "@/lib/account/actions";
import { SettingsFrame } from "../_components/settings-frame";
import { loadSettingsData } from "../_lib/data";

/**
 * Security (designs/settings/security/security.png) — session timeout (bound to
 * updateSecurityPrefs) plus read-only previews of upcoming 2FA / SSO / session-
 * management features.
 */
export const dynamic = "force-dynamic";

const TIMEOUTS: Array<[string, string]> = [
  ["15", "After 15 minutes of inactivity"],
  ["30", "After 30 minutes of inactivity"],
  ["60", "After 1 hour of inactivity"],
  ["120", "After 2 hours of inactivity"],
  ["480", "After 8 hours of inactivity"],
];

export default async function SecuritySettingsPage() {
  const { settingsObj } = await loadSettingsData();
  const sessionTimeoutMinutes = settingsObj.security?.sessionTimeoutMinutes ?? 30;

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
        <span className="set-pill set-pill--ok">
          <span className="set-pill__dot" />
          Strong
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

      <FeatureRow
        title="Two-factor authentication"
        sub="WebAuthn passkeys + TOTP fallback. Not released yet — we'll email you when it ships."
        icon="lock"
        status="coming_soon"
      />
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
 * Upcoming/plan-gated feature row. Deliberately NOT a toggle: 2FA isn't
 * released yet and SSO needs the Scale plan, so a switch would be a dead
 * control. Shows an explicit status chip — "Coming soon" or an Upgrade link.
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
