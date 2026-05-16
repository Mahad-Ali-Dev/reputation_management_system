"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { withTenant } from "@/lib/db/with-tenant";
import { cloneVoice, deleteVoice, isElevenLabsConfigured } from "@/lib/phone/elevenlabs";
import { logger } from "@/lib/logger";

async function requireOrg() {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  if (!session || !orgId) redirect("/login");
  return { orgId };
}

const CloneSchema = z.object({
  displayName: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
});

export async function uploadAndCloneVoice(form: FormData): Promise<void> {
  const { orgId } = await requireOrg();
  if (!isElevenLabsConfigured()) {
    throw new Error("ElevenLabs not configured. Add ELEVENLABS_API_KEY to your environment.");
  }

  const parsed = CloneSchema.safeParse({
    displayName: form.get("displayName"),
    description: (form.get("description") as string) || undefined,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }

  const file = form.get("audioSample");
  if (!(file instanceof File)) {
    throw new Error("Audio sample file required");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("Audio sample must be under 10 MB");
  }
  const allowed = ["audio/wav", "audio/mpeg", "audio/mp3", "audio/ogg", "audio/flac", "audio/x-wav"];
  if (!allowed.includes(file.type.toLowerCase())) {
    throw new Error("Audio must be WAV, MP3, OGG, or FLAC");
  }

  // Clone via ElevenLabs
  const clone = await cloneVoice({
    displayName: parsed.data.displayName,
    description: parsed.data.description,
    sampleAudio: file,
  });

  await withTenant(orgId, async (tx) => {
    await tx.phoneVoice.create({
      data: {
        organizationId: orgId,
        provider: "elevenlabs",
        externalVoiceId: clone.voiceId,
        displayName: parsed.data.displayName,
        description: parsed.data.description ?? null,
        previewAudioUrl: clone.previewUrl ?? null,
      },
    });
  });

  logger.info(
    { event: "phone_voice.cloned", orgId, voiceId: clone.voiceId },
    "voice cloned via ElevenLabs",
  );

  revalidatePath("/phone/voices");
}

const SelectSchema = z.object({
  voiceId: z.string().min(5).max(80),
});

export async function setActiveVoice(form: FormData): Promise<void> {
  const { orgId } = await requireOrg();
  const parsed = SelectSchema.safeParse({ voiceId: form.get("voiceId") });
  if (!parsed.success) throw new Error("invalid_voice_id");

  await withTenant(orgId, async (tx) => {
    // Make sure it belongs to this org
    const voice = await tx.phoneVoice.findFirst({
      where: { externalVoiceId: parsed.data.voiceId },
    });
    if (!voice) throw new Error("voice_not_found");

    // Update the assistant config
    const existing = await tx.phoneAssistant.findUnique({
      where: { organizationId: orgId },
    });
    if (existing) {
      await tx.phoneAssistant.update({
        where: { organizationId: orgId },
        data: {
          voiceProvider: "elevenlabs",
          elevenlabsVoiceId: parsed.data.voiceId,
        },
      });
    } else {
      await tx.phoneAssistant.create({
        data: {
          organizationId: orgId,
          voiceProvider: "elevenlabs",
          elevenlabsVoiceId: parsed.data.voiceId,
        },
      });
    }
  });

  revalidatePath("/phone");
  revalidatePath("/phone/voices");
  revalidatePath("/phone/assistant");
}

export async function revertToTwilioVoice(): Promise<void> {
  const { orgId } = await requireOrg();
  await withTenant(orgId, async (tx) => {
    await tx.phoneAssistant.upsert({
      where: { organizationId: orgId },
      update: { voiceProvider: "twilio" },
      create: { organizationId: orgId, voiceProvider: "twilio" },
    });
  });
  revalidatePath("/phone/voices");
  revalidatePath("/phone/assistant");
}

const DeleteSchema = z.object({
  voiceRecordId: z.string().uuid(),
});

export async function deleteClonedVoice(form: FormData): Promise<void> {
  const { orgId } = await requireOrg();
  const parsed = DeleteSchema.safeParse({ voiceRecordId: form.get("voiceRecordId") });
  if (!parsed.success) throw new Error("invalid_id");

  const voice = await withTenant(orgId, async (tx) =>
    tx.phoneVoice.findFirst({ where: { id: parsed.data.voiceRecordId } }),
  );
  if (!voice) return;

  // Delete from ElevenLabs first (best-effort)
  try {
    await deleteVoice({ voiceId: voice.externalVoiceId });
  } catch {
    // proceed even if remote delete fails
  }

  await withTenant(orgId, async (tx) => {
    await tx.phoneVoice.update({
      where: { id: voice.id },
      data: { status: "deleted" },
    });
    // If this was the active voice, revert to Twilio
    await tx.phoneAssistant.updateMany({
      where: { organizationId: orgId, elevenlabsVoiceId: voice.externalVoiceId },
      data: { voiceProvider: "twilio", elevenlabsVoiceId: null },
    });
  });

  revalidatePath("/phone/voices");
}
