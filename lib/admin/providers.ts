"use server";

import { getAdminSession } from "@/lib/admin/session";
import { META_PROVIDER } from "@/lib/connections/adapters/meta-overlay";
import { encrypt } from "@/lib/crypto/envelope";
import { prisma } from "@/lib/db/client";
import { PROVIDERS } from "@/lib/providers/registry";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

const SaveSchema = z.object({
  provider: z.string().min(1).max(40),
  clientId: z.string().min(1).max(500),
  clientSecret: z.string().min(1).max(500),
  scopes: z.string().max(1000).optional(), // newline or comma separated
});

/**
 * Admin-only action to store provider OAuth credentials.
 *
 * Client secret is envelope-encrypted with EncryptionContext bound to
 * the provider key so leaked DEKs can't be cross-decrypted between providers.
 */
export async function saveProviderApp(form: FormData): Promise<void> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (!["super_admin", "engineering"].includes(session.role)) {
    throw new Error("forbidden: only super_admin or engineering can configure providers");
  }

  const parsed = SaveSchema.safeParse({
    provider: form.get("provider"),
    clientId: form.get("clientId"),
    clientSecret: form.get("clientSecret"),
    scopes: (form.get("scopes") as string) || undefined,
  });
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join("; "));

  // `meta` is an OVERLAY, not a registry entry — a bare PROVIDERS lookup threw
  // "Unknown provider: meta" out of this bare form action, which surfaces as the
  // generic crash page. Resolve it the same way the page and the customer-facing
  // connections list do.
  const entry = parsed.data.provider === "meta" ? META_PROVIDER : PROVIDERS[parsed.data.provider];
  if (!entry) throw new Error(`Unknown provider: ${parsed.data.provider}`);

  // Envelope encrypt the secret. We use a synthetic orgId of "__provider_app__"
  // since this is a global (cross-tenant) credential — the EncryptionContext
  // type expects orgId, provider, purpose.
  const encrypted = encrypt(parsed.data.clientSecret, {
    orgId: "__provider_app__",
    provider: parsed.data.provider,
    purpose: "oauth",
  });

  // Parse scopes — split on comma or newline
  const scopes = parsed.data.scopes
    ? parsed.data.scopes
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    : (entry.scopes ?? []);

  await prisma.providerApp.upsert({
    where: { provider: parsed.data.provider },
    update: {
      clientId: parsed.data.clientId,
      clientSecretCt: Buffer.from(encrypted.ciphertext),
      clientSecretIv: Buffer.from(encrypted.iv),
      clientSecretAad: encrypted.encryptionContext,
      scopes,
      status: "configured",
    },
    create: {
      provider: parsed.data.provider,
      displayName: entry.displayName,
      category: entry.category,
      clientId: parsed.data.clientId,
      clientSecretCt: Buffer.from(encrypted.ciphertext),
      clientSecretIv: Buffer.from(encrypted.iv),
      clientSecretAad: encrypted.encryptionContext,
      scopes,
      oauthUrl: entry.oauthUrl ?? null,
      tokenUrl: entry.tokenUrl ?? null,
      redirectPath: `/api/connections/${parsed.data.provider}/callback`,
      status: "configured",
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: null,
      actorType: "admin_user",
      actorId: session.adminId,
      action: "provider_app.configured",
      resourceType: "provider_app",
      afterData: { provider: parsed.data.provider, scopesCount: scopes.length },
    },
  });

  revalidatePath("/admin/providers");
  revalidatePath(`/admin/providers/${parsed.data.provider}`);
  revalidatePath("/connections");
}

export async function disableProviderApp(form: FormData): Promise<void> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (session.role !== "super_admin") throw new Error("forbidden");

  const provider = z.string().min(1).parse(form.get("provider"));
  await prisma.providerApp.update({
    where: { provider },
    data: { status: "disabled" },
  });
  await prisma.auditLog.create({
    data: {
      organizationId: null,
      actorType: "admin_user",
      actorId: session.adminId,
      action: "provider_app.disabled",
      resourceType: "provider_app",
      afterData: { provider },
    },
  });
  revalidatePath("/admin/providers");
}
