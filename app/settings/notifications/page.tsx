import { Icon } from "@/components/shell/icon";
import { updateNotificationPrefs } from "@/lib/account/actions";
import { NOTIFICATION_EVENTS } from "@/lib/account/constants";
import { loadSettingsData } from "../_lib/data";

/**
 * Notifications — per-event email / in-app preference matrix. Bound to the
 * existing updateNotificationPrefs server action.
 */
export const dynamic = "force-dynamic";

export default async function NotificationsSettingsPage() {
  const { settingsObj } = await loadSettingsData();
  const savedNotifications = settingsObj.notifications ?? {};

  return (
    <section className="ds-card">
      <div className="ds-card__head">
        <div>
          <h3 className="ds-card__title">Notifications</h3>
          <div className="ds-card__sub">Choose what we tell you about, and where</div>
        </div>
      </div>
      <div className="ds-card__body">
        <form action={updateNotificationPrefs}>
          <table className="tbl tbl--compact">
            <thead>
              <tr>
                <th style={{ paddingLeft: 4 }}>Event</th>
                <th style={{ textAlign: "center", width: 90 }}>Email</th>
                <th style={{ textAlign: "center", width: 90 }}>In-app</th>
              </tr>
            </thead>
            <tbody>
              {NOTIFICATION_EVENTS.map((ev) => {
                const pref = savedNotifications[ev.key] ?? {};
                return (
                  <tr key={ev.key}>
                    <td style={{ paddingLeft: 4 }}>
                      <div style={{ fontWeight: 500 }}>{ev.label}</div>
                      <div className="dim" style={{ fontSize: 11 }}>
                        {ev.sub}
                      </div>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        name={`${ev.key}_email`}
                        defaultChecked={pref.email ?? true}
                        aria-label={`${ev.label} — email`}
                        style={{ width: 16, height: 16, accentColor: "var(--pri)" }}
                      />
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        name={`${ev.key}_inApp`}
                        defaultChecked={pref.inApp ?? true}
                        aria-label={`${ev.label} — in-app`}
                        style={{ width: 16, height: 16, accentColor: "var(--pri)" }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="row" style={{ marginTop: 14, justifyContent: "flex-end" }}>
            <button type="submit" className="btn btn--pri">
              <Icon name="check" size={12} />
              Save notifications
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
