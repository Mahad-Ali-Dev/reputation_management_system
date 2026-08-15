"use server";

import { resolveSessionOrg } from "@/lib/auth/active-org";
import { ForbiddenError, roleAtLeast } from "@/lib/auth/rbac";
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
import { clearPendingSlug, readPendingSlug } from "@/lib/hardware/pending-slug";
import { parseSlug } from "@/lib/hardware/slug";
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

/**
 * Hardware actions are all mutating (paid checkout, device activation/edit/
 * delete) — gate them at `manager` like the rest of Group B. We keep a local
 * helper rather than `requireRole` directly because these actions also need the
 * session `email` (for Stripe customer creation), which `requireRole` doesn't
 * surface. The role check mirrors `requireRole("manager")` exactly.
 */
async function requireManagerOrg() {
  const sessionOrg = await resolveSessionOrg();
  if (!sessionOrg || !sessionOrg.email) redirect("/login");
  const { orgId, userId, email, role } = sessionOrg;
  if (!roleAtLeast(role, "manager")) throw new ForbiddenError("manager", role);
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
  const { orgId, email } = await requireManagerOrg();

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
 * State returned by the `activateDevice` server action. Designed for the
 * `useActionState` hook in `app/activate/activate-form.tsx` — `error` is
 * non-null when the action failed, `null` on success (and on success the
 * action also `redirect()`s so the page rerenders).
 */
export type ActivateDeviceState = {
  error: string | null;
};

/**
 * Is this a lost-connection failure rather than a real rejection?
 *
 * Prisma surfaces a dropped Postgres connection as
 * `Error in PostgreSQL connection: Error { kind: Closed, cause: None }`, which
 * is routine against a pooler or an auto-suspending compute: an idle connection
 * gets reaped and the next transaction to pick it up dies. The transaction is
 * fully rolled back when this happens, so the caller can safely re-run it.
 *
 * Matched on the message because these arrive as plain `Error`s from the query
 * engine, not as `PrismaClientKnownRequestError` with a code we could switch on.
 */
function isTransientDbError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /kind:\s*Closed|Connection reset|ECONNRESET|EPIPE|Timed out fetching a new connection|closed the connection|Can't reach database server|Transaction .* already closed/i.test(
    message,
  );
}

/**
 * Shared batch override code. The current production batch was mis-printed with
 * ONE code (84219) on every card instead of each unit's real code, so during
 * this batch we accept 84219 for ANY scanned device (the unique QR slug is what
 * actually identifies the unit). Defaults to "84219" so it works on deploy with
 * no env change; set HARDWARE_OVERRIDE_ACTIVATION_CODE="" to DISABLE it at the
 * next production run → strict per-device verification returns with no code
 * change. See memory: hardware-shared-code-incident-2026-07.
 */
const SHARED_BATCH_CODE = (process.env.HARDWARE_OVERRIDE_ACTIVATION_CODE ?? "84219")
  .replace(/[-\s]/g, "")
  .toUpperCase();

/**
 * Activate a device using its printed activation code.
 *
 * Flow:
 *   1. Resolve the device: by unique QR slug when the owner scanned (the code is
 *      mass-printed per batch and can't identify one unit), else by code hash but
 *      only when it maps to exactly one unactivated device.
 *   2. Verify the entered code against THAT device's stored hash.
 *   3. Atomically claim it — one QR binds to one business, once (race-safe).
 *   4. Link org + establishment, compute redirect_url + slug_signature, activate.
 *   5. Audit log
 *
 * The redirect URL precedence:
 *   - If `reviewUrl` is pasted on the form, use it verbatim (must be valid URL).
 *   - Else, derive from the establishment's `googlePlaceId` (Google review form).
 *   - Else, fallback to a Google search for the business name.
 *
 * Signature: takes the previous state (unused, but `useActionState` passes
 * it) and the form. Returns `{ error: "..." }` on user-facing failures so
 * the form can render an inline message. Throws only for genuinely
 * exceptional cases (auth failure -> redirect handled by requireManagerOrg).
 *
 * Rate limiting + Turnstile happens at the API layer (Day 4 finalization).
 */
export async function activateDevice(
  _prev: ActivateDeviceState,
  form: FormData,
): Promise<ActivateDeviceState> {
  // This action feeds `useActionState`, so a THROWN error surfaces as a
  // production crash digest instead of an inline message (the June-2026
  // "throw + bare form" trap). `requireManagerOrg()` throws ForbiddenError for a
  // signed-in user below manager — catch that and return {error}; let its
  // `redirect("/login")` (a NEXT_ control-flow throw) propagate untouched.
  let orgId: string;
  let userId: string;
  try {
    ({ orgId, userId } = await requireManagerOrg());
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return {
        error:
          "You need manager access to activate a device. Ask an admin or owner to activate it.",
      };
    }
    throw err;
  }
  const codeRaw = form.get("activationCode");
  const slugRaw = form.get("slug");
  const establishmentId = form.get("establishmentId");
  const reviewUrlRaw = form.get("reviewUrl");

  if (typeof codeRaw !== "string" || codeRaw.replace(/[-\s]/g, "").length < 5) {
    return {
      error: "Please enter the full 5-character activation code from the card inside your package.",
    };
  }
  if (typeof establishmentId !== "string" || !/^[0-9a-f-]{36}$/i.test(establishmentId)) {
    return { error: "Pick a business from the list before activating." };
  }

  // The activation code was mass-printed IDENTICALLY across the current
  // production batch, so it can no longer identify a single device on its own.
  // The per-unit identifier that IS unique is the QR slug (10-char Crockford
  // base32) — so when the owner scans their stand we bind THAT exact device. The
  // code is still verified, but against the specific device the slug resolves to
  // (so a future batch with unique codes is secure again with no code change —
  // the slug just narrows to one device and its real code must still match).
  //
  // Three ways the slug reaches us, in priority order:
  //   1. The form field — `/activate`'s device box (pre-filled from the scan) or
  //      the pasted QR link in the Connect-a-device modal. `parseSlug` accepts a
  //      full link, a bare path or the raw slug.
  //   2. The `rl_pending_slug` cookie that `/r/{slug}` set when they scanned.
  //      This is what survives signup → magic link → onboarding → first
  //      business, none of which can carry a query string.
  //   3. Neither — we refuse to guess, see the `not_found` branch below.
  const slugTyped = typeof slugRaw === "string" ? slugRaw.trim() : "";
  const slugFromForm = parseSlug(slugTyped);
  // A non-empty box we can't parse must NOT fall through to the cookie: they
  // typed one device and the cookie remembers another, and silently preferring
  // the cookie would bind the wrong stand to their business.
  if (slugTyped.length > 0 && slugFromForm === null) {
    return {
      error:
        "That doesn’t look like a device link. Paste the whole QR link printed on your product — it looks like repulabs.com/r/ABCD123456.",
    };
  }
  const slug = slugFromForm ?? (await readPendingSlug());

  // Optional pasted URL — must parse AND pass the storable-redirect check
  // (rejects javascript:/data:/file: schemes, IP-literal hosts, localhost in
  // production). Defends `/r/{slug}` against being weaponized as an open
  // redirect to phishing/malware destinations.
  let pastedUrl: string | null = null;
  if (typeof reviewUrlRaw === "string" && reviewUrlRaw.trim().length > 0) {
    const trimmed = reviewUrlRaw.trim();
    if (!isStorableRedirectUrl(trimmed)) {
      return {
        error:
          "That review link doesn’t look right. Paste a Google review URL (https://g.page/r/... or https://search.google.com/local/writereview?placeid=...).",
      };
    }
    pastedUrl = trimmed;
  }

  const codeHash = hashActivationCode(codeRaw);
  const codeNorm = codeRaw.replace(/[-\s]/g, "").toUpperCase();
  const isBatchOverride = SHARED_BATCH_CODE.length > 0 && codeNorm === SHARED_BATCH_CODE;

  // Everything below runs inside withTenant. The devices RLS policy allows
  // reads/writes where organization_id IS NULL OR = current_org(), so we can
  // find the unactivated device (org NULL) and update it to point at this org
  // in the same transaction.
  //
  // Kept as a callable (not awaited inline) so a transient database drop can be
  // retried — see the try/catch below.
  const claimDevice = () =>
    withTenant(orgId, async (tx) => {
      // Resolve the ONE device being activated.
      //  • Scanned (slug present): the slug is unique, so it pins the exact device.
      //    We still require the entered code to match THAT device's stored code.
      //  • Typed code only (no slug): only works when the code maps to exactly one
      //    unactivated device (a unique-code batch). If several devices share the
      //    code (the mis-printed batch), we refuse and ask them to scan — never
      //    guess a device, so we can't bind the wrong QR to a business.
      let device: Awaited<ReturnType<typeof tx.device.findFirst>> = null;
      if (slug) {
        device = await tx.device.findFirst({
          where: { shortSlug: slug, status: "unactivated", activationCodeUsedAt: null },
        });
        if (!device) {
          // Not claimable. Before calling it an error, check whether it's already
          // OURS — a double-tapped submit, or a stale /activate tab reopened after
          // the same stand was activated from the dashboard. RLS only shows us
          // unclaimed rows and our own, so a hit here is unambiguously this org's.
          const mine = await tx.device.findFirst({
            where: { shortSlug: slug },
            select: { organizationId: true, shortSlug: true },
          });
          if (mine?.organizationId === orgId) {
            return { ok: false as const, reason: "already_yours" as const, slug: mine.shortSlug };
          }
          // Unknown slug OR already claimed by another business (RLS hides other
          // orgs' devices) — one QR, one business, and it's already taken/invalid.
          return { ok: false as const, reason: "slug_unavailable" as const };
        }
        // Accept the device's real code OR the mis-printed batch code (84219).
        // The slug already pinned the exact unit; the batch override just tolerates
        // the wrong code printed on this batch's cards. Remove the override at the
        // next production run to require each unit's real code again.
        if (device.activationCodeHash !== codeHash && !isBatchOverride) {
          return { ok: false as const, reason: "code_mismatch" as const };
        }
      } else {
        const matches = await tx.device.findMany({
          where: {
            activationCodeHash: codeHash,
            status: "unactivated",
            activationCodeUsedAt: null,
          },
          take: 2,
        });
        if (matches.length > 1) {
          return { ok: false as const, reason: "ambiguous" as const };
        }
        device = matches[0] ?? null;
        if (!device) {
          return { ok: false as const, reason: "not_found" as const };
        }
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
      // Read the clock ONCE. /r/[slug] recomputes the signature expiry from
      // device.activatedAt, so the signed expiry base must be the exact instant
      // we persist as activatedAt — two separate clock reads can straddle a
      // second boundary and permanently break verification.
      const activatedAt = new Date();
      const expiresAtUnix = Math.floor(activatedAt.getTime() / 1000) + 60 * 60 * 24 * 365 * 5; // 5 years
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
          activatedAt,
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
            // Whether this activation leaned on the mis-printed shared batch code
            // rather than the unit's own code. Recorded so the override's real
            // blast radius is auditable, and so we can tell when the last of the
            // bad batch has been redeemed and the env flag can be turned off.
            batchOverride: device.activationCodeHash !== codeHash,
          },
        },
      });
      return { ok: true as const, device };
    });

  // A dropped Postgres connection (Prisma logs `kind: Closed` — routine on
  // pooled or auto-suspending Postgres) aborts the interactive transaction
  // mid-flight. That used to throw straight out of the action, which means
  // `useActionState` never received a state update: the form just sat there,
  // the customer saw NOTHING happen, and the device stayed unactivated with no
  // clue as to why. Both halves of that are fixed here — retry once, and if it
  // still fails, SAY so.
  //
  // Retrying is safe: the transaction rolled back, so nothing partial was
  // applied, and the claim is guarded on `status: "unactivated"` +
  // `organizationId: null`, so a re-run can never double-bind a device.
  let result: Awaited<ReturnType<typeof claimDevice>>;
  try {
    result = await claimDevice();
  } catch (err) {
    if (isTransientDbError(err)) {
      logger.warn(
        { orgId, err: String(err), event: "device.activation.db_retry" },
        "database connection dropped mid-activation — retrying once",
      );
      try {
        result = await claimDevice();
      } catch (retryErr) {
        logger.error(
          { orgId, err: String(retryErr), event: "device.activation.db_failed" },
          "activation failed after retry",
        );
        return {
          error:
            "We couldn’t reach the database just then, so nothing was changed. Give it a moment and try again.",
        };
      }
    } else {
      logger.error(
        { orgId, err: String(err), event: "device.activation.failed" },
        "activation transaction threw",
      );
      return {
        error:
          "Something went wrong activating this stand, and nothing was changed. Try again — if it keeps happening, contact support and quote the Product ID shown above.",
      };
    }
  }

  if (!result.ok) {
    if (result.reason === "already_yours") {
      // Idempotent: the stand they're pointing at is already live on this
      // account. Land them on it instead of showing a scary failure.
      await clearPendingSlug();
      revalidatePath("/hardware");
      redirect(`/hardware?activated=${result.slug}`);
    }
    if (result.reason === "ambiguous") {
      return {
        error:
          "This activation code is shared across several stands, so we can’t tell which one you mean. Scan the QR on the stand you’re setting up — that’s how we bind it to the right device.",
      };
    }
    if (result.reason === "slug_unavailable") {
      // One QR → one business. Already activated (by anyone) or unrecognized.
      logger.warn({ orgId, event: "device.activation.slug_unavailable" }, "slug not claimable");
      return {
        error:
          "This QR is already set up, or we don’t recognize it. Each stand can be activated by one business only — if you think this is a mistake, contact support.",
      };
    }
    if (result.reason === "code_mismatch") {
      return {
        error:
          "That activation code doesn’t match this QR. Check the 5-character code on the card inside this stand’s package.",
      };
    }
    if (result.reason === "not_found" || result.reason === "race_lost") {
      logger.warn(
        {
          orgId,
          hadSlug: slug !== null,
          batchCode: isBatchOverride,
          event: "device.activation.miss",
        },
        "activation code did not match any unactivated device",
      );
      if (isBatchOverride && slug === null) {
        // The dead end this whole change exists to remove: they typed the code
        // printed on the card, but every card in this batch carries the SAME
        // code, so on its own it matches nothing. Tell them how to give us the
        // one thing that does identify their unit.
        return {
          error:
            "We need to know which stand you’re setting up. Scan its QR with your phone and tap “Activate this QR”, or paste the QR link printed on the product into the “Your device” box above — the code on the card is the same on every stand in this batch, so it can’t identify yours by itself.",
        };
      }
      return {
        error:
          "We couldn’t match that activation code. Double-check the 5 characters from the card inside your package — codes are one-time-use and can’t be reused once redeemed.",
      };
    }
    return {
      error:
        "That business isn’t in your workspace. Add it on the Establishments page first, then come back here.",
    };
  }
  const device = result.device;

  logger.info(
    {
      orgId,
      deviceId: device.id,
      slug: device.shortSlug,
      establishmentId,
      batchOverride: device.activationCodeHash !== codeHash,
      event: "device.activated",
    },
    "device activated",
  );

  // This stand is bound now — forget the scan so the next activation on this
  // browser starts from a clean slate rather than re-offering a live device.
  await clearPendingSlug();

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
  const { orgId, userId } = await requireManagerOrg();

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
  // Read the clock ONCE — the signed expiry base must equal the stored
  // activatedAt (see /r/[slug] signature verification).
  const activatedAt = new Date();
  const expiresAtUnix = Math.floor(activatedAt.getTime() / 1000) + 60 * 60 * 24 * 365 * 5;
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
        activatedAt,
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
  const { orgId, userId } = await requireManagerOrg();
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
        // by setting a URL flips it active too. Persist the SAME `activatedAt`
        // the signature's expiry was derived from (above), not a fresh clock
        // read — otherwise /r/[slug] would recompute a different expiry and the
        // signature would never verify.
        ...(device.status === "active" || device.activatedAt
          ? {}
          : { status: "active", activatedAt }),
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
  const { orgId, userId } = await requireManagerOrg();
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
 * Permanently delete a retired device. IRREVERSIBLE.
 *
 * Deliberately narrower than `deleteDevice` (the soft delete) in three ways:
 *
 *   1. **Admin-gated, not manager.** Soft delete is recoverable from Trash, so
 *      manager is fine there. This one destroys data — hold it to a higher bar.
 *   2. **Only operates on `retired` rows.** You must soft-delete first, which
 *      makes "delete forever" a two-decision path rather than one misclick on
 *      a live device. An active QR can never be destroyed in a single action.
 *   3. **Audit-logged BEFORE the row goes**, with the full device payload in
 *      `beforeData` — slug, serial, SKU, redirect URL, scan count. Once the row
 *      is gone that audit entry is the only remaining evidence it ever existed,
 *      and it's what support has to work from if a customer disputes this.
 *
 * What actually goes: the `devices` row and, via `ON DELETE CASCADE`, all its
 * `device_scans`. So the unit's scan history disappears from analytics totals.
 * Reviews keep their `attributed_device_id` (a plain column, no FK), so they
 * survive as orphaned attributions rather than being deleted with the device.
 *
 * The QR itself is NOT recoverable afterwards: the slug is freed, so a printed
 * plaque bearing it becomes permanently dead (a scan 302s to /not-activated).
 * The UI says this in as many words before the second click.
 */
const PurgeDeviceSchema = z.object({
  deviceId: z.string().uuid(),
});

export async function permanentlyDeleteDevice(form: FormData): Promise<void> {
  const sessionOrg = await resolveSessionOrg();
  if (!sessionOrg) redirect("/login");
  const { orgId, userId, role } = sessionOrg;
  if (!roleAtLeast(role, "admin")) throw new ForbiddenError("admin", role);

  const parsed = PurgeDeviceSchema.safeParse({ deviceId: form.get("deviceId") });
  if (!parsed.success) throw new Error("invalid_device_id");

  await withTenant(orgId, async (tx) => {
    const device = await tx.device.findFirst({
      where: { id: parsed.data.deviceId },
      select: {
        id: true,
        shortSlug: true,
        serial: true,
        productSku: true,
        status: true,
        redirectUrl: true,
        establishmentId: true,
        scanCount: true,
        activatedAt: true,
      },
    });
    if (!device) throw new Error("device_not_found");
    // Guard: only ever destroy something already in Trash.
    if (device.status !== "retired") throw new Error("device_not_retired");

    // Write the tombstone FIRST — if the delete then fails we have a spurious
    // audit row, which is far better than destroying a device with no record.
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "device.purged",
        resourceType: "device",
        resourceId: device.id,
        beforeData: {
          shortSlug: device.shortSlug,
          serial: device.serial,
          productSku: device.productSku,
          redirectUrl: device.redirectUrl ?? null,
          establishmentId: device.establishmentId,
          scanCount: device.scanCount,
          activatedAt: device.activatedAt?.toISOString() ?? null,
        },
      },
    });

    await tx.device.delete({ where: { id: device.id } });
  });

  logger.warn(
    { event: "device.purged", orgId, userId, deviceId: parsed.data.deviceId },
    "device permanently deleted",
  );

  revalidatePath("/hardware");
  redirect("/hardware?view=trash&purged=1");
}

/**
 * Restore a soft-deleted device. Flips status from "retired" back to "active".
 *
 * Why this exists: customers occasionally hit the Delete button by mistake,
 * or test the flow on their own plaque and want it back. Without a restore
 * path, the only recovery was a support DB-write — bad UX.
 *
 * Security:
 *   - Single-tenant by RLS — only the org that retired the device can restore it.
 *   - Device.redirectUrl is preserved across retire/restore (we never null it
 *     on retire, exactly so this is a one-field flip).
 *   - The slug HMAC signature stays valid because redirectUrl + slug + expiry
 *     are unchanged. Edge redirect verifier will accept it without re-sign.
 *
 * Audit-logged before+after so a malicious or buggy double-restore is detectable.
 */
const RestoreDeviceSchema = z.object({
  deviceId: z.string().uuid(),
});

export async function restoreDevice(form: FormData): Promise<void> {
  const { orgId, userId } = await requireManagerOrg();
  const parsed = RestoreDeviceSchema.safeParse({ deviceId: form.get("deviceId") });
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
    if (device.status === "active") {
      // Already restored — idempotent, just bounce back.
      return;
    }
    if (device.status !== "retired") {
      throw new Error("device_not_retired");
    }

    await tx.device.update({
      where: { id: device.id },
      data: {
        status: "active",
        // activatedAt is intact from original activation — don't reset it.
        // redirect_url stayed populated through the retire, so the CHECK
        // constraint (devices_redirect_when_active) passes immediately.
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "device.restored",
        resourceType: "device",
        resourceId: device.id,
        beforeData: { status: "retired" },
        afterData: {
          shortSlug: device.shortSlug,
          status: "active",
          redirectUrl: device.redirectUrl ?? null,
          establishmentId: device.establishmentId,
        },
      },
    });
  });

  logger.info(
    { event: "device.restored", orgId, deviceId: parsed.data.deviceId },
    "device restored from trash",
  );

  revalidatePath("/hardware");
  redirect(`/hardware?restored=${parsed.data.deviceId}`);
}

/**
 * Re-target a device (e.g., establishment changes Google Place ID).
 */
export async function refreshDeviceRedirect(deviceId: string): Promise<void> {
  const { orgId, userId } = await requireManagerOrg();

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
    // The expiry base MUST be the device's ORIGINAL activatedAt (which we do
    // NOT change here) — /r/[slug] verifies against device.activatedAt. Signing
    // with Date.now() here would produce a signature that never validates,
    // dead-ending every scan at /not-activated?reason=signature.
    const expiresAtUnix =
      Math.floor((device.activatedAt ?? new Date()).getTime() / 1000) + 60 * 60 * 24 * 365 * 5;
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
