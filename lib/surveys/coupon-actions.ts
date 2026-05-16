"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { redeemCoupon } from "./coupons";

const RedeemSchema = z.object({
  code: z.string().min(8).max(20),
  note: z.string().max(280).optional(),
});

export async function redeemCouponAction(form: FormData): Promise<{
  ok: boolean;
  message: string;
  valueCents?: number;
  description?: string | null;
  code?: string;
}> {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  const userId = session?.user?.id;
  if (!session || !orgId || !userId) redirect("/login");

  const parsed = RedeemSchema.safeParse({
    code: form.get("code"),
    note: form.get("note") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, message: "Enter a valid coupon code (8–20 characters)." };
  }

  const result = await redeemCoupon({
    organizationId: orgId,
    code: parsed.data.code,
    note: parsed.data.note,
  });

  if (!result.ok) {
    const messages: Record<typeof result.reason, string> = {
      not_found: "No coupon matches that code. Check spelling.",
      expired: "This coupon has expired.",
      already_redeemed: "This coupon has already been redeemed.",
      wrong_org: "This coupon was issued by a different business.",
    };
    return { ok: false, message: messages[result.reason] };
  }

  // Audit log the redemption (RLS-scoped via withTenant)
  await withTenant(orgId, async (tx) => {
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "survey.coupon.redeemed",
        resourceType: "survey_coupon",
        afterData: { code: result.code, valueCents: result.valueCents, note: parsed.data.note ?? null },
      },
    });
  });

  logger.info(
    { event: "survey.coupon.redeemed", orgId, valueCents: result.valueCents },
    "coupon redeemed at POS",
  );

  revalidatePath("/surveys/coupons");

  return {
    ok: true,
    message: `Redeemed $${(result.valueCents / 100).toFixed(2)}`,
    valueCents: result.valueCents,
    description: result.description,
    code: result.code,
  };
}
