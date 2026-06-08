import { auth } from "@/lib/auth/config";
import { roleAtLeast } from "@/lib/auth/rbac";
import { logger } from "@/lib/logger";
import { assignThread } from "@/lib/inbox/conversations";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/inbox/assign
 *
 * Assign (or unassign) an InboxThread to a teammate. Authed via session cookie;
 * content write → `manager`.
 *
 * Body: { threadId, assigneeId | null }
 *   - `assigneeId: null` (or "me" resolved client-side) unassigns.
 */

const Body = z.object({
  threadId: z.string().uuid(),
  assigneeId: z.string().uuid().nullable(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  const userId = session?.user?.id;
  if (!session || !orgId || !userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!roleAtLeast((session as { role?: string }).role, "manager")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const ok = await assignThread({
      orgId,
      threadId: parsed.data.threadId,
      assigneeId: parsed.data.assigneeId,
    });
    if (!ok) return NextResponse.json({ error: "thread_not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, assigneeId: parsed.data.assigneeId });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ orgId, error, event: "inbox.api.assign.failed" });
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
