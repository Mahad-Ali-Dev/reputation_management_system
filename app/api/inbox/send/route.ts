import { auth } from "@/lib/auth/config";
import { roleAtLeast } from "@/lib/auth/rbac";
import { logger } from "@/lib/logger";
import { addInternalNote, sendMessage } from "@/lib/inbox/conversations";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/inbox/send
 *
 * Append a reply (or an internal note) to an InboxThread. Authed via the app
 * session cookie (NOT the widget JWT). Replying is a content write → requires at
 * least the `manager` role. Returns the created message for an optimistic UI
 * reconcile.
 *
 * Body:
 *   { threadId, body, kind?: "reply" | "note", aiSuggested? }
 */

const Body = z.object({
  threadId: z.string().uuid(),
  body: z.string().min(1).max(8000),
  kind: z.enum(["reply", "note"]).default("reply"),
  aiSuggested: z.string().max(8000).optional(),
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
    const msg =
      parsed.data.kind === "note"
        ? await addInternalNote({
            orgId,
            threadId: parsed.data.threadId,
            body: parsed.data.body,
            authorUserId: userId,
          })
        : await sendMessage({
            orgId,
            threadId: parsed.data.threadId,
            body: parsed.data.body,
            authorUserId: userId,
            aiSuggested: parsed.data.aiSuggested ?? null,
          });

    if (!msg) {
      return NextResponse.json({ error: "thread_not_found" }, { status: 404 });
    }
    return NextResponse.json({ message: msg, note: parsed.data.kind === "note" });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ orgId, error, event: "inbox.api.send.failed" });
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
