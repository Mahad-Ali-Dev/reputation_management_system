import { resolveSessionOrg } from "@/lib/auth/active-org";
import { roleAtLeast } from "@/lib/auth/rbac";
import { blockThreadParticipant, setThreadStatus } from "@/lib/inbox/conversations";
import { logger } from "@/lib/logger";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/inbox/status
 *
 * Set an InboxThread's status (Open ↔ Resolved, snoozed, spam) or block its
 * participant. Authed via session cookie; content write → `manager`.
 *
 * Body: { threadId, status }  — status ∈ open|resolved|snoozed|spam|blocked
 *   ("blocked" maps to blockThreadParticipant; everything else to setThreadStatus)
 */

const Body = z.object({
  threadId: z.string().uuid(),
  status: z.enum(["open", "resolved", "snoozed", "spam", "blocked"]),
});

export async function POST(req: NextRequest) {
  const sessionOrg = await resolveSessionOrg();
  if (!sessionOrg) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { orgId } = sessionOrg;
  if (!roleAtLeast(sessionOrg.role, "manager")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const ok =
      parsed.data.status === "blocked"
        ? await blockThreadParticipant({ orgId, threadId: parsed.data.threadId })
        : await setThreadStatus({
            orgId,
            threadId: parsed.data.threadId,
            status: parsed.data.status,
          });
    if (!ok) return NextResponse.json({ error: "thread_not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, status: parsed.data.status });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ orgId, error, event: "inbox.api.status.failed" });
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
