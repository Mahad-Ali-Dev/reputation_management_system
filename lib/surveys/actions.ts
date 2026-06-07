"use server";

import type { Prisma } from "@prisma/client";
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
  /** Optional template (an existing campaign) to clone questions + branding from. */
  templateId: z.string().uuid().optional(),
});

export async function createSurveyCampaign(form: FormData): Promise<void> {
  const { orgId } = await requireOrg();

  const parsed = CreateSchema.safeParse({
    name: form.get("name"),
    establishmentId: form.get("establishmentId") || undefined,
    followUpPrompt: form.get("followUpPrompt") || undefined,
    templateId: form.get("templateId") || undefined,
  });
  if (!parsed.success) {
    throw new Error(`Validation: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }

  const created = await withTenant(orgId, async (tx) => {
    // If a template is chosen, clone its questions + branding (incentive) into
    // the new campaign instead of seeding the fixed 2-question NPS set.
    const template = parsed.data.templateId
      ? await tx.surveyCampaign.findFirst({
          where: { id: parsed.data.templateId },
          include: { questions: { orderBy: { position: "asc" } } },
        })
      : null;

    const c = await tx.surveyCampaign.create({
      data: {
        organizationId: orgId,
        establishmentId: parsed.data.establishmentId ?? null,
        name: parsed.data.name,
        type: template?.type ?? "nps",
        channel: "email",
        status: "active",
        smartRouteEnabled: template?.smartRouteEnabled ?? true,
        incentive: (template?.incentive ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });

    if (template && template.questions.length > 0) {
      await tx.surveyQuestion.createMany({
        data: template.questions.map((q, i) => ({
          campaignId: c.id,
          position: i + 1,
          type: q.type,
          prompt: q.prompt,
          options: (q.options ?? undefined) as Prisma.InputJsonValue | undefined,
          required: q.required,
        })),
      });
    } else {
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
    }
    return c;
  });

  revalidatePath("/surveys");
  redirect(`/surveys/${created.id}`);
}

/**
 * Create a campaign and RETURN its id (no redirect) — used by the Create wizard,
 * which then batch-sends. Clones a template when `templateId` is given, else
 * seeds the default NPS pair.
 */
export async function createSurveyCampaignReturningId(input: {
  name: string;
  establishmentId?: string;
  templateId?: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { orgId } = await requireOrg();
  const parsed = CreateSchema.safeParse({
    name: input.name,
    establishmentId: input.establishmentId || undefined,
    templateId: input.templateId || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }

  try {
    const created = await withTenant(orgId, async (tx) => {
      const template = parsed.data.templateId
        ? await tx.surveyCampaign.findFirst({
            where: { id: parsed.data.templateId },
            include: { questions: { orderBy: { position: "asc" } } },
          })
        : null;

      const c = await tx.surveyCampaign.create({
        data: {
          organizationId: orgId,
          establishmentId: parsed.data.establishmentId ?? null,
          name: parsed.data.name,
          type: template?.type ?? "nps",
          channel: "email",
          status: "active",
          smartRouteEnabled: template?.smartRouteEnabled ?? true,
          incentive: (template?.incentive ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
      if (template && template.questions.length > 0) {
        await tx.surveyQuestion.createMany({
          data: template.questions.map((q, i) => ({
            campaignId: c.id,
            position: i + 1,
            type: q.type,
            prompt: q.prompt,
            options: (q.options ?? undefined) as Prisma.InputJsonValue | undefined,
            required: q.required,
          })),
        });
      } else {
        await tx.surveyQuestion.createMany({
          data: [
            {
              campaignId: c.id,
              position: 1,
              type: "nps",
              prompt: "On a scale of 0–10, how likely are you to recommend us to a friend or colleague?",
              required: true,
            },
            {
              campaignId: c.id,
              position: 2,
              type: "text",
              prompt: "What's the main reason for your score?",
              required: false,
            },
          ],
        });
      }
      return c;
    });
    revalidatePath("/surveys");
    return { ok: true, id: created.id };
  } catch (err) {
    logger.error({ orgId, error: String(err), event: "survey.create_returning.failed" });
    return { ok: false, error: err instanceof Error ? err.message : "Failed to create campaign" };
  }
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

// ─── Batch send (Create wizard, step 3) ──────────────────────

const BatchSendSchema = z.object({
  campaignId: z.string().uuid(),
  recipients: z
    .array(z.object({ email: z.string().email().max(200), name: z.string().max(120).optional() }))
    .min(1)
    .max(500),
  scheduleHours: z.coerce.number().int().min(0).max(720).default(0),
});

/**
 * Issue survey tokens for many recipients of one campaign and email each a
 * single-use link (or schedule it `scheduleHours` ahead by setting a future
 * token `createdAt` window — v1 sends immediately; scheduling is a soft flag).
 * Reuses the same token + email path as `sendSurveyInvite`. Manager-gated would
 * be ideal, but to match the existing surveys auth surface we keep `requireOrg`
 * (sending is the core action the existing single-invite uses).
 */
export async function sendSurveyBatch(input: {
  campaignId: string;
  recipients: { email: string; name?: string }[];
  scheduleHours?: number;
}): Promise<{ ok: true; sent: number; failed: number } | { ok: false; error: string }> {
  const { orgId, userId } = await requireOrg();
  const parsed = BatchSendSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  const { campaignId, recipients } = parsed.data;

  const campaign = await withTenant(orgId, async (tx) =>
    tx.surveyCampaign.findFirst({
      where: { id: campaignId, status: "active" },
      include: { establishment: { select: { name: true } } },
    }),
  );
  if (!campaign) return { ok: false, error: "Campaign not active or not found" };
  const businessName = campaign.establishment?.name ?? "us";

  let sent = 0;
  let failed = 0;

  for (const r of recipients) {
    try {
      const tokenPlaintext = randomBytes(40).toString("base64url");
      const tokenHash = createHash("sha256").update(tokenPlaintext).digest("hex");
      await withTenant(orgId, async (tx) => {
        await tx.surveyResponseToken.create({
          data: {
            tokenHash,
            campaignId,
            organizationId: orgId,
            recipient: r.email,
            recipientName: r.name ?? null,
            expiresAt: new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
          },
        });
      });

      const responseUrl = `${APP_URL}/s/${tokenPlaintext}`;
      const safeName = r.name ? r.name.replace(/[<>"]/g, "") : "";
      const result = await sendReviewRequestEmail({
        to: r.email,
        subject: `Quick favor — how was ${businessName}?`,
        bodyText: `Hi${r.name ? ` ${r.name}` : ""},\n\nWe'd love your feedback on your recent experience with ${businessName}. It takes 30 seconds:\n\n${responseUrl}\n\nThanks!`,
        bodyHtml: `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,sans-serif;background:#f8fafc;padding:24px;"><div style="max-width:480px;margin:0 auto;background:#fff;padding:32px;border-radius:12px;border:1px solid #e2e8f0;"><h1 style="margin:0 0 12px;font-size:20px;color:#0f172a;">Quick favor${safeName ? `, ${safeName}` : ""}</h1><p style="color:#475569;">We'd love your honest feedback on your recent experience with <strong>${businessName.replace(/[<>"]/g, "")}</strong>. It takes 30 seconds.</p><p style="margin:24px 0;"><a href="${responseUrl}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Share feedback →</a></p><p style="color:#94a3b8;font-size:13px;">Thanks for your time.</p></div></body></html>`,
        unsubscribeUrl: `${APP_URL}/u?t=&s=`,
      });
      if (result.ok) sent++;
      else failed++;
    } catch (err) {
      failed++;
      logger.error({ orgId, error: String(err), event: "survey.batch_send.recipient_failed" });
    }
  }

  await withTenant(orgId, async (tx) => {
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "survey.batch_sent",
        resourceType: "survey_campaign",
        resourceId: campaignId,
        afterData: { sent, failed, total: recipients.length },
      },
    });
  });

  revalidatePath(`/surveys/${campaignId}`);
  revalidatePath("/surveys");
  logger.info({ orgId, campaignId, sent, failed, event: "survey.batch_sent" });
  return { ok: true, sent, failed };
}

// ─── Public submission handler (called from /s/[token] page) ─

/**
 * Per-question answer shape submitted by the public form. `value` is one of:
 *   nps/rating: { number }   text: { text }   yes_no: { bool }
 *   multichoice: { choice }
 * The form serializes an array of these as JSON under `answers`.
 */
const AnswerSchema = z.object({
  questionId: z.string().uuid(),
  number: z.coerce.number().optional(),
  text: z.string().max(2000).optional(),
  bool: z.boolean().optional(),
  choice: z.string().max(200).optional(),
});

const SubmitSchema = z.object({
  tokenPlaintext: z.string().min(20).max(120),
  answers: z.array(AnswerSchema).max(50),
  // Legacy single-NPS fields (kept for backwards compatibility with old links).
  npsScore: z.coerce.number().int().min(0).max(10).optional(),
  followUp: z.string().max(2000).optional(),
});

export async function submitSurveyResponse(form: FormData): Promise<{
  thankYou: string;
  route: string | null;
  coupon: { code: string; valueCents: number; description: string | null } | null;
}> {
  // Parse the answers array (JSON) with a legacy fallback for old NPS-only links.
  let answersRaw: unknown[] = [];
  const answersJson = form.get("answers");
  if (typeof answersJson === "string" && answersJson.length > 0) {
    try {
      const parsedJson = JSON.parse(answersJson);
      if (Array.isArray(parsedJson)) answersRaw = parsedJson;
    } catch {
      throw new Error("invalid_submission");
    }
  }

  const parsed = SubmitSchema.safeParse({
    tokenPlaintext: form.get("token"),
    answers: answersRaw,
    npsScore: form.get("npsScore") ?? undefined,
    followUp: form.get("followUp") || undefined,
  });
  if (!parsed.success) {
    throw new Error("invalid_submission");
  }
  const { tokenPlaintext } = parsed.data;
  let { answers } = parsed.data;

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

  const questions = token.campaign.questions;
  const npsQuestion = questions.find((q) => q.type === "nps");

  // Legacy compatibility: an old NPS-only link posts npsScore/followUp instead
  // of an answers array. Synthesize the answers array from them.
  if (answers.length === 0 && typeof parsed.data.npsScore === "number") {
    const textQuestion = questions.find((q) => q.type === "text");
    answers = [];
    if (npsQuestion) answers.push({ questionId: npsQuestion.id, number: parsed.data.npsScore });
    if (textQuestion && parsed.data.followUp) {
      answers.push({ questionId: textQuestion.id, text: parsed.data.followUp });
    }
  }

  // Index answers by questionId and validate each against its question type.
  const byId = new Map(answers.map((a) => [a.questionId, a]));
  type AnswerJsonValue = { number: number } | { text: string } | { bool: boolean } | { choice: string };
  const validAnswers: Array<{ questionId: string; value: AnswerJsonValue }> = [];
  const ratingValues: number[] = []; // 0–5 ratings, averaged into rating_summary
  let npsScore: number | null = null;

  for (const q of questions) {
    const a = byId.get(q.id);
    if (!a) {
      if (q.required) throw new Error("missing_required_answer");
      continue;
    }
    switch (q.type) {
      case "nps": {
        if (typeof a.number !== "number" || a.number < 0 || a.number > 10) {
          if (q.required) throw new Error("invalid_answer");
          break;
        }
        npsScore = Math.round(a.number);
        validAnswers.push({ questionId: q.id, value: { number: npsScore } });
        break;
      }
      case "rating": {
        if (typeof a.number !== "number" || a.number < 1 || a.number > 5) {
          if (q.required) throw new Error("invalid_answer");
          break;
        }
        const r = Math.round(a.number);
        ratingValues.push(r);
        validAnswers.push({ questionId: q.id, value: { number: r } });
        break;
      }
      case "yes_no": {
        if (typeof a.bool !== "boolean") {
          if (q.required) throw new Error("invalid_answer");
          break;
        }
        validAnswers.push({ questionId: q.id, value: { bool: a.bool } });
        break;
      }
      case "multichoice": {
        const choice = (a.choice ?? "").trim();
        if (!choice) {
          if (q.required) throw new Error("invalid_answer");
          break;
        }
        validAnswers.push({ questionId: q.id, value: { choice: choice.slice(0, 200) } });
        break;
      }
      default: {
        // text
        const text = (a.text ?? "").trim();
        if (!text) {
          if (q.required) throw new Error("invalid_answer");
          break;
        }
        validAnswers.push({ questionId: q.id, value: { text: text.slice(0, 2000) } });
        break;
      }
    }
  }

  // rating_summary: prefer the NPS score (mapped 0–10 → 0–5); otherwise the
  // average of rating-type answers. Null when neither is present.
  let normalized: number | null = null;
  if (npsScore !== null) {
    normalized = Number(((npsScore / 10) * 5).toFixed(2));
  } else if (ratingValues.length > 0) {
    normalized = Number((ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length).toFixed(2));
  }

  // Smart-route keyed off the NPS question (unchanged logic). With no NPS
  // question, fall back to a rating-derived score if available.
  const routeScore = npsScore ?? (normalized !== null ? Math.round((normalized / 5) * 10) : null);
  const smartRouteTo: string =
    routeScore === null
      ? "none"
      : token.campaign.smartRouteEnabled && routeScore >= 8
        ? "review_request"
        : routeScore <= 6
          ? "internal_alert"
          : "none";

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
    if (validAnswers.length > 0) {
      await tx.surveyAnswer.createMany({
        data: validAnswers.map((a) => ({
          responseId: response.id,
          questionId: a.questionId,
          value: a.value,
        })),
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

  // Fire-and-forget: nudge an insights refresh if the corpus is now stale. This
  // must NOT block (or fail) the customer's submission, so it is fully detached
  // and swallowed. The generator itself is env-gated + entitlement-gated, so
  // this is a cheap no-op without an API key / on a free plan. Dynamic import
  // keeps the AI client out of the hot submission path's eager module graph.
  void (async () => {
    try {
      const { insightsStaleness } = await import("./insights-queries");
      const staleness = await insightsStaleness(token.organizationId);
      if (staleness.stale && staleness.reason !== "below_threshold") {
        const { generateSurveyInsights } = await import("./insights");
        await generateSurveyInsights(token.organizationId);
      }
    } catch (err) {
      logger.warn({ event: "survey.insights.post_submit_refresh_failed", error: String(err) });
    }
  })();

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
