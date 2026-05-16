"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import {
  defaultReviewRequestHtml,
  sendReviewRequestEmail,
} from "@/lib/outreach/email";
import { issueCouponForResponse } from "./coupons";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const TOKEN_TTL_DAYS = 14;

async function requireOrg() {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  const userId = session?.user?.id;
  if (!session || !orgId || !userId) redirect("/login");
  return { orgId, userId };
}

// ─── Create campaign ─────────────────────────────────────────

const CreateSchema = z.object({
  name: z.string().min(1).max(120),
  establishmentId: z.string().uuid().optional(),
  followUpPrompt: z.string().max(200).optional(),
});

export async function createSurveyCampaign(form: FormData): Promise<void> {
  const { orgId } = await requireOrg();

  const parsed = CreateSchema.safeParse({
    name: form.get("name"),
    establishmentId: form.get("establishmentId") || undefined,
    followUpPrompt: form.get("followUpPrompt") || undefined,
  });
  if (!parsed.success) {
    throw new Error(`Validation: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }

  const created = await withTenant(orgId, async (tx) => {
    const c = await tx.surveyCampaign.create({
      data: {
        organizationId: orgId,
        establishmentId: parsed.data.establishmentId ?? null,
        name: parsed.data.name,
        type: "nps",
        channel: "email",
        status: "active",
        smartRouteEnabled: true,
      },
    });
    await tx.surveyQuestion.create({
      data: {
        campaignId: c.id,
        position: 1,
        type: "nps",
        prompt:
          "On a scale of 0–10, how likely are you to recommend us to a friend or colleague?",
        required: true,
      },
    });
    await tx.surveyQuestion.create({
      data: {
        campaignId: c.id,
        position: 2,
        type: "text",
        prompt: parsed.data.followUpPrompt ?? "What's the main reason for your score?",
        required: false,
      },
    });
    return c;
  });

  revalidatePath("/surveys");
  redirect(`/surveys/${created.id}`);
}

// ─── Send invite to a recipient ───────────────────────────────

const SendSchema = z.object({
  campaignId: z.string().uuid(),
  email: z.string().email().max(200),
  recipientName: z.string().max(120).optional(),
});

export async function sendSurveyInvite(form: FormData): Promise<void> {
  const { orgId, userId } = await requireOrg();
  const parsed = SendSchema.safeParse({
    campaignId: form.get("campaignId"),
    email: form.get("email"),
    recipientName: form.get("recipientName") || undefined,
  });
  if (!parsed.success) {
    throw new Error(`Validation: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }
  const { campaignId, email, recipientName } = parsed.data;

  const campaign = await withTenant(orgId, async (tx) => {
    return tx.surveyCampaign.findFirst({
      where: { id: campaignId, status: "active" },
      include: {
        establishment: { select: { name: true } },
      },
    });
  });
  if (!campaign) throw new Error("Campaign not active or not found");

  // Generate single-use token (40 bytes base64url → 54 chars)
  const tokenPlaintext = randomBytes(40).toString("base64url");
  const tokenHash = createHash("sha256").update(tokenPlaintext).digest("hex");

  await withTenant(orgId, async (tx) => {
    await tx.surveyResponseToken.create({
      data: {
        tokenHash,
        campaignId,
        organizationId: orgId,
        recipient: email,
        recipientName: recipientName ?? null,
        expiresAt: new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "survey.invite_sent",
        resourceType: "survey_campaign",
        resourceId: campaignId,
        afterData: { recipient: email },
      },
    });
  });

  const responseUrl = `${APP_URL}/s/${tokenPlaintext}`;
  const businessName = campaign.establishment?.name ?? "us";

  const text = `Hi${recipientName ? ` ${recipientName}` : ""},

Quick favor — we'd love your feedback on your recent experience with ${businessName}. It takes 30 seconds:

${responseUrl}

Thanks!`;

  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,sans-serif;background:#f8fafc;padding:24px;">
<div style="max-width:480px;margin:0 auto;background:#fff;padding:32px;border-radius:12px;border:1px solid #e2e8f0;">
  <h1 style="margin:0 0 12px;font-size:20px;color:#0f172a;">Quick favor${recipientName ? `, ${recipientName.replace(/[<>"]/g, "")}` : ""}</h1>
  <p style="color:#475569;">We'd love your honest feedback on your recent experience with <strong>${businessName.replace(/[<>"]/g, "")}</strong>. It takes 30 seconds.</p>
  <p style="margin:24px 0;">
    <a href="${responseUrl}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Share feedback →</a>
  </p>
  <p style="color:#94a3b8;font-size:13px;">Thanks for your time. Your answers help us improve.</p>
</div></body></html>`;

  const result = await sendReviewRequestEmail({
    to: email,
    subject: `Quick favor — how was ${businessName}?`,
    bodyText: text,
    bodyHtml: html,
    unsubscribeUrl: `${APP_URL}/u?t=&s=`, // surveys don't get unsubscribe link (transactional); placeholder
  });
  if (!result.ok) {
    logger.error({ orgId, email, error: result.error, event: "survey.send_failed" });
    throw new Error(`Send failed: ${result.error}`);
  }

  logger.info({ orgId, campaignId, email, event: "survey.invite_sent" });
  revalidatePath(`/surveys/${campaignId}`);
}

// ─── Public submission handler (called from /s/[token] page) ─

const SubmitSchema = z.object({
  tokenPlaintext: z.string().min(20).max(120),
  npsScore: z.coerce.number().int().min(0).max(10),
  followUp: z.string().max(2000).optional(),
});

export async function submitSurveyResponse(form: FormData): Promise<{
  thankYou: string;
  route: string | null;
  coupon: { code: string; valueCents: number; description: string | null } | null;
}> {
  const parsed = SubmitSchema.safeParse({
    tokenPlaintext: form.get("token"),
    npsScore: form.get("npsScore"),
    followUp: form.get("followUp") || undefined,
  });
  if (!parsed.success) {
    throw new Error("invalid_submission");
  }
  const { tokenPlaintext, npsScore, followUp } = parsed.data;

  const tokenHash = createHash("sha256").update(tokenPlaintext).digest("hex");

  // Load token without tenant context (this endpoint is public).
  const token = await prisma.surveyResponseToken.findUnique({
    where: { tokenHash },
    include: {
      campaign: {
        include: {
          questions: { orderBy: { position: "asc" } },
          establishment: { select: { id: true, name: true, googlePlaceId: true } },
        },
      },
    },
  });
  if (!token) throw new Error("token_invalid");
  if (token.consumedAt) throw new Error("token_already_used");
  if (token.expiresAt.getTime() < Date.now()) throw new Error("token_expired");

  // Normalize NPS (0-10) to 5-scale for rating_summary
  const normalized = Number(((npsScore / 10) * 5).toFixed(2));
  const smartRouteTo: string =
    token.campaign.smartRouteEnabled && npsScore >= 8
      ? "review_request"
      : npsScore <= 6
        ? "internal_alert"
        : "none";

  const questions = token.campaign.questions;
  const npsQuestion = questions.find((q) => q.type === "nps");
  const textQuestion = questions.find((q) => q.type === "text");

  // Write response + answers + mark token consumed — all inside the tenant
  // transaction. survey_response_tokens itself has no RLS (it's a public
  // lookup table by hash), but the WRITE here narrows the token to its own
  // org by passing tokenHash in the WHERE, and the response rows are
  // properly tenant-isolated.
  const responseId = await withTenant(token.organizationId, async (tx) => {
    const response = await tx.surveyResponse.create({
      data: {
        campaignId: token.campaignId,
        organizationId: token.organizationId,
        recipient: token.recipient,
        ratingSummary: normalized,
        smartRouteTo,
        completedAt: new Date(),
      },
    });
    if (npsQuestion) {
      await tx.surveyAnswer.create({
        data: {
          responseId: response.id,
          questionId: npsQuestion.id,
          value: { number: npsScore },
        },
      });
    }
    if (textQuestion && followUp && followUp.length > 0) {
      await tx.surveyAnswer.create({
        data: {
          responseId: response.id,
          questionId: textQuestion.id,
          value: { text: followUp.slice(0, 2000) },
        },
      });
    }
    // Mark token consumed only if it's still unconsumed — defends against a
    // user racing two submits against the same token URL.
    const consumed = await tx.surveyResponseToken.updateMany({
      where: { tokenHash, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count === 0) {
      // Another submission already consumed the token; abort by throwing so
      // the outer transaction rolls back the response we just inserted.
      throw new Error("token_already_used");
    }
    return response.id;
  });

  // Issue a coupon for promoters if the campaign has an incentive configured.
  // Incentive JSON shape: { enabled: bool, valueCents: number, description?: string }
  let issuedCoupon: { code: string; valueCents: number; description: string | null } | null = null;
  const incentive = token.campaign.incentive as { enabled?: boolean; valueCents?: number; description?: string } | null;
  if (smartRouteTo === "review_request" && incentive?.enabled === true && typeof incentive.valueCents === "number") {
    try {
      const c = await issueCouponForResponse({
        responseId,
        organizationId: token.organizationId,
        campaignId: token.campaignId,
        valueCents: incentive.valueCents,
        description: incentive.description,
      });
      issuedCoupon = {
        code: c.code,
        valueCents: incentive.valueCents,
        description: incentive.description ?? null,
      };
    } catch (err) {
      logger.error(
        { err: String(err), event: "survey.coupon.issue.failed", orgId: token.organizationId, responseId },
        "failed to issue coupon for promoter",
      );
    }
  }

  // Smart-route side effect
  const establishment = token.campaign.establishment;
  if (smartRouteTo === "review_request" && establishment) {
    // Promoter → fire a review request immediately (email channel, same recipient as the survey)
    try {
      const establishmentId = establishment.id;
      await withTenant(token.organizationId, (tx) =>
        tx.reviewRequest.create({
          data: {
            organizationId: token.organizationId,
            establishmentId,
            channel: "email",
            recipient: token.recipient,
            recipientName: token.recipientName,
            scheduledFor: new Date(),
            status: "queued",
            triggerSource: "survey_high_score",
          },
        }),
      );
      logger.info(
        { orgId: token.organizationId, recipient: token.recipient, npsScore, event: "survey.smart_route.review_request" },
        "high-NPS survey response → review request enqueued",
      );
      // Note: dispatch happens via the outreach worker (Day 8 cron); v1 it stays queued.
    } catch (err) {
      logger.error(
        { err: String(err), event: "survey.smart_route.failed" },
        "failed to create review request from smart-route",
      );
    }
  } else if (smartRouteTo === "internal_alert") {
    logger.info(
      { orgId: token.organizationId, recipient: token.recipient, npsScore, event: "survey.smart_route.alert" },
      "detractor — internal alert (TODO: email owner)",
    );
  }

  return {
    thankYou: issuedCoupon
      ? `Thanks! Here's a thank-you coupon worth $${(issuedCoupon.valueCents / 100).toFixed(2)} on your next visit: ${issuedCoupon.code}. ${issuedCoupon.description ?? "Show this at the counter."}`
      : smartRouteTo === "review_request"
        ? "Thanks! We'd love it if you shared this on Google too — check your email in a minute."
        : smartRouteTo === "internal_alert"
          ? "Thanks for the honest feedback. Someone from the team will follow up."
          : "Thanks for the feedback!",
    route: smartRouteTo,
    coupon: issuedCoupon,
  };
}
