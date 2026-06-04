"use server";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import { withTenant } from "@/lib/db/with-tenant";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

const AssistantSchema = z.object({
  greeting: z.string().min(5).max(500),
  voice: z.string().max(80).default("alice"),
  language: z.string().max(20).default("en-US"),
  maxTurns: z.coerce.number().int().min(2).max(30).default(12),
  endCallPhrases: z.string().max(500).optional(), // comma-separated
  handoffPhrases: z.string().max(500).optional(),
  handoffNumber: z.string().max(40).optional(), // E.164 forward number
  customInstructions: z.string().max(3000).optional(),
  enabled: z.coerce.boolean().default(false),
});

async function requireOrg() {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  const userId = session?.user?.id;
  if (!session || !orgId || !userId) redirect("/login");
  return { orgId, userId };
}

export async function saveAssistantConfig(form: FormData): Promise<void> {
  const { orgId } = await requireOrg();
  const parsed = AssistantSchema.safeParse({
    greeting: form.get("greeting"),
    voice: (form.get("voice") as string) || "alice",
    language: (form.get("language") as string) || "en-US",
    maxTurns: form.get("maxTurns") ?? 12,
    endCallPhrases: (form.get("endCallPhrases") as string) || undefined,
    handoffPhrases: (form.get("handoffPhrases") as string) || undefined,
    handoffNumber: (form.get("handoffNumber") as string) || undefined,
    customInstructions: (form.get("customInstructions") as string) || undefined,
    enabled: form.get("enabled") === "on",
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }
  const d = parsed.data;
  const endPhrases = d.endCallPhrases
    ? d.endCallPhrases
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    : ["goodbye", "bye now", "have a good day", "hang up"];
  const handoffPhrases = d.handoffPhrases
    ? d.handoffPhrases
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    : ["speak to a human", "representative", "manager", "customer service"];

  await withTenant(orgId, async (tx) => {
    const existing = await tx.phoneAssistant.findUnique({
      where: { organizationId: orgId },
    });
    if (existing) {
      await tx.phoneAssistant.update({
        where: { organizationId: orgId },
        data: {
          greeting: d.greeting,
          voice: d.voice,
          language: d.language,
          maxTurns: d.maxTurns,
          endCallPhrases: endPhrases,
          handoffPhrases: handoffPhrases,
          handoffNumber: d.handoffNumber ?? null,
          customInstructions: d.customInstructions ?? null,
          enabled: d.enabled,
        },
      });
    } else {
      await tx.phoneAssistant.create({
        data: {
          organizationId: orgId,
          greeting: d.greeting,
          voice: d.voice,
          language: d.language,
          maxTurns: d.maxTurns,
          endCallPhrases: endPhrases,
          handoffPhrases: handoffPhrases,
          handoffNumber: d.handoffNumber ?? null,
          customInstructions: d.customInstructions ?? null,
          enabled: d.enabled,
        },
      });
    }
  });

  revalidatePath("/phone");
}

const PhoneNumberSchema = z.object({
  phoneE164: z.string().regex(/^\+[1-9][0-9]{1,14}$/),
  twilioSid: z.string().min(5).max(80),
  friendlyName: z.string().max(120).optional(),
  forwardToE164: z.string().max(40).optional(),
});

/**
 * Register a Twilio number with our system. Admin sets up the phone number
 * in their Twilio console + paste the SID + E.164 number here.
 */
export async function registerPhoneNumber(form: FormData): Promise<void> {
  const { orgId } = await requireOrg();
  const parsed = PhoneNumberSchema.safeParse({
    phoneE164: form.get("phoneE164"),
    twilioSid: form.get("twilioSid"),
    friendlyName: (form.get("friendlyName") as string) || undefined,
    forwardToE164: (form.get("forwardToE164") as string) || undefined,
  });
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  const d = parsed.data;

  await withTenant(orgId, async (tx) => {
    await tx.phoneNumber.create({
      data: {
        organizationId: orgId,
        phoneE164: d.phoneE164,
        twilioSid: d.twilioSid,
        friendlyName: d.friendlyName ?? null,
        forwardToE164: d.forwardToE164 ?? null,
        capabilities: { voice: true, sms: true, mms: false },
      },
    });
  });

  revalidatePath("/phone");
}

export async function deletePhoneNumber(form: FormData): Promise<void> {
  const { orgId, userId } = await requireRole("admin");
  const id = z.string().uuid().parse(form.get("id"));
  await withTenant(orgId, async (tx) => {
    const before = await tx.phoneNumber.findFirst({
      where: { id },
      select: { phoneE164: true, friendlyName: true, status: true },
    });
    if (!before) return;
    await tx.phoneNumber.update({
      where: { id },
      data: { status: "released" },
    });
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "phone_number.released",
        resourceType: "phone_number",
        resourceId: id,
        beforeData: before,
      },
    });
  });
  revalidatePath("/phone");
}
