import { Resend } from "resend";
import { prisma } from "@/lib/db/client";
import { logger } from "@/lib/logger";
import { getCronSecret, verifyCronRequest } from "@/lib/secrets";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/picker-reminder
 *
 * Runs hourly. Sends a single follow-up email to each Airbnb guest who:
 *   1. Tapped the multi-platform picker QR and opted in (gave us their email)
 *   2. Chose `airbnb` as their target platform
 *   3. Tapped between 22h and 30h ago (window centered on 24h, with buffer
 *      for hourly-cron jitter and the inevitable Resend queue lag)
 *   4. Has not been emailed yet (reminder_sent_at IS NULL)
 *
 * Compliance posture (Airbnb policy):
 *   - We intentionally do NOT ask for "a 5-star review" or coach the
 *     guest on rating. The email says "how was your stay" and includes
 *     a direct link back to the listing — that's it. Airbnb's host
 *     guidelines prohibit incentivized or rating-coercive solicitation.
 *   - The link goes to the listing URL. If the guest is logged in to
 *     Airbnb on the device they open the email on AND they have an
 *     unwritten review for that listing, Airbnb's universal-link logic
 *     deep-links them to the review form. If not, they land on the
 *     listing page itself.
 *
 * Schedule (vercel.json): every 1 hour at :03 (avoid the on-the-hour rush).
 */
export async function GET(req: NextRequest) {
  const headerOk = verifyCronRequest(req.headers.get("authorization"));
  const cronSecret = getCronSecret();
  const queryOk = cronSecret !== null && req.nextUrl.searchParams.get("key") === cronSecret;
  if (!headerOk && !queryOk) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();
  try {
    const summary = await sendDueReminders();
    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - t0,
      ...summary,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ error, event: "cron.picker_reminder.failed" });
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}

// =========================================================================
// Core
// =========================================================================

interface SendSummary {
  candidatesFound: number;
  sent: number;
  skipped: number;
  failed: number;
}

async function sendDueReminders(): Promise<SendSummary> {
  // Window: 22h..30h ago. Wider than 24h ± 1h so a delayed cron run
  // doesn't miss anyone, but bounded so we don't email people who
  // tapped the picker last month (a guest who didn't get the reminder
  // in the first ~30h probably moved on; emailing them later feels off).
  const now = Date.now();
  const windowEnd = new Date(now - 22 * 60 * 60 * 1000);
  const windowStart = new Date(now - 30 * 60 * 60 * 1000);

  const candidates = await prisma.reviewPlatformChoice.findMany({
    where: {
      platform: "airbnb",
      reminderSentAt: null,
      guestEmail: { not: null },
      chosenAt: { gte: windowStart, lte: windowEnd },
    },
    select: {
      id: true,
      guestEmail: true,
      organizationId: true,
      establishment: {
        select: { name: true, airbnbListingUrl: true },
      },
    },
    orderBy: { chosenAt: "asc" },
    // 200 per cron run is plenty for ~50 hosts. Caps blast radius if
    // the migration accidentally selects the wrong window.
    take: 200,
  });

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    logger.warn({ event: "cron.picker_reminder.no_resend_key" });
    return { candidatesFound: candidates.length, sent: 0, skipped: candidates.length, failed: 0 };
  }
  const resend = new Resend(resendKey);
  const fromAddress = process.env.EMAIL_FROM ?? "bookings@repulabs.com";

  for (const c of candidates) {
    // Defensive: skip rows where the establishment has gone missing or
    // never had a listing URL to deep-link to. We don't email a "thanks
    // for staying!" without a working call-to-action.
    if (!c.guestEmail || !c.establishment?.airbnbListingUrl || !c.establishment?.name) {
      skipped++;
      continue;
    }

    const subject = `Hope you enjoyed your stay at ${c.establishment.name}`;
    const html = buildReminderHtml({
      listingName: c.establishment.name,
      listingUrl: c.establishment.airbnbListingUrl,
    });
    const text = buildReminderText({
      listingName: c.establishment.name,
      listingUrl: c.establishment.airbnbListingUrl,
    });

    try {
      const { data, error } = await resend.emails.send({
        from: fromAddress,
        to: c.guestEmail,
        subject,
        html,
        text,
        // We do NOT set a List-Unsubscribe header here — this is a
        // single transactional send tied to an explicit opt-in (the
        // guest entered their email on the picker page). Adding LU
        // would imply this is a marketing list, which it isn't.
      });
      if (error || !data?.id) {
        failed++;
        logger.warn(
          {
            choiceId: c.id,
            organizationId: c.organizationId,
            err: error?.message ?? "resend_no_id",
            event: "cron.picker_reminder.send_failed",
          },
          "picker reminder send failed",
        );
        // Don't mark as sent — let the next cron tick try again
        // (until the row falls out of the 30h window).
        continue;
      }
      // Atomically mark sent. We do this AFTER Resend confirms, so a
      // network blip never makes us forget who got the email.
      await prisma.reviewPlatformChoice.update({
        where: { id: c.id },
        data: { reminderSentAt: new Date() },
      });
      sent++;
    } catch (err) {
      failed++;
      logger.warn(
        {
          choiceId: c.id,
          err: err instanceof Error ? err.message : String(err),
          event: "cron.picker_reminder.exception",
        },
        "picker reminder threw",
      );
    }
  }

  logger.info(
    {
      event: "cron.picker_reminder.batch",
      candidates: candidates.length,
      sent,
      skipped,
      failed,
    },
    "picker reminder batch complete",
  );

  return { candidatesFound: candidates.length, sent, skipped, failed };
}

// =========================================================================
// Email body — deliberately mild (compliance with Airbnb's no-coercion policy)
// =========================================================================

function buildReminderHtml(args: { listingName: string; listingUrl: string }): string {
  const safeName = args.listingName.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!doctype html>
<html lang="en"><body style="margin:0;padding:0;background:#f6f7f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f6f7f4;padding:24px 12px;">
  <tr><td align="center">
    <table cellpadding="0" cellspacing="0" border="0" width="520" style="max-width:520px;background:#ffffff;border:1px solid #eceeea;border-radius:14px;">
      <tr><td style="padding:28px;font-size:15px;line-height:1.6;color:#0b0d0e;">
        <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;letter-spacing:-0.01em;">Hope you enjoyed your stay</h1>
        <p style="margin:0 0 14px;">Thanks for staying at <strong>${safeName}</strong>. If you have a minute, your host would love to hear how the trip went.</p>
        <p style="margin:0 0 22px;">
          <a href="${args.listingUrl}" style="display:inline-block;background:#0b0d0e;color:#fff;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:500;font-size:14px;">Open the listing on Airbnb</a>
        </p>
        <p style="margin:0;font-size:13px;color:#64748b;">You're getting this because you tapped the welcome card at the property and asked for a reminder. We won't email you again about this stay.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function buildReminderText(args: { listingName: string; listingUrl: string }): string {
  return [
    "Hope you enjoyed your stay",
    "",
    `Thanks for staying at ${args.listingName}. If you have a minute, your host would love to hear how the trip went.`,
    "",
    `Open the listing on Airbnb: ${args.listingUrl}`,
    "",
    "You're getting this because you tapped the welcome card at the property and asked for a reminder. We won't email you again about this stay.",
  ].join("\n");
}
