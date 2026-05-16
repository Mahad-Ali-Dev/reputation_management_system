import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/with-tenant";
import { isTwilioConfigured, placeOutboundCall } from "@/lib/phone/twilio-client";
import { verifyCronRequest } from "@/lib/secrets";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/dispatch-outbound
 *
 * Runs every 1 minute. For each running campaign:
 *   1. Check if we're in the call window (timezone-aware)
 *   2. Pull up to `ratePerMinute` queued targets
 *   3. Call each via Twilio + update target status
 *
 * The webhook URL for these outbound calls is /api/voice/outbound — that
 * route serves TwiML with the campaign's `script` as the opening line, then
 * loops via the same /api/voice/respond used for inbound.
 *
 * Vercel cron config (add to vercel.json):
 *   { "path": "/api/cron/dispatch-outbound", "schedule": "* * * * *" }
 */
export async function GET(req: NextRequest) {
  // Fail-closed in production: verifyCronRequest throws if CRON_SECRET unset in prod.
  if (!verifyCronRequest(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!isTwilioConfigured()) {
    return NextResponse.json({ ok: true, skipped: "twilio_not_configured" });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL("/", req.url).origin;

  const runningCampaigns = await prisma.phoneCampaign.findMany({
    where: { status: "running" },
    include: {
      targets: {
        where: {
          status: "queued",
          scheduledFor: { lte: new Date() },
        },
      },
    },
    take: 100,
  });

  let totalDispatched = 0;
  let totalFailed = 0;

  for (const campaign of runningCampaigns) {
    if (!campaign.phoneNumberId) continue;

    // Resolve the from-number
    const phoneNumber = await prisma.phoneNumber.findUnique({
      where: { id: campaign.phoneNumberId },
      select: { phoneE164: true, organizationId: true },
    });
    if (!phoneNumber || phoneNumber.organizationId !== campaign.organizationId) continue;

    // Check call window — current time in the campaign's timezone
    const now = new Date();
    const inWindow = isInCallWindow(now, campaign.callWindowStart, campaign.callWindowEnd, campaign.callWindowTimezone, campaign.callWindowDays);
    if (!inWindow) continue;

    // Take up to ratePerMinute targets
    const batch = campaign.targets.slice(0, campaign.ratePerMinute);

    for (const target of batch) {
      try {
        // CRITICAL race-safe claim: only proceed if this worker is the one
        // that transitions queued → calling. Two parallel cron runs can read
        // the same `queued` rows; only one can win the conditional UPDATE.
        // TCPA risk if we double-dial.
        const claimed = await withTenant(campaign.organizationId, async (tx) =>
          tx.phoneCampaignTarget.updateMany({
            where: { id: target.id, status: "queued" },
            data: { status: "calling", attempts: { increment: 1 }, lastAttemptedAt: now },
          }),
        );
        if (claimed.count === 0) {
          // Already claimed by another cron tick — skip silently.
          continue;
        }

        const webhookUrl = `${appUrl}/api/voice/outbound?campaignId=${campaign.id}&targetId=${target.id}`;
        const statusUrl = `${appUrl}/api/voice/status`;

        const result = await placeOutboundCall({
          to: target.toE164,
          from: phoneNumber.phoneE164,
          webhookUrl,
          statusCallbackUrl: statusUrl,
          machineDetection: "Enable",
        });

        // Record the call
        await withTenant(campaign.organizationId, async (tx) => {
          const phoneCall = await tx.phoneCall.create({
            data: {
              organizationId: campaign.organizationId,
              phoneNumberId: campaign.phoneNumberId,
              twilioCallSid: result.callSid,
              fromE164: phoneNumber.phoneE164,
              toE164: target.toE164,
              direction: "outbound",
              status: result.status === "queued" ? "ringing" : result.status,
            },
          });
          await tx.phoneCampaignTarget.update({
            where: { id: target.id },
            data: { callId: phoneCall.id },
          });
        });

        totalDispatched++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await withTenant(campaign.organizationId, async (tx) => {
          await tx.phoneCampaignTarget.update({
            where: { id: target.id },
            data: { status: "failed", failureReason: msg },
          });
          await tx.phoneCampaign.update({
            where: { id: campaign.id },
            data: { failedTargets: { increment: 1 } },
          });
        });
        totalFailed++;
        logger.error({ event: "phone.outbound.dispatch_failed", campaignId: campaign.id, targetId: target.id, error: msg });
      }
    }

    // Check if campaign is done
    const remaining = await prisma.phoneCampaignTarget.count({
      where: { campaignId: campaign.id, status: "queued" },
    });
    if (remaining === 0) {
      await withTenant(campaign.organizationId, async (tx) => {
        await tx.phoneCampaign.update({
          where: { id: campaign.id },
          data: { status: "completed", completedAt: new Date() },
        });
      });
    }
  }

  return NextResponse.json({ ok: true, dispatched: totalDispatched, failed: totalFailed });
}

/**
 * Check whether the current time is within the campaign's allowed call window.
 *
 * For simplicity we compare in the campaign's local timezone string. This is
 * not bulletproof for DST edge cases but covers 99% of business hours.
 */
function isInCallWindow(
  now: Date,
  windowStart: Date,
  windowEnd: Date,
  timezone: string,
  days: string[],
): boolean {
  const localHourMin = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  });
  const localDay = now
    .toLocaleString("en-US", { weekday: "short", timeZone: timezone })
    .toLowerCase();

  if (!days.includes(localDay)) return false;

  const [curH, curM] = localHourMin.split(":").map((s) => parseInt(s, 10));
  const startH = windowStart.getUTCHours();
  const startM = windowStart.getUTCMinutes();
  const endH = windowEnd.getUTCHours();
  const endM = windowEnd.getUTCMinutes();

  const curMin = (curH ?? 0) * 60 + (curM ?? 0);
  const startMin = startH * 60 + startM;
  const endMin = endH * 60 + endM;
  return curMin >= startMin && curMin <= endMin;
}
