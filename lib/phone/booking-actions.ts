"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { withTenant } from "@/lib/db/with-tenant";
import { encrypt } from "@/lib/crypto/envelope";

async function requireOrg() {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  if (!session || !orgId) redirect("/login");
  return { orgId };
}

const CalComSchema = z.object({
  apiKey: z.string().min(10).max(200),
  eventTypeId: z.coerce.number().int().positive(),
  bookingBufferMin: z.coerce.number().int().min(0).max(720).default(60),
});

export async function saveCalComConfig(form: FormData): Promise<void> {
  const { orgId } = await requireOrg();
  const parsed = CalComSchema.safeParse({
    apiKey: form.get("apiKey"),
    eventTypeId: form.get("eventTypeId"),
    bookingBufferMin: form.get("bookingBufferMin") ?? 60,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }

  const encrypted = encrypt(parsed.data.apiKey, {
    orgId,
    provider: "cal_com",
    purpose: "oauth",
  });

  const toBytes = (b: Buffer): Uint8Array<ArrayBuffer> => {
    const out = new Uint8Array(new ArrayBuffer(b.byteLength));
    out.set(b);
    return out;
  };

  await withTenant(orgId, async (tx) => {
    await tx.phoneAssistant.upsert({
      where: { organizationId: orgId },
      update: {
        bookingProvider: "cal_com",
        calComApiKeyCt: toBytes(encrypted.ciphertext),
        calComIv: toBytes(encrypted.iv),
        calComEventType: parsed.data.eventTypeId,
        bookingBufferMin: parsed.data.bookingBufferMin,
      },
      create: {
        organizationId: orgId,
        bookingProvider: "cal_com",
        calComApiKeyCt: toBytes(encrypted.ciphertext),
        calComIv: toBytes(encrypted.iv),
        calComEventType: parsed.data.eventTypeId,
        bookingBufferMin: parsed.data.bookingBufferMin,
      },
    });
  });

  revalidatePath("/phone/booking");
  revalidatePath("/phone");
}

export async function disconnectCalCom(): Promise<void> {
  const { orgId } = await requireOrg();
  await withTenant(orgId, async (tx) => {
    await tx.phoneAssistant.update({
      where: { organizationId: orgId },
      data: {
        bookingProvider: null,
        calComApiKeyCt: null,
        calComIv: null,
        calComEventType: null,
      },
    });
  });
  revalidatePath("/phone/booking");
}
