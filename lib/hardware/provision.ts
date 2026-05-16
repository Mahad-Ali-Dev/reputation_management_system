import { prisma } from "@/lib/db/client";
import { logger } from "@/lib/logger";
import { generateActivationCode, generateSerial, generateSlug, signSlug } from "./codes";

/**
 * Provision N devices for a paid hardware order.
 *
 * Called from the Stripe webhook handler when `checkout.session.completed` fires for a
 * hardware-order session (mode=payment, metadata.hardwareOrderId set).
 *
 * Each device starts in `unactivated` status with:
 *   - unique short_slug (10-char Crockford base32)
 *   - hashed activation_code (plaintext returned for the print-label PDF)
 *   - placeholder slug_signature (real signature is computed at activation time with the redirect_url)
 *
 * Returns the plaintext activation codes so the caller can render the label PDF.
 * They are NOT persisted in plaintext (only their SHA-256 hash).
 *
 * Idempotent: skips if devices for this order already exist.
 */
export async function provisionDevicesForOrder(orderId: string): Promise<{
  provisioned: number;
  activationCodes: Array<{ deviceId: string; slug: string; serial: string; codePlaintext: string }>;
}> {
  // Read order + items + product info
  const order = await prisma.hardwareOrder.findUnique({
    where: { id: orderId },
    include: {
      items: { include: { product: true } },
      devices: { select: { id: true } },
    },
  });
  if (!order) throw new Error(`order_not_found: ${orderId}`);

  if (order.devices.length > 0) {
    logger.info(
      { orderId, alreadyProvisioned: order.devices.length, event: "hardware.provision.skip" },
      "devices already provisioned for this order",
    );
    return { provisioned: 0, activationCodes: [] };
  }

  // Compute total quantity (sum of items.quantity * product.units_per_pack)
  let totalUnits = 0;
  for (const item of order.items) {
    totalUnits += item.quantity * item.product.unitsPerPack;
  }
  if (totalUnits === 0) throw new Error(`order_has_no_units: ${orderId}`);

  // For each item, allocate N devices. We attribute device.product_sku to the item's product.
  const out: Array<{ deviceId: string; slug: string; serial: string; codePlaintext: string }> = [];

  await prisma.$transaction(async (tx) => {
    for (const item of order.items) {
      const units = item.quantity * item.product.unitsPerPack;
      for (let i = 0; i < units; i++) {
        const slug = generateSlug();
        const serial = generateSerial();
        const { plaintext, hash } = generateActivationCode();
        // Sign a placeholder so the field isn't empty; real signature set on activation when
        // the redirect_url is known. The literal value doesn't matter — it's overwritten on
        // activation — but we use the production domain so any leak isn't misleading.
        const placeholderRedirect = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://repulabs.com"}/not-activated`;
        const expiresAtUnix = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365 * 5;
        const placeholderSig = signSlug(slug, placeholderRedirect, expiresAtUnix);

        const device = await tx.device.create({
          data: {
            organizationId: null, // assigned at activation time
            establishmentId: null,
            orderId: order.id,
            productSku: item.product.sku,
            serial,
            shortSlug: slug,
            slugSignature: placeholderSig,
            activationCodeHash: hash,
            status: "unactivated",
          },
        });
        out.push({ deviceId: device.id, slug, serial, codePlaintext: plaintext });
      }
    }
  });

  logger.info(
    { orderId, provisioned: out.length, event: "hardware.provisioned" },
    "devices provisioned for order",
  );

  return { provisioned: out.length, activationCodes: out };
}
