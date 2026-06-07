"use server";

import { auth } from "@/lib/auth/config";
import { encrypt } from "@/lib/crypto/envelope";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

// ─── Validation ──────────────────────────────────────────────

const AddressSchema = z
  .object({
    line1: z.string().max(200).optional(),
    line2: z.string().max(200).optional(),
    city: z.string().max(100).optional(),
    region: z.string().max(100).optional(),
    postal: z.string().max(20).optional(),
    // Accept either ISO 2-letter codes or full country names — normalize later.
    country: z.string().max(60).optional(),
  })
  .partial();

const CreateSchema = z.object({
  name: z.string().min(1).max(120),
  category: z.string().max(60).optional().or(z.literal("")),
  timezone: z.string().max(60).default("UTC"),
  address: AddressSchema.optional(),
});

/**
 * Airbnb-listing onboarding payload.
 *
 * We accept the public listing URL and extract the numeric listing id
 * (`/rooms/12345`) ourselves — hosts copy-paste the URL from their
 * browser tab; expecting them to find the id is friction we don't need.
 *
 * `houseRules` is free-text; we cap at 4 KB so it fits in a single email
 * body without truncation. WiFi credentials are stored encrypted at rest
 * (see schema comment) — never persist the plaintext password into our
 * normal logs.
 */
const CreateAirbnbSchema = z.object({
  name: z.string().min(1).max(120),
  timezone: z.string().max(60).default("UTC"),
  airbnbListingUrl: z
    .string()
    .url()
    .max(500)
    .refine((u) => /airbnb\.[a-z.]+\/rooms\/\d+/i.test(u), {
      message: "URL must look like https://www.airbnb.com/rooms/12345678",
    }),
  directBookingUrl: z.string().url().max(500).optional().or(z.literal("")),
  houseRules: z.string().max(4000).optional().or(z.literal("")),
  wifiSsid: z.string().max(128).optional().or(z.literal("")),
  wifiPassword: z.string().max(256).optional().or(z.literal("")),
});

function extractAirbnbListingId(url: string): string | null {
  const m = url.match(/airbnb\.[a-z.]+\/rooms\/(\d{6,12})/i);
  return m?.[1] ?? null;
}

// ─── Helpers ──────────────────────────────────────────────────

async function requireOrg(): Promise<{ orgId: string; userId: string; email: string }> {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  const userId = session?.user?.id;
  const email = session?.user?.email;
  if (!session || !orgId || !userId || !email) redirect("/login");
  return { orgId, userId, email };
}

function fd(form: FormData, key: string): string | undefined {
  const v = form.get(key);
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

// ─── Actions ──────────────────────────────────────────────────

export async function createEstablishment(form: FormData): Promise<void> {
  const { orgId, userId } = await requireOrg();

  const parsed = CreateSchema.safeParse({
    name: fd(form, "name"),
    category: fd(form, "category"),
    timezone: fd(form, "timezone") ?? "UTC",
    address: {
      line1: fd(form, "address_line1"),
      city: fd(form, "address_city"),
      region: fd(form, "address_region"),
      postal: fd(form, "address_postal"),
      country: fd(form, "address_country"),
    },
  });
  if (!parsed.success) {
    throw new Error(`Validation failed: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }
  const data = parsed.data;

  const created = await withTenant(orgId, async (tx) => {
    const e = await tx.establishment.create({
      data: {
        organizationId: orgId,
        name: data.name,
        category: data.category || null,
        timezone: data.timezone,
        address: data.address ?? undefined,
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "establishment.created",
        resourceType: "establishment",
        resourceId: e.id,
        afterData: { id: e.id, name: e.name },
      },
    });
    return e;
  });

  logger.info(
    { orgId, establishmentId: created.id, event: "establishment.created" },
    "establishment created",
  );

  revalidatePath("/establishments");
  redirect(`/establishments/${created.id}`);
}

export async function updateEstablishment(id: string, form: FormData): Promise<void> {
  const { orgId, userId } = await requireOrg();

  const parsed = CreateSchema.partial().safeParse({
    name: fd(form, "name"),
    category: fd(form, "category"),
    timezone: fd(form, "timezone"),
    address: {
      line1: fd(form, "address_line1"),
      city: fd(form, "address_city"),
      region: fd(form, "address_region"),
      postal: fd(form, "address_postal"),
      country: fd(form, "address_country"),
    },
  });
  if (!parsed.success) {
    throw new Error(`Validation failed: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }
  const data = parsed.data;

  await withTenant(orgId, async (tx) => {
    const before = await tx.establishment.findFirst({ where: { id } });
    if (!before) return; // RLS hid it OR doesn't exist — 404-ish (no leak)

    const after = await tx.establishment.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.category !== undefined && { category: data.category || null }),
        ...(data.timezone !== undefined && { timezone: data.timezone }),
        ...(data.address !== undefined && { address: data.address }),
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "establishment.updated",
        resourceType: "establishment",
        resourceId: after.id,
        beforeData: { name: before.name, category: before.category },
        afterData: { name: after.name, category: after.category },
      },
    });
  });

  revalidatePath(`/establishments/${id}`);
  revalidatePath("/establishments");
}

export async function deleteEstablishment(id: string) {
  const { orgId, userId } = await requireOrg();

  await withTenant(orgId, async (tx) => {
    const before = await tx.establishment.findFirst({ where: { id, deletedAt: null } });
    if (!before) return;
    await tx.establishment.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "establishment.deleted",
        resourceType: "establishment",
        resourceId: id,
        beforeData: { name: before.name },
      },
    });
  });

  revalidatePath("/establishments");
  redirect("/establishments");
}

// UUID v1–v5 guard, same shape used on the detail page route.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Disconnect the active Google Business Profile connection for an
 * establishment. Soft-revoke only (`status: "revoked"`) — mirrors the dedupe
 * path already in the OAuth callback. We never hard-delete: the
 * envelope-encrypted tokens stay for audit/rotation, and reconnect re-runs the
 * existing OAuth flow which revokes-then-creates.
 *
 * Safe by construction: the `updateMany` is both org-scoped (explicit
 * `organizationId` in the where, defense-in-depth) AND runs inside
 * `withTenant` (RLS). A foreign/garbage `establishmentId` simply updates 0
 * rows and never throws or leaks.
 */
export async function disconnectGoogle(form: FormData): Promise<void> {
  const { orgId, userId } = await requireOrg();

  const establishmentId = fd(form, "establishmentId");
  // Bail quietly on a missing/malformed id — no throw, no leak.
  if (!establishmentId || !UUID_RE.test(establishmentId)) {
    revalidatePath("/establishments");
    return;
  }

  await withTenant(orgId, async (tx) => {
    const result = await tx.connection.updateMany({
      where: {
        organizationId: orgId,
        establishmentId,
        provider: "google_business",
        status: "active",
      },
      data: { status: "revoked" },
    });
    // Only audit-log when something actually changed.
    if (result.count > 0) {
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorType: "user",
          actorId: userId,
          action: "connection.disconnected",
          resourceType: "connection",
          resourceId: establishmentId,
          afterData: { provider: "google_business", establishmentId, revoked: result.count },
        },
      });
    }
  });

  revalidatePath(`/establishments/${establishmentId}`);
  revalidatePath("/establishments");
}

export async function setGooglePlaceId(establishmentId: string, placeId: string): Promise<void> {
  const { orgId, userId } = await requireOrg();
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(placeId)) {
    throw new Error("invalid_place_id");
  }

  await withTenant(orgId, async (tx) => {
    await tx.establishment.update({
      where: { id: establishmentId },
      data: { googlePlaceId: placeId },
    });
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "establishment.google_place_linked",
        resourceType: "establishment",
        resourceId: establishmentId,
        afterData: { google_place_id: placeId },
      },
    });
  });

  revalidatePath(`/establishments/${establishmentId}`);
}

// ─── Airbnb listing onboarding ────────────────────────────────

/**
 * State returned by `createAirbnbListing` for the `useActionState` hook on
 * the onboarding form. Same pattern as `activateDevice` — return an error
 * shape instead of throwing, so the form can render an inline message.
 */
export type CreateAirbnbListingState = {
  error: string | null;
  fieldErrors?: Partial<Record<string, string>>;
};

/**
 * Create an Establishment with kind="airbnb_listing".
 *
 * Differences vs. the standard business onboarding:
 *   - The listing URL is required, and we extract the numeric Airbnb id
 *     from it (so we can later match inbound review emails by listing id).
 *   - House rules + WiFi credentials live on the same row — they're
 *     metadata the welcome-flow QR will surface to guests.
 *   - WiFi password is encrypted at rest via envelope encryption. We
 *     decrypt only at NFC programming time, never log it, and never
 *     return it to the dashboard except masked.
 *
 * Audit-logged. Address/category are optional for STR hosts (some don't
 * have a public address listed for safety reasons).
 */
export async function createAirbnbListing(
  _prev: CreateAirbnbListingState,
  form: FormData,
): Promise<CreateAirbnbListingState> {
  const { orgId, userId } = await requireOrg();

  const parsed = CreateAirbnbSchema.safeParse({
    name: fd(form, "name"),
    timezone: fd(form, "timezone") ?? "UTC",
    airbnbListingUrl: fd(form, "airbnb_listing_url"),
    directBookingUrl: fd(form, "direct_booking_url") ?? "",
    houseRules: fd(form, "house_rules") ?? "",
    wifiSsid: fd(form, "wifi_ssid") ?? "",
    wifiPassword: fd(form, "wifi_password") ?? "",
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string") fieldErrors[key] = issue.message;
    }
    return {
      error: "Please correct the highlighted fields and try again.",
      fieldErrors,
    };
  }
  const data = parsed.data;
  const listingId = extractAirbnbListingId(data.airbnbListingUrl);

  // Encrypt the WiFi password if provided. We use the existing envelope
  // module with purpose="general" — same module that handles OAuth tokens,
  // so rotation tooling already covers it.
  //
  // Prisma's `Bytes` column maps to `Uint8Array<ArrayBuffer>` in TS but
  // `encrypt()` returns `Buffer<ArrayBufferLike>`. Use the same copy
  // pattern as `lib/connections/oauth-helpers.ts` to coerce. Cheap copy
  // (~30 bytes for IV, ~20–280 bytes for ciphertext) — not a hot path.
  const toBytes = (b: Buffer): Uint8Array<ArrayBuffer> => {
    const out = new Uint8Array(new ArrayBuffer(b.byteLength));
    out.set(b);
    return out;
  };
  let wifiCt: Uint8Array<ArrayBuffer> | null = null;
  let wifiIv: Uint8Array<ArrayBuffer> | null = null;
  if (data.wifiPassword && data.wifiPassword.length > 0) {
    try {
      const enc = encrypt(data.wifiPassword, {
        orgId,
        provider: "wifi",
        purpose: "general",
      });
      wifiCt = toBytes(enc.ciphertext);
      wifiIv = toBytes(enc.iv);
    } catch (err) {
      // If encryption fails (missing master key), refuse to write a row
      // with plaintext — fail closed, never store the plaintext.
      logger.error(
        {
          err: err instanceof Error ? err.message : String(err),
          orgId,
          event: "establishment.airbnb.wifi_encrypt_failed",
        },
        "WiFi password encryption failed; aborting create",
      );
      return {
        error:
          "Couldn't securely store the WiFi password. Leave it blank for now and add it later from the listing's edit page.",
        fieldErrors: { wifiPassword: "encryption_failed" },
      };
    }
  }

  const created = await withTenant(orgId, async (tx) => {
    const e = await tx.establishment.create({
      data: {
        organizationId: orgId,
        kind: "airbnb_listing",
        name: data.name,
        timezone: data.timezone,
        airbnbListingUrl: data.airbnbListingUrl,
        airbnbListingId: listingId,
        directBookingUrl: data.directBookingUrl || null,
        houseRules: data.houseRules || null,
        wifiSsid: data.wifiSsid || null,
        wifiPasswordCt: wifiCt,
        wifiPasswordIv: wifiIv,
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "establishment.created",
        resourceType: "establishment",
        resourceId: e.id,
        afterData: {
          id: e.id,
          name: e.name,
          kind: "airbnb_listing",
          airbnbListingId: listingId,
          // Never write the WiFi password itself to the audit log.
          wifiSsidConfigured: !!data.wifiSsid,
          wifiPasswordConfigured: !!wifiCt,
        },
      },
    });
    return e;
  });

  logger.info(
    {
      orgId,
      establishmentId: created.id,
      airbnbListingId: listingId,
      event: "establishment.airbnb.created",
    },
    "airbnb listing onboarded",
  );

  revalidatePath("/establishments");
  redirect(`/establishments/${created.id}?onboarded=airbnb`);
}
