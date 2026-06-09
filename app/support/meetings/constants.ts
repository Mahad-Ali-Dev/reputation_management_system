/**
 * Plain constants for the meeting-request queue. Kept out of actions.ts because
 * that file is `"use server"` (only async functions may be exported from one).
 */

/** The states a meeting request can move into. */
export const MEETING_STATUSES = ["new", "contacted", "scheduled", "declined"] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];
