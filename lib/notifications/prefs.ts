import { prisma } from "@/lib/db/client";

/**
 * Notification preferences — read helper.
 *
 * Preferences are stored on `organization.settings.notifications` as
 *   { [eventKey]: { email: boolean, inApp: boolean } }
 * written by `updateNotificationPrefs` (lib/account/actions.ts). Event keys are
 * defined in NOTIFICATION_EVENTS there (new_review, negative_review,
 * weekly_report, campaign_completed, survey_response, teammate_joined).
 *
 * Senders call `notificationEnabled(orgId, eventKey, channel)` before sending so
 * the per-event toggles in Account → Notifications actually take effect. Default
 * is ENABLED when the org has never saved a preference (opt-out model).
 */

export type NotificationChannel = "email" | "inApp";

const DEFAULT_ENABLED = true;

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** True when the org wants this event on this channel (defaults to true). */
export async function notificationEnabled(
  orgId: string,
  eventKey: string,
  channel: NotificationChannel = "email",
): Promise<boolean> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { settings: true },
  });
  const settings = asObject(org?.settings);
  const notifications = asObject(settings?.notifications);
  const pref = asObject(notifications?.[eventKey]);
  if (!pref) return DEFAULT_ENABLED;
  const value = pref[channel];
  return typeof value === "boolean" ? value : DEFAULT_ENABLED;
}
