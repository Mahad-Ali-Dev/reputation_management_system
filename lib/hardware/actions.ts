"use server";

import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/with-tenant";
import {
  generateActivationCode,
  generateSerial,
  generateSlug,
  googleReviewUrl,
  hashActivationCode,
  isStorableRedirectUrl,
  signSlug,
} from "@/lib/hardware/codes";
import { logger } from "@/lib/logger";
import { APP_URL, stripe } from "@/lib/stripe/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type Stripe from "stripe";
import { z } from "zod";

const QuantitySchema = z.object({
  productSku: z.string().min(1).max(64),
  quantity: z.number().int().min(1).max(50),
  establishmentId: z.string().uuid().optional(),
});

async function requireOrg() {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  const userId = session?.user?.id;
  const email = session?.user?.email;
  if (!session || !orgId || !userId || !email) redirect("/login");
  return { orgId, userId, email };
}

/**
 * Server action: create a Stripe Checkout session for a hardware order.
 *
 * Uses Stripe's hosted Checkout with shipping_address_collection so the customer
 * enters the ship-to address there. After payment, the webhook (Day 4 webhook handler)
 * provisions device rows and marks the order paid.
 */
export async function startHardwareCheckout(form: FormData): Promise<void> {
  const { orgId, email } = await requireOrg();

  const parsed = QuantitySchema.safeParse({
    productSku: form.get("productSku"),
    quantity: Number(form.get("quantity") ?? 1),
    establishmentId: form.get("establishmentId") || undefined,
  });
  if (!parsed.success) throw new Error("invalid_quantity");
  const { productSku, quantity, establishmentId } = parsed.data;

  // hardware_products is a global catalog (no RLS) — direct read is correct here.
  const product = await prisma.hardwareProduct.findUnique({
    where: { sku: productSku },
  });
  if (!product || !product.isActive) throw new Error("product_not_found");

  const org = await withTenant(orgId, (tx) =>
    tx.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, stripeCustomerId: true },
    }),
  );
  if (!org) throw new Error("org_not_found");

  // Ensure Stripe customer
  let customerId = org.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email,
      name: org.name,
      metadata: { organizationId: org.id },
    });
    customerId = customer.id;
    await withTenant(orgId, (tx) =>
      tx.organization.update({
        where: { id: org.id },
        data: { stripeCustomerId: customerId },
      }),
    );
  }

  // Build line items
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    {
      price_data: {
        currency: product.currency.toLowerCase(),
        product_data: {
          name: product.name,
          ...(product.description ? { description: product.description } : {}),
        },
        unit_amount: product.priceCents,
      },
      quantity,
    },
  ];

  // Pre-create the order row so we can attach the session to it; webhook flips status on payment.
  const order = await withTenant(orgId, async (tx) => {
    return tx.hardwareOrder.create({
      data: {
        organizationId: orgId,
        status: "pending",
        shippingAddress: {}, // filled by Stripe Checkout, captured at webhook time
        totalCents: product.priceCents * quantity,
        currency: product.currency,
        items: {
          create: {
            productId: product.id,
            establishmentId: establishmentId ?? null,
            quantity,
            unitPriceCents: product.priceCents,
          },
        },
      },
    });
  });

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    line_items: lineItems,
    shipping_address_collection: {
      allowed_countries: ["US", "CA", "GB", "AU", "DE", "FR", "ES", "IT", "NL", "IN", "PK"],
    },
    phone_number_collection: { enabled: true },
    metadata: {
      organizationId: orgId,
      hardwareOrderId: order.id,
      productSku,
      establishmentId: establishmentId ?? "",
    },
    payment_intent_data: {
      metadata: {
        organizationId: orgId,
        hardwareOrderId: order.id,
      },
    },
    success_url: `${APP_URL}/hardware/orders/${order.id}?status=success`,
    cancel_url: `${APP_URL}/hardware?status=canceled`,
  });

  if (!session.url) throw new Error("stripe_no_url");

  // Attach session id to the order for webhook lookup
  await withTenant(orgId, (tx) =>
    tx.hardwareOrder.update({
      where: { id: order.id },
      data: { stripeSessionId: session.id },
    }),
  );

  logger.info(
    {
      orgId,
      orderId: order.id,
      sessionId: session.id,
      productSku,
      quantity,
      event: "hardware.checkout.started",
    },
    "hardware checkout session created",
  );

  redirect(session.url);
}

/**
 * Activate a device using its printed activation code.
 *
 * Flow:
 *   1. SHA-256 hash the entered code
 *   2. Find an unactivated device with that hash
 *   3. Link to org + establishment, compute redirect_url + slug_signature, push status to active
 *   4. Audit log
 *
 * The redirect URL precedence:
 *   - If `reviewUrl` is pasted on the form, use it verbatim (must be valid URL).
 *   - Else, derive from the establishment's `googlePlaceId` (Google review form).
 *   - Else, fallback to a Google search for the business name.
 *
 * Rate limiting + Turnstile happens at the API layer (Day 4 finalization).
 */
export async function activateDevice(form: FormData): Promise<void> {
  const { orgId, userId } = await requireOrg();
  const codeRaw = form.get("activationCode");
  const establishmentId = form.get("establishmentId");
  const reviewUrlRaw = form.get("reviewUrl");

  if (typeof codeRaw !== "string" || codeRaw.length < 6) {
    throw new Error("invalid_activation_code");
  }
  if (typeof establishmentId !== "string" || !/^[0-9a-f-]{36}$/i.test(establishmentId)) {
    throw new Error("invalid_establishment_id");
  }

  // Optional pasted URL — must parse AND pass the storable-redirect check
  // (rejects javascript:/data:/file: schemes, IP-literal hosts, localhost in
  // production). Defends `/r/{slug}` against being weaponized as an open
  // redirect to phishing/malware destinations.
  let pastedUrl: string | null = null;
  if (typeof reviewUrlRaw === "string" && reviewUrlRaw.trim().length > 0) {
    const trimmed = reviewUrlRaw.trim();
    if (!isStorableRedirectUrl(trimmed)) {
      throw new Error("invalid_review_url");
    }
    pastedUrl = trimmed;
  }

  const codeHash = hashActivationCode(codeRaw);

  // Everything below runs inside withTenant. The devices RLS policy allows
  // reads/writes where organization_id IS NULL OR = current_org(), so we can
  // find the unactivated device (org NULL) and update it to point at this org
  // in the same transaction.
  const result = await withTenant(orgId, async (tx) => {
    const device = await tx.device.findFirst({
      where: {
        activationCodeHash: codeHash,
        status: "unactivated",
        activationCodeUsedAt: null,
      },
    });
    if (!device) {
      return { ok: false as const, reason: "not_found" as const };
    }

    const estab = await tx.establishment.findFirst({
      where: { id: establishmentId, deletedAt: null },
      select: { id: true, googlePlaceId: true, name: true },
    });
    if (!estab) {
      return { ok: false as const, reason: "establishment_not_found" as const };
    }

    // Precedence: pasted URL > establishment's googlePlaceId > Google search fallback.
    const redirectUrl = pastedUrl ?? googleReviewUrl(estab.googlePlaceId, estab.name);
    const expiresAtUnix = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365 * 5; // 5 years
    const signature = signSlug(device.shortSlug, redirectUrl, expiresAtUnix);

    // Race-safe activation: only claim if it's still unactivated AND the org is
    // still NULL. Two concurrent activations of the same code can both pass the
    // findFirst above, but only one will satisfy this WHERE.
    const claimed = await tx.device.updateMany({
      where: {
        id: device.id,
        status: "unactivated",
        activationCodeUsedAt: null,
        organizationId: null,
      },
      data: {
        organizationId: orgId,
        establishmentId,
        activationCodeUsedAt: new Date(),
        redirectUrl,
        slugSignature: signature,
        status: "active",
        activatedAt: new Date(),
      },
    });
    if (claimed.count === 0) {
      return { ok: false as const, reason: "race_lost" as const };
    }
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "device.activated",
        resourceType: "device",
        resourceId: device.id,
        afterData: {
          slug: device.shortSlug,
          establishmentId,
          redirectUrl,
          redirectSource: pastedUrl
            ? "pasted_url"
            : estab.googlePlaceId
              ? "place_id"
              : "search_fallback",
        },
      },
    });
    return { ok: true as const, device };
  });

  if (!result.ok) {
    if (result.reason === "not_found" || result.reason === "race_lost") {
      logger.warn(
        { orgId, event: "device.activation.miss" },
        "activation code did not match any unactivated device",
      );
      throw new Error("activation_code_not_found_or_used");
    }
    throw new Error("establishment_not_found");
  }
  const device = result.device;

  logger.info(
    {
      orgId,
      deviceId: device.id,
      slug: device.shortSlug,
      establishmentId,
      event: "device.activated",
    },
    "device activated",
  );

  revalidatePath("/hardware");
  revalidatePath(`/establishments/${establishmentId}`);
  redirect(`/hardware?activated=${device.shortSlug}`);
}

/**
 * Self-service QR generation — NO hardware purchase required.
 *
 * Free tier: anyone can generate a QR for a business they own (or a manual
 * Google review link). This creates a virtual Device row that's "active"
 * from creation — no activation code dance needed because nothing physical
 * shipped.
 *
 * Inputs:
 *   - establishmentId  (required) — which business this QR points to
 *   - displayName      (optional) — friendly label ("Front desk", "Counter")
 *   - reviewUrl        (optional) — paste a Google review link directly. If
 *                       absent, we build one from the establishment's
 *                       googlePlaceId. If neither, the link points to a
 *                       Google search for the business name.
 */
const SelfServiceSchema = z.object({
  establishmentId: z.string().uuid(),
  displayName: z.string().max(64).optional(),
  reviewUrl: z
    .string()
    .url()
    .max(500)
    .refine(isStorableRedirectUrl, {
      message:
        "URL must use http(s) and a real public host (no IP addresses, no javascript:/data: schemes)",
    })
    .optional()
    .or(z.literal("")),
});

export async function generateSelfServiceQr(form: FormData): Promise<void> {
  const { orgId, userId } = await requireOrg();

  const parsed = SelfServiceSchema.safeParse({
    establishmentId: form.get("establishmentId"),
    displayName: (form.get("displayName") as string | null) ?? undefined,
    reviewUrl: (form.get("reviewUrl") as string | null) ?? undefined,
  });
  if (!parsed.success) {
    redirect("/hardware/new?error=invalid_input");
  }
  const input = parsed.data;

  // Validate establishment belongs to this org and grab its details.
  const establishment = await withTenant(orgId, async (tx) =>
    tx.establishment.findFirst({
      where: { id: input.establishmentId, deletedAt: null },
      select: { id: true, name: true, googlePlaceId: true },
    }),
  );
  if (!establishment) {
    redirect("/establishments/new");
  }

  // Build the redirect URL: prefer manually-pasted link, then googlePlaceId,
  // then a search fallback.
  const explicitUrl = (input.reviewUrl ?? "").trim();
  const redirectUrl =
    explicitUrl.length > 0
      ? explicitUrl
      : googleReviewUrl(establishment.googlePlaceId, establishment.name);

  const slug = generateSlug();
  const serial = generateSerial();
  // Self-service codes never get a physical activation step — store a hash
  // of a random throwaway so the column stays NOT NULL.
  const { hash: activationCodeHash } = generateActivationCode();
  const expiresAtUnix = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365 * 5;
  const signature = signSlug(slug, redirectUrl, expiresAtUnix);

  const device = await withTenant(orgId, async (tx) => {
    const created = await tx.device.create({
      data: {
        organizationId: orgId,
        establishmentId: establishment.id,
        productSku: "self-service-qr",
        serial,
        shortSlug: slug,
        slugSignature: signature,
        activationCodeHash,
        activationCodeUsedAt: new Date(), // marks as "used" so it can't be re-activated
        redirectUrl,
        redirectMode: "direct",
        status: "active",
        activatedAt: new Date(),
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "device.self_service_created",
        resourceType: "device",
        resourceId: created.id,
        afterData: {
          shortSlug: created.shortSlug,
          establishmentId: establishment.id,
          source: explicitUrl.length > 0 ? "manual_url" : "place_id",
        },
      },
    });
    return created;
  });

  logger.info(
    {
      event: "device.self_service_created",
      orgId,
      deviceId: device.id,
      shortSlug: device.shortSlug,
    },
    "self-service QR created",
  );

  revalidatePath("/hardware");
  redirect(`/hardware?activated=${device.shortSlug}`);
}

/**
 * Update a device's redirect URL (the destination users land on after scan).
 *
 * This is the user-facing "edit my QR" flow. Re-signs the slug signature so
 * the HMAC stays valid for the new URL. Audit-logged.
 *
 * Used by /hardware/edit/[deviceId].
 */
const UpdateRedirectSchema = z.object({
  deviceId: z.string().uuid(),
  redirectUrl: z
    .string()
    .url("Must be a valid URL starting with https://")
    .max(500)
    .refine(isStorableRedirectUrl, {
      message:
        "URL must use http(s) and a real public host (no IP addresses, no javascript:/data: schemes)",
    }),
});

export async function updateDeviceRedirectUrl(form: FormData): Promise<void> {
  const { orgId, userId } = await requireOrg();
  const parsed = UpdateRedirectSchema.safeParse({
    deviceId: form.get("deviceId"),
    redirectUrl: (form.get("redirectUrl") as string | null)?.trim() ?? "",
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }
  const { deviceId, redirectUrl } = parsed.data;

  await withTenant(orgId, async (tx) => {
    const device = await tx.device.findFirst({
      where: { id: deviceId },
      select: {
        id: true,
        shortSlug: true,
        activatedAt: true,
        status: true,
        redirectUrl: true,
      },
    });
    if (!device) throw new Error("device_not_found");
    if (device.status === "retired") throw new Error("device_retired");

    // Use activation time as the expiry epoch base (5y sliding) — matches how
    // /r/[slug]/route.ts verifies the signature at scan time.
    const activatedAt = device.activatedAt ?? new Date();
    const expiresAtUnix = Math.floor(activatedAt.getTime() / 1000) + 60 * 60 * 24 * 365 * 5;
    const signature = signSlug(device.shortSlug, redirectUrl, expiresAtUnix);

    await tx.device.update({
      where: { id: deviceId },
      data: {
        redirectUrl,
        slugSignature: signature,
        redirectChangedAt: new Date(),
        // If this was a previously-inactive device with no target, activating it
        // by setting a URL flips it active too.
        ...(device.status === "active" || device.activatedAt
          ? {}
          : { status: "active", activatedAt: new Date() }),
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "device.redirect_updated",
        resourceType: "device",
        resourceId: deviceId,
        beforeData: { redirectUrl: device.redirectUrl ?? null },
        afterData: { redirectUrl },
      },
    });
  });

  logger.info(
    { event: "device.redirect_updated", orgId, deviceId, redirectUrl },
    "device redirect updated",
  );

  revalidatePath("/hardware");
  revalidatePath(`/hardware/edit/${deviceId}`);
  redirect(`/hardware?selected=${deviceId}&updated=1`);
}

/**
 * Soft-delete a device by flipping status to "retired".
 *
 * Schema constraints (devices_status_chk, devices_redirect_when_active) mean
 * we can't introduce a "deleted" status without a migration, AND we can't
 * null out redirect_url on any non-unactivated row. So we re-use "retired"
 * from the existing enum and leave redirect_url intact.
 *
 * Behavior:
 *   - /r/[slug] route checks `status !== "active"` and 302s to /not-activated,
 *     so scans of a retired device land on the inactive page (the URL just
 *     isn't read by the redirect logic anymore).
 *   - The hardware list page filters by `status === "active"`, so retired
 *     devices vanish from the UI.
 *   - Row stays in DB so audit history + analytics queries still resolve the
 *     device by ID.
 *
 * Audit-logged with the prior status + URL so an admin can restore via direct
 * DB update if needed (set status back to "active").
 */
const DeleteDeviceSchema = z.object({
  deviceId: z.string().uuid(),
});

export async function deleteDevice(form: FormData): Promise<void> {
  const { orgId, userId } = await requireOrg();
  const parsed = DeleteDeviceSchema.safeParse({
    deviceId: form.get("deviceId"),
  });
  if (!parsed.success) throw new Error("invalid_device_id");

  await withTenant(orgId, async (tx) => {
    const device = await tx.device.findFirst({
      where: { id: parsed.data.deviceId },
      select: {
        id: true,
        shortSlug: true,
        status: true,
        redirectUrl: true,
        establishmentId: true,
      },
    });
    if (!device) throw new Error("device_not_found");
    if (device.status === "retired") {
      // Already deleted — idempotent: don't double-log, just redirect.
      return;
    }

    await tx.device.update({
      where: { id: device.id },
      data: {
        status: "retired",
        // redirect_url intentionally kept — CHECK constraint requires it
        // non-null for any non-unactivated row, AND keeping it makes
        // forensic restore via `status='active'` a one-field update.
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "device.retired",
        resourceType: "device",
        resourceId: device.id,
        beforeData: {
          shortSlug: device.shortSlug,
          status: device.status,
          redirectUrl: device.redirectUrl ?? null,
          establishmentId: device.establishmentId,
        },
      },
    });
  });

  logger.info(
    { event: "device.retired", orgId, deviceId: parsed.data.deviceId },
    "device retired (soft-deleted)",
  );

  revalidatePath("/hardware");
  redirect("/hardware?deleted=1");
}

/**
 * Re-target a device (e.g., establishment changes Google Place ID).
 */
export async function refreshDeviceRedirect(deviceId: string): Promise<void> {
  const { orgId, userId } = await requireOrg();

  await withTenant(orgId, async (tx) => {
    const device = await tx.device.findFirst({
      where: { id: deviceId, status: "active" },
      include: { establishment: { select: { googlePlaceId: true, name: true } } },
    });
    if (!device || !device.establishment) throw new Error("device_not_found");

    const redirectUrl = googleReviewUrl(
      device.establishment.googlePlaceId,
      device.establishment.name,
    );
    const expiresAtUnix = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365 * 5;
    const signature = signSlug(device.shortSlug, redirectUrl, expiresAtUnix);

    await tx.device.update({
      where: { id: deviceId },
      data: {
        redirectUrl,
        slugSignature: signature,
        redirectChangedAt: new Date(),
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "device.redirect_refreshed",
        resourceType: "device",
        resourceId: deviceId,
        afterData: { redirectUrl },
      },
    });
  });

  revalidatePath("/hardware");
}
