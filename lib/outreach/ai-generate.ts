"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { withTenant } from "@/lib/db/with-tenant";
import { generateReviewRequestBody, type RequestTone } from "@/lib/ai/generate-review-request";
import { logger } from "@/lib/logger";
import { assertRateLimit } from "@/lib/ratelimit";

const GenerateSchema = z.object({
  channel: z.enum(["sms", "email"]),
  tone: z.enum(["friendly", "formal", "brief", "warm", "playful"]),
  context: z.string().max(400).optional(),
});

export async function generateRequestBody(form: FormData): Promise<{ body: string; tone: RequestTone }> {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  if (!session || !orgId) redirect("/login");

  await assertRateLimit("ai_caption", orgId);

  const parsed = GenerateSchema.safeParse({
    channel: form.get("channel"),
    tone: form.get("tone"),
    context: form.get("context") || undefined,
  });
  if (!parsed.success) throw new Error("invalid_input");

  const org = await withTenant(orgId, (tx) =>
    tx.organization.findUnique({
      where: { id: orgId },
      select: { name: true },
    }),
  );
  if (!org) throw new Error("org_not_found");

  const { body, costMicros } = await generateReviewRequestBody({
    businessName: org.name,
    channel: parsed.data.channel,
    tone: parsed.data.tone,
    context: parsed.data.context,
  });

  logger.info(
    { event: "ai.review_request.generated", orgId, channel: parsed.data.channel, tone: parsed.data.tone, costMicros },
    "AI generated review-request body",
  );

  return { body, tone: parsed.data.tone };
}
