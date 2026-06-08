import { auth } from "@/lib/auth/config";
import { getThreadWithMessages, listThreads } from "@/lib/inbox/queries";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/inbox/poll
 *
 * Lightweight polling endpoint backing the Conversations real-time hook. Authed
 * via the app session cookie (same-origin app fetch, NOT the widget JWT). Returns
 * the (re-filtered) thread list + the active thread's messages newer than
 * `since`. Bounded + cheap; fail-soft (empty on not-migrated).
 *
 * Query: ?thread=&channel=&status=&q=&since=
 *   - `since` (ISO) limits the active thread's messages to deltas only.
 */

export async function GET(req: NextRequest) {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  if (!session || !orgId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const threadId = sp.get("thread") ?? undefined;
  const channel = sp.get("channel") ?? undefined;
  const status = sp.get("status") ?? undefined;
  const q = sp.get("q") ?? undefined;
  const since = sp.get("since") ?? undefined;

  const [threads, active] = await Promise.all([
    listThreads({ orgId, channel, status, q, take: 100 }),
    threadId ? getThreadWithMessages({ orgId, threadId, since }) : Promise.resolve(null),
  ]);

  return NextResponse.json(
    {
      threads,
      active: active
        ? { thread: active.thread, messages: active.messages }
        : null,
      polledAt: new Date().toISOString(),
    },
    {
      // Never cache poll responses.
      headers: { "Cache-Control": "no-store" },
    },
  );
}
