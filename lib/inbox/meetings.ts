/**
 * Meeting-request read helpers for the Unified Inbox (Module 09).
 *
 * The "Meeting requests" view folds the former `/support/meetings` queue into the
 * unified workspace. This helper backs the tab badge (count of NEW requests).
 *
 * Tenant-scoped (`withTenant` → RLS) and fail-soft: the meeting_requests table
 * ships via a manually-applied migration, so a not-yet-migrated DB degrades to 0
 * rather than 500-ing the inbox.
 */

import { withTenant } from "@/lib/db/with-tenant";
import { softInbox } from "./fail-soft";

/** Count of meeting requests still in the `new` status (drives the tab badge). */
export async function countNewMeetingRequests(orgId: string): Promise<number> {
  return softInbox(
    () =>
      withTenant(orgId, async (tx) =>
        tx.meetingRequest.count({ where: { status: "new" } }),
      ),
    0,
    { event: "inbox.countNewMeetings.failed", swallowAll: true, context: { orgId } },
  );
}
