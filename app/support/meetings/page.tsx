import { redirect } from "next/navigation";

/**
 * Legacy /support/meetings — folded into the unified inbox (Module 09).
 *
 * The meeting-request queue is now the "Meeting requests" view of /support
 * (rendered by <MeetingsPanel/> via the inbox shell). This route is kept as a
 * deep-link redirect so the sidebar entry, the public widget capture endpoint's
 * operator link, and old bookmarks all resolve into the unified workspace.
 *
 * Preserves the `?status=` filter (new | contacted | scheduled | declined) by
 * forwarding it into the tab. `./actions.ts` (updateMeetingRequestStatus) and
 * `./constants.ts` (MEETING_STATUSES) remain — <MeetingsPanel/> imports them.
 */
export const dynamic = "force-dynamic";

export default async function MeetingRequestsRedirect({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const status = sp.status?.trim();
  redirect(
    status ? `/support?tab=meetings&status=${encodeURIComponent(status)}` : "/support?tab=meetings",
  );
}
