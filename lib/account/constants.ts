/**
 * Plain constants shared by the account server actions and the settings page.
 *
 * These live OUTSIDE lib/account/actions.ts because that file is `"use server"`,
 * where only async functions may be exported. Importing constants into a
 * "use server" file is fine — exporting non-functions from one is not.
 */

/** Notification events the user can opt in/out of (Account → Notifications). */
export const NOTIFICATION_EVENTS = [
  {
    key: "new_review",
    label: "New review",
    sub: "When a new review lands on any connected platform",
  },
  { key: "negative_review", label: "Negative review", sub: "When a review is 3 stars or lower" },
  { key: "weekly_report", label: "Weekly summary", sub: "Your reputation digest, every Monday" },
  {
    key: "campaign_completed",
    label: "Campaign completed",
    sub: "When a review-request campaign finishes sending",
  },
  {
    key: "survey_response",
    label: "New survey response",
    sub: "When a customer completes one of your surveys",
  },
  { key: "teammate_joined", label: "Teammate joined", sub: "When someone accepts a team invite" },
] as const;

/** Cookie used to surface a freshly generated API key exactly once (then it expires). */
export const NEW_API_KEY_COOKIE = "rl_new_api_key";
