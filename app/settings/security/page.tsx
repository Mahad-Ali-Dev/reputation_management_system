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
          sub="Coming in Phase 0 — WebAuthn passkeys + TOTP fallback"
          icon="lock"
        />
        <ToggleRowDisplay
          title="Single sign-on (SSO)"
          sub="Google Workspace + Microsoft 365 — available on Scale"
          icon="users"
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

function ToggleRowDisplay({
  title,
  sub,
  icon,
  on,
}: {
  title: string;
  sub: string;
  icon: "lock" | "users" | "clock";
  on?: boolean;
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
          background: on ? "var(--pri-50)" : "var(--surface-3)",
          color: on ? "var(--pri)" : "var(--rl-muted)",
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
      <span className={`tg${on ? " is-on" : ""}`} aria-hidden="true" />
    </div>
  );
}
