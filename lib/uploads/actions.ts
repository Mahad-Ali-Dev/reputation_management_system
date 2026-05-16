"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { getAdminSession } from "@/lib/admin/session";
import { withTenant } from "@/lib/db/with-tenant";
import { uploadToBlob, type UploadContext, isUploadAllowed } from "./blob";

const ALLOWED_CONTEXTS: UploadContext[] = [
  "org_logo",
  "establishment_image",
  "social_post_media",
  "email_template_logo",
  "survey_template_logo",
];

const Schema = z.object({
  context: z.enum(ALLOWED_CONTEXTS as [UploadContext, ...UploadContext[]]),
});

/**
 * Server action: upload a file (multipart form) for a given context.
 *
 * Returns the public URL. Caller is responsible for storing it on the right
 * row (organizations.logoUrl, outreach_templates.logoUrl, etc.) — this action
 * deliberately doesn't write to other tables.
 */
export async function uploadFile(form: FormData): Promise<{ url: string; pathname: string }> {
  // Auth check — tenant or admin
  let orgId: string | null = null;
  const tenantSession = await auth();
  if (tenantSession?.user) {
    orgId = (tenantSession as { orgId?: string } | null)?.orgId ?? null;
  }
  if (!orgId) {
    const adminSession = await getAdminSession();
    if (adminSession) {
      orgId = "__admin__"; // synthetic org for admin uploads
    }
  }
  if (!orgId) redirect("/login");

  const parsed = Schema.safeParse({ context: form.get("context") });
  if (!parsed.success) throw new Error("invalid_context");

  const file = form.get("file");
  if (!(file instanceof File)) throw new Error("no_file_uploaded");

  const buffer = Buffer.from(await file.arrayBuffer());
  const validation = isUploadAllowed({
    context: parsed.data.context,
    mimeType: file.type,
    sizeBytes: buffer.byteLength,
  });
  if (!validation.ok) {
    throw new Error(`upload_rejected: ${validation.reason}`);
  }

  const result = await uploadToBlob({
    orgId,
    context: parsed.data.context,
    buffer,
    mimeType: file.type,
    filename: file.name || "upload",
  });

  // Audit if it's a tenant upload
  if (orgId !== "__admin__") {
    const auditOrgId = orgId;
    await withTenant(auditOrgId, (tx) =>
      tx.auditLog.create({
        data: {
          organizationId: auditOrgId,
          actorType: "user",
          actorId: tenantSession?.user?.id ?? auditOrgId,
          action: "file.uploaded",
          resourceType: "blob",
          afterData: {
            context: parsed.data.context,
            mimeType: file.type,
            sizeBytes: buffer.byteLength,
            pathname: result.pathname,
          },
        },
      }),
    );
  }

  return result;
}
