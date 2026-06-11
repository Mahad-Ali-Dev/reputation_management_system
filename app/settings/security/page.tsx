import { Icon } from "@/components/shell/icon";
import { updateSecurityPrefs } from "@/lib/account/actions";
import { FormSelect } from "../_components/fields";
import { loadSettingsData } from "../_lib/data";

/**
 * Security — session timeout (bound to updateSecurityPrefs) plus read-only
 * previews of upcoming 2FA / SSO / session-management features.
 */
export const dynamic = "force-dynamic";

export default async function SecuritySettingsPage() {
  const { settingsObj } = await loadSettingsData();
  const sessionTimeoutMinutes = settingsObj.security?.sessionTimeoutMinutes ?? 30;

  return (
    <section className="ds-card">
      <div className="ds-card__head">
        <h3 className="ds-card__title">Security</h3>
        <span className="chip chip--ok">
          <Icon name="checkCircle" size={9} stroke={2.4} />
          Strong
        </span>
      </div>
      <div className="ds-card__body">
        <form action={updateSecurityPrefs}>
          <FormSelect
            label="Session timeout"
            name="sessionTimeoutMinutes"
            defaultValue={String(sessionTimeoutMinutes)}
            options={[
              ["15", "After 15 minutes of inactivity"],
              ["30", "After 30 minutes of inactivity"],
              ["60", "After 1 hour of inactivity"],
              ["120", "After 2 hours of inactivity"],
              ["480", "After 8 hours of inactivity"],
            ]}
          />
          <div className="dim" style={{ fontSize: 11, marginTop: 6 }}>
            Saved to your workspace now. Active enforcement of the timeout ships with the Phase 0
            session-policy update.
          </div>
          <div className="row" style={{ marginTop: 14, justifyContent: "flex-end" }}>
            <button type="submit" className="btn btn--pri">
              <Icon name="check" size={12} />
              Save security settings
            </button>
          </div>
        </form>
        <div className="divider" />
        <ToggleRowDisplay
          title="Two-factor authentication"
          sub="WebAuthn passkeys + TOTP fallback. Not released yet — we'll email you when it ships."
          icon="lock"
          status="coming_soon"
        />
        <ToggleRowDisplay
          title="Single sign-on (SSO)"
          sub="Google Workspace + Microsoft 365 — included in the Scale plan."
          icon="users"
          status="plan_locked"
        />
        <div className="divider" />
        <div className="lbl-mono">Active sessions</div>
        <div className="dim" style={{ fontSize: 12.5, padding: "10px 0" }}>
          Session management UI lands with WebAuthn admin policies (Phase 0).
        </div>
      </div>
    </section>
  );
}

/**
 * Upcoming/plan-gated feature row. Deliberately NOT a toggle: 2FA isn't
 * released yet and SSO needs the Scale plan, so a switch would be a dead
 * control (bug 001 in the June 2026 assessment). Shows an explicit status
 * chip — "Coming soon" or an Upgrade link — instead.
 */
function ToggleRowDisplay({
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
      className="row"
      style={{
        padding: 12,
        background: "var(--surface-2)",
        border: "1px solid var(--line)",
        borderRadius: 8,
        marginBottom: 6,
      }}
    >
      <span
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: "var(--surface-3)",
          color: "var(--rl-muted)",
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
      >
        <Icon name={icon} size={14} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 500 }}>{title}</div>
        <div className="dim" style={{ fontSize: 11 }}>
          {sub}
        </div>
      </div>
      {status === "coming_soon" ? (
        <span className="chip" title="This feature hasn't shipped yet">
          <Icon name="clock" size={9} stroke={2.4} />
          Coming soon
        </span>
      ) : (
        <a
          href="/subscription?feature=sso"
          className="chip chip--pri"
          style={{ textDecoration: "none" }}
          title="SSO is included in the Scale plan"
        >
          <Icon name="lock" size={9} stroke={2.4} />
          Upgrade to Scale
        </a>
      )}
    </div>
  );
}
