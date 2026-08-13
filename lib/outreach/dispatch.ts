/**
 * Shared review-request sender (07_review_requests).
 *
 * Extracted out of `lib/outreach/actions.ts` so THREE callers converge on one
 * sender:
 *   1. the inline "Send Now" path in `createReviewRequest` (delay 0),
 *   2. the per-minute dispatch cron (`/api/cron/dispatch-review-requests`) for
 *      scheduled / bulk / automation-delayed rows,
 *   3. (future) any other enqueue path.
 *
 * ── FK CORRECTNESS (verifier fix #1) ──
 * `ReviewRequest.templateId` is a FK → `ReviewRequestTemplate` (a DIFFERENT model
 * than `OutreachTemplate`). We must NEVER persist an `OutreachTemplate.id` through
 * that relation. The Send tab + automation can choose an `OutreachTemplate` for
 * its body/subject/logo, but its id is passed to dispatch via an out-of-band
 * `outreachTemplateId` field — NOT written to `ReviewRequest.templateId`. Dispatch
 * hydrates the rendered content from `OutreachTemplate` at send time and leaves
 * `templateId` untouched (null unless a real `ReviewRequestTemplate.id` was set).
 *
 * ── MERGE TAGS (verifier fix #2) ──
 * Body/subject substitution uses the canonical double-brace resolver via
 * `lib/outreach/merge-tags.ts` (a thin wrapper over `@/lib/merge-tags`). No inline
 * `replaceAll` engine.
 *
 * Self-contained: given a `reviewRequestId` + `orgId`, it loads everything it
 * needs (request row, establishment, org, optional OutreachTemplate) so the cron
 * worker can call it with just the id.
 */

import { createHmac } from "node:crypto";
import { resolveBrandColorsFromSettings } from "@/lib/account/brand-colors";
import { withTenant } from "@/lib/db/with-tenant";
import { resolveBusinessReplyTo } from "@/lib/email/reply-to";
import { ctaButton, emailShell } from "@/lib/email/templates";
import { googleReviewUrl } from "@/lib/hardware/codes";
import { logger } from "@/lib/logger";
import { getHmacSecret } from "@/lib/secrets";
import { defaultReviewRequestHtml, sendReviewRequestEmail } from "./email";
import { formatAddress, resolveMergeTags } from "./merge-tags";
import { sendSms } from "./twilio";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/**
 * Optional pre-resolved overrides the inline Send-Now path can pass so dispatch
 * doesn't re-derive the link/business name (keeps existing behaviour identical).
 * The cron path passes nothing and dispatch derives all of it from the row.
 */
export type DispatchOverrides = {
  /** Final review link (the inline path already built a tracked link). */
  reviewLink?: string;
  /** Pre-built unsubscribe URL. */
  unsubscribeUrl?: string;
  /** Resolved business name. */
  businessName?: string;
  /** Raw custom body authored in the Send composer (double-brace tags). */
  customBody?: string;
  /**
   * An `OutreachTemplate.id` to hydrate body/subject/logo from. NOT a
   * `ReviewRequestTemplate.id`; never written to `ReviewRequest.templateId`.
   */
  outreachTemplateId?: string;
};

type SendOutcome = { dispatched: boolean; status: string; error?: string };

/**
 * Render + send a single review request, then update its status. Pure-ish: the
 * only side effects are the provider send + the row update (both tenant-scoped).
 *
 * Returns an outcome the cron can aggregate. Throws only on truly unexpected
 * errors (the provider failure path is captured as `{status:"failed"}`).
 */
export async function dispatchReviewRequest(
  reviewRequestId: string,
  orgId: string,
  overrides: DispatchOverrides = {},
): Promise<SendOutcome> {
  // Load the row + establishment + org in one tenant transaction.
  const loaded = await withTenant(orgId, async (tx) => {
    const found = await tx.reviewRequest.findUnique({
      where: { id: reviewRequestId },
      select: {
        id: true,
        channel: true,
        recipient: true,
        recipientName: true,
        shortSlug: true,
        establishmentId: true,
      },
    });
    if (!found) return null;
    const rr = found;
    const [estab, org] = await Promise.all([
      tx.establishment.findFirst({
        where: { id: rr.establishmentId },
        select: { id: true, name: true, googlePlaceId: true, address: true, imageUrl: true },
      }),
      tx.organization.findUnique({
        where: { id: orgId },
        select: { name: true, logoUrl: true, ownerEmail: true, settings: true },
      }),
    ]);
    // Hydrate an OutreachTemplate for body/subject/logo. Priority:
    //   1. an explicitly selected template (overrides.outreachTemplateId), else
    //   2. the org's DEFAULT template for this channel.
    // This makes scheduled / bulk / automation sends (which carry no inline
    // custom body) use the user's saved template content rather than only the
    // hardcoded fallback. We NEVER write this template id to ReviewRequest.
    // templateId (that FK is for ReviewRequestTemplate) — FK correctness.
    let template: {
      channel: string;
      subject: string | null;
      body: string;
      bodyHtml: string | null;
      logoUrl: string | null;
    } | null = null;
    const templateSelect = {
      channel: true,
      subject: true,
      body: true,
      bodyHtml: true,
      logoUrl: true,
    } as const;
    try {
      if (overrides.outreachTemplateId) {
        template = await tx.outreachTemplate.findFirst({
          where: { id: overrides.outreachTemplateId },
          select: templateSelect,
        });
      } else if (!overrides.customBody) {
        // Only fall back to a default template when there's no inline body.
        template = await tx.outreachTemplate.findFirst({
          where: { channel: found.channel, isDefault: true },
          select: templateSelect,
        });
      }
    } catch {
      // outreach_templates is long-existing, but stay resilient — a missing
      // template just means we use the built-in default body.
      template = null;
    }
    return { rr, estab, org, template };
  });

  if (!loaded) throw new Error("review_request_not_found");
  const { rr, estab, org, template } = loaded;

  const businessName = overrides.businessName ?? estab?.name ?? org?.name ?? "Your Business";
  const establishmentAddress = formatAddress(estab?.address);

  // Review link: prefer an explicit override, else the tracked `/r/{slug}`
  // redirect (app/r/[slug]/route.ts → lib/outreach/tracking.ts), which
  // resolves the actual destination — establishment.reviewLinkOverride if
  // the owner pasted one, else the Google-Place-Id link — AT CLICK TIME and
  // records it as the request's first click. `shortSlug` is set on every
  // insert path (enqueue.ts, bulk-actions.ts); the direct-URL fallback only
  // guards a legacy/malformed row that somehow has none.
  const reviewLink =
    overrides.reviewLink ??
    (rr.shortSlug
      ? `${APP_URL}/r/${rr.shortSlug}`
      : googleReviewUrl(estab?.googlePlaceId ?? null, businessName));
  const unsubscribeUrl =
    overrides.unsubscribeUrl ?? `${APP_URL}/u?${buildUnsubToken(orgId, rr.channel, rr.recipient)}`;

  const mergeCtx = {
    recipientName: rr.recipientName,
    businessName,
    reviewLink,
    establishmentAddress,
  };

  // Resolve the body: custom composer body > template body > built-in default.
  const rawBody = overrides.customBody ?? template?.body ?? null;

  // ── SMS ──
  if (rr.channel === "sms") {
    const body = rawBody
      ? resolveMergeTags(rawBody, mergeCtx)
      : `Hi${rr.recipientName ? ` ${rr.recipientName}` : ""}, thanks for choosing ${businessName}! We'd love your honest feedback: ${reviewLink}`;
    const result = await sendSms({ to: rr.recipient, body, isFirstMessage: true });
    return finalize(orgId, rr.id, result.ok, {
      providerMessageId: result.ok ? result.messageSid : undefined,
      error: result.ok ? undefined : result.error,
    });
  }

  // ── Email ──
  if (rr.channel === "email") {
    const subject = template?.subject
      ? resolveMergeTags(template.subject, mergeCtx)
      : `How was your experience at ${businessName}?`;
    const logoUrl = template?.logoUrl ?? estab?.imageUrl ?? org?.logoUrl ?? null;
    // Settings → Brand palette (see lib/account/brand-colors.ts). Every org
    // resolves to a value even before customizing — falls back to the same
    // fixed indigo these emails always used.
    const accentColor = resolveBrandColorsFromSettings(org?.settings).primary;

    let html: string;
    let text: string;
    if (rawBody) {
      const renderedBody = resolveMergeTags(rawBody, mergeCtx);
      text = `${renderedBody}\n\nUnsubscribe: ${unsubscribeUrl}`;
      html = renderEmailHtml({
        body: renderedBody,
        logoUrl,
        businessName,
        reviewLink,
        unsubscribeUrl,
        accentColor,
      });
    } else {
      const generated = defaultReviewRequestHtml({
        reviewerName: rr.recipientName,
        businessName,
        reviewLink,
        unsubscribeUrl,
        accentColor,
        logoUrl,
      });
      html = generated.html;
      text = generated.text;
    }

    const result = await sendReviewRequestEmail({
      to: rr.recipient,
      // The customer thinks they're emailing the business, so their reply must
      // reach the business — not a Repulabs address with no mailbox.
      replyTo: await resolveBusinessReplyTo(orgId, org?.ownerEmail),
      subject,
      bodyText: text,
      bodyHtml: html,
      unsubscribeUrl,
    });
    return finalize(orgId, rr.id, result.ok, {
      providerMessageId: result.ok ? result.messageId : undefined,
      error: result.ok ? undefined : result.error,
    });
  }

  // Unknown channel — mark failed rather than throw (keeps the cron resilient).
  await markFailed(orgId, rr.id, `unsupported_channel:${rr.channel}`);
  return { dispatched: false, status: "failed", error: `unsupported_channel:${rr.channel}` };
}

/** Apply the terminal status update for a send result. */
async function finalize(
  orgId: string,
  id: string,
  ok: boolean,
  meta: { providerMessageId?: string; error?: string },
): Promise<SendOutcome> {
  if (ok) {
    await withTenant(orgId, (tx) =>
      // Conditional on status='sending' so a DB blip / retry can't strand the row
      // or overwrite a concurrent state change; updateMany no-ops if already moved.
      tx.reviewRequest.updateMany({
        where: { id, status: "sending" },
        data: {
          status: "sent",
          sentAt: new Date(),
          providerMessageId: meta.providerMessageId ?? null,
        },
      }),
    );
    return { dispatched: true, status: "sent" };
  }
  await markFailed(orgId, id, meta.error ?? "send_failed");
  return { dispatched: false, status: "failed", error: meta.error };
}

async function markFailed(orgId: string, id: string, error: string): Promise<void> {
  await withTenant(orgId, (tx) =>
    tx.reviewRequest.updateMany({
      where: { id, status: "sending" },
      data: { status: "failed", error },
    }),
  );
  logger.warn({ orgId, reviewRequestId: id, error, event: "review_request.send_failed" });
}

/** Escape a string for the HTML attribute (double-quoted) context. */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Validate + escape a URL for safe interpolation into an href/src attribute.
 * Even though these values are org-controlled (logo / tracked review link /
 * signed unsubscribe), defense-in-depth: reject anything that isn't a valid
 * http(s) URL (drops javascript:/data: and malformed input), then escape for
 * the attribute context so quotes can't break out of the attribute. Returns
 * null when there's no safe URL to emit (caller omits the element/href).
 */
function safeAttrUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return escapeAttr(parsed.toString());
}

/**
 * Wrap an owner-authored body (custom composer text or a saved template) in the
 * SAME shell the generated email uses, branded as the business.
 *
 * Previously this produced its own slimmer markup, so a tenant who wrote their
 * own copy silently got a different-looking email from one who didn't — no
 * preheader, no Outlook-safe button, different spacing. The body is still
 * escaped here: it's owner-authored, not owner-trusted HTML.
 */
function renderEmailHtml(args: {
  body: string;
  logoUrl: string | null;
  businessName: string;
  reviewLink: string;
  unsubscribeUrl: string;
  /** Org's brand primary color (Settings → Brand), CTA button background. */
  accentColor?: string;
}): string {
  const escaped = args.body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
  // The CTA / unsubscribe anchors are core to the email; if a link somehow fails
  // validation, fall back to a non-clickable "#" rather than emitting raw input.
  const reviewHref = safeAttrUrl(args.reviewLink) ?? "#";
  const unsubscribeHref = safeAttrUrl(args.unsubscribeUrl) ?? "#";
  const accent = args.accentColor ?? null;

  return emailShell({
    preheader: `Share your experience with ${args.businessName}`,
    title: `How was your experience at ${args.businessName}?`,
    brand: {
      name: args.businessName,
      logoUrl: safeAttrUrl(args.logoUrl),
      accent,
    },
    body: `
      <div style="color:#0b0d0e;font-size:15px;line-height:1.6;">${escaped}</div>
      <div style="margin:26px 0;">${ctaButton({ url: reviewHref, label: "Leave a review", accent })}</div>
    `,
    footerNote: `Don't want these emails? <a href="${unsubscribeHref}" style="color:inherit;text-decoration:underline;">Unsubscribe</a>`,
  });
}

/**
 * Build a signed unsubscribe token (orgId.channel.recipient.signature, base64url).
 * Mirrors the helper previously inlined in actions.ts so the dispatch path can
 * derive its own unsubscribe URL for scheduled/cron sends.
 */
function buildUnsubToken(orgId: string, channel: string, recipient: string): string {
  const secret = getHmacSecret();
  const payload = `${orgId}|${channel}|${recipient}`;
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `t=${Buffer.from(payload).toString("base64url")}&s=${sig}`;
}
