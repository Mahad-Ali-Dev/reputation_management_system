"use server";

/**
 * Meeting-request queue — SERVER ACTIONS (Module 09 — Inbox).
 *
 * The /support/meetings page lists meeting/appointment requests captured by the
 * public chat widget and lets a manager move each one through the workflow:
 *   new → contacted → scheduled | declined
 *
 * RBAC-gated (manager+), org-scoped via withTenant (RLS), and fail-soft so a
 * not-yet-migrated meeting_requests table is a no-op rather than a 500.
 */

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import { withTenant } from "@/lib/db/with-tenant";
import { softInbox } from "@/lib/inbox/fail-soft";
import { MEETING_STATUSES } from "./constants";

const STATUS_SET = new Set<string>(MEETING_STATUSES);

/**
 * Move a meeting request to a new status. The actor is recorded on
 * `handledByUserId` so the queue can show who actioned it. `updateMany` keys on
 * the id; RLS already scopes the row to the caller's org, so a cross-tenant id
 * matches zero rows (no error, no leak).
 */
export async function updateMeetingRequestStatus(form: FormData): Promise<void> {
  const { orgId, userId } = await requireRole("manager");

  const id = String(form.get("id") ?? "").trim();
  const status = String(form.get("status") ?? "").trim();
  if (!id || !STATUS_SET.has(status)) return;

  await softInbox(
    () =>
      withTenant(orgId, async (tx) =>
        tx.meetingRequest.updateMany({
          where: { id },
          data: { status, handledByUserId: userId },
        }),
      ),
    null,
    { event: "inbox.meeting_request.update_failed", context: { orgId, id, status } },
  );

  // The queue now lives in the unified workspace ("Meeting requests" view);
  // revalidate both the new home and the legacy path (kept as a redirect).
  revalidatePath("/support");
  revalidatePath("/support/meetings");
}
