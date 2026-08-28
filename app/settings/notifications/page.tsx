import { Icon } from "@/components/shell/icon";
import { updateNotificationPrefs } from "@/lib/account/actions";
import { NOTIFICATION_EVENTS } from "@/lib/account/constants";
import { SettingsFrame } from "../_components/settings-frame";
import { loadSettingsData } from "../_lib/data";

/**
 * Notifications (designs/settings/notification/notifications.png).
 *
 * Per-event email / in-app preference matrix with kit icon tiles per event.
 * Bound to the existing updateNotificationPrefs server action; single Save
 * posts the whole matrix.
 */
export const dynamic = "force-dynamic";

const ASSET = "/assets/repulabs/settings";

/** Kit tile art + tint per notification event key (matches the mockup rows). */
const EVENT_ART: Record<string, { art: string; tint: string }> = {
  new_review: { art: `${ASSET}/notif-new-review.svg`, tint: "set-tile--indigo" },
  negative_review: { art: `${ASSET}/notif-negative.svg`, tint: "set-tile--red" },
  weekly_report: { art: `${ASSET}/notif-weekly.svg`, tint: "set-tile--emerald" },
  campaign_completed: { art: `${ASSET}/notif-campaign.svg`, tint: "set-tile--amber" },
  survey_response: { art: `${ASSET}/notif-survey.svg`, tint: "set-tile--blue" },
  teammate_joined: { art: `${ASSET}/notif-teammate.svg`, tint: "set-tile--teal" },
  review_request_clicked: { art: `${ASSET}/notif-campaign.svg`, tint: "set-tile--violet" },
};

export default async function NotificationsSettingsPage() {
  const { settingsObj } = await loadSettingsData();
  const savedNotifications = settingsObj.notifications ?? {};

  return (
    <SettingsFrame>
      <section className="set-card">
        <h2 className="set-card__title">Notifications</h2>
      <p className="set-card__sub">Choose what we tell you about, and where.</p>

      <form action={updateNotificationPrefs}>
        <table className="set-ntable">
          <thead>
            <tr>
              <th>Event</th>
              <th className="set-col-c">Email</th>
              <th className="set-col-c">In-app</th>
            </tr>
          </thead>
          <tbody>
            {NOTIFICATION_EVENTS.map((ev) => {
              const pref = savedNotifications[ev.key] ?? {};
              const art = EVENT_ART[ev.key] ?? {
                art: `${ASSET}/notif-new-review.svg`,
                tint: "set-tile--indigo",
              };
              return (
                <tr key={ev.key}>
                  <td>
                    <div className="set-nrow">
                      <span className={`set-tile ${art.tint}`}>
                        {/* biome-ignore lint/a11y/useAltText: decorative event art */}
                        <img src={art.art} alt="" aria-hidden="true" />
                      </span>
                      <div>
                        <div className="set-nrow__title">{ev.label}</div>
                        <div className="set-nrow__desc">{ev.sub}</div>
                      </div>
                    </div>
                  </td>
                  <td className="set-col-c">
                    <input
                      type="checkbox"
                      className="set-check"
                      name={`${ev.key}_email`}
                      defaultChecked={pref.email ?? true}
                      aria-label={`${ev.label} Email`}
                    />
                  </td>
                  <td className="set-col-c">
                    <input
                      type="checkbox"
                      className="set-check"
                      name={`${ev.key}_inApp`}
                      defaultChecked={pref.inApp ?? true}
                      aria-label={`${ev.label} In-app`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="set-actions">
          <button type="submit" className="set-btn set-btn--primary">
            <Icon name="check" size={16} className="set-btn__ic" />
            Save notifications
          </button>
        </div>
      </form>
      </section>
    </SettingsFrame>
  );
}
