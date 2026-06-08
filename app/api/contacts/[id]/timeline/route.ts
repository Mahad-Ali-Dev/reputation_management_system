import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { getContactById } from "@/lib/contacts/queries";
import { getContactTimeline } from "@/lib/contacts/timeline";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/contacts/{id}/timeline?cursor=&take=
 *
 * Backs the contact-profile "Load more" button. Returns one cursor page of the
 * merged Activity Timeline for the contact (reviews, requests, surveys, inbox
 * messages, social, live-chat, phone + directory events), keyed on the contact's
 * email/phone/name.
 *
 * Auth: requires a logged-in session; this is an XHR endpoint so it returns 401
 * (not a redirect). Tenant-scoped: a contact in another org returns 404.
 * Fail-soft: a source error yields an empty page, never a 500.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  if (!session || !orgId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // Basic UUID guard so a malformed id is a clean 400, not a DB error.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const contact = await getContactById({ orgId, id });
  if (!contact) {
    return NextResponse.json({ error: "contact_not_found" }, { status: 404 });
  }

  const cursor = req.nextUrl.searchParams.get("cursor");
  const takeRaw = req.nextUrl.searchParams.get("take");
  const take = takeRaw ? Math.min(Math.max(Number.parseInt(takeRaw, 10) || 20, 1), 100) : 20;

  try {
    const page = await getContactTimeline({
      orgId,
      contact: {
        id: contact.id,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
      },
      cursor,
      take,
    });
    return NextResponse.json(page);
  } catch (err) {
    // getContactTimeline is already fail-soft, but never leak a 500 from here.
    logger.warn({
      event: "contacts.timeline_route.failed",
      orgId,
      contactId: id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ events: [], nextCursor: null });
  }
}
