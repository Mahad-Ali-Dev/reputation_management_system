import { auth } from "@/lib/auth/config";
import { isOrgEntitled } from "@/lib/billing/entitlements";
import { logger } from "@/lib/logger";
import { suggestReplies } from "@/lib/inbox/suggest";
import { checkRateLimit } from "@/lib/ratelimit";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/inbox/ai-suggest
 *
 * Return up to 3 AI-drafted reply options for an InboxThread. Authed via the app
 * session cookie. Paid feature → entitlement-gated (402 for free/lapsed orgs).
 * Rate-limited per org+user. The underlying `suggestReplies` is fail-soft and
 * never throws — it returns `{ options: [] }` with a reason when AI is
 * unconfigured / budget hit / thread missing, so the composer degrades gracefully.
 *
 * Body: { threadId, regenerate?: boolean, avoidTexts?: string[] }
 */

const Body = z.object({
  threadId: z.string().uuid(),
  avoidTexts: z.array(z.string().max(8000)).max(5).optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  const userId = session?.user?.id;
  if (!session || !orgId || !userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // AI Suggest is a paid feature — the service also enforces this, but a clean
  // 402 here lets the UI show the upgrade nudge without a generation attempt.
  if (!(await isOrgEntitled(orgId))) {
    return NextResponse.json(
      {
        options: [],
        error: "plan_inactive",
        message: "AI Suggest isn't included on your current plan. Upgrade in Settings → Subscription.",
      },
      { status: 402 },
    );
  }

  const rl = await checkRateLimit("ai_assistant", `${orgId}:${userId}`);
  if (!rl.success) {
    return NextResponse.json(
      { options: [], error: "rate_limited", retryAfterSeconds: rl.retryAfterSeconds },
      { status: 429 },
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ options: [], error: "invalid_body" }, { status: 400 });
  }

  try {
    const result = await suggestReplies({
      orgId,
      threadId: parsed.data.threadId,
      avoidTexts: parsed.data.avoidTexts,
    });
    return NextResponse.json({ options: result.options, reason: result.reason ?? "ok" });
  } catch (err) {
    // Defensive — suggestReplies is fail-soft, but never 500 the composer.
    logger.warn({
      orgId,
      threadId: parsed.data.threadId,
      error: err instanceof Error ? err.message : String(err),
      event: "inbox.api.ai_suggest.failed",
    });
    return NextResponse.json({ options: [], reason: "error" });
  }
}
