"use server";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import { deleteFromBlob } from "@/lib/uploads/blob";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { revalidatePath } from "next/cache";
import { z } from "zod";

/**
 * Content Library service (Module 10, Wave 3d) — CRUD over `ContentLibraryAsset`.
 *
 * Backs the Library tab, the composer's library picker, and AI-creative
 * "save to library". All reads/writes are tenant-scoped via `withTenant`.
 *
 * FAIL SOFT: the `content_library_assets` table does not exist in the live DB
 * until the founder applies the master migration. Reads catch Postgres 42P01 /
 * 42703 and return empty so the hub never 500s pre-migration; writes surface a
 * typed `library_not_migrated` error the UI can show as "set up storage first".
 */

const LISTED_FIELDS = {
  id: true,
  url: true,
  pathname: true,
  kind: true,
  mimeType: true,
  sizeBytes: true,
  width: true,
  height: true,
  folder: true,
  source: true,
  caption: true,
  createdAt: true,
} as const;

export type LibraryAsset = {
  id: string;
  url: string;
  pathname: string;
  kind: string;
  mimeType: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  folder: string | null;
  source: string;
  caption: string | null;
  createdAt: Date;
};

/**
 * Relation/column not migrated yet. Prisma model queries surface this as
 * P2021/P2022 — NOT the raw Postgres codes — so matching only 42P01/42703
 * meant the typed `library_not_migrated` path never fired and uploads failed
 * with the generic "Couldn't save to library" (bug 007 in the June 2026
 * assessment). Match both layers.
 */
function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  if (code === "42P01" || code === "42703" || code === "P2021" || code === "P2022") return true;
  const meta = (err as { meta?: { code?: string } } | null)?.meta;
  return meta?.code === "42P01" || meta?.code === "42703";
}

async function requireOrg() {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  const userId = session?.user?.id;
  if (!session || !orgId || !userId) throw new Error("unauthenticated");
  return { orgId, userId };
}

/**
 * List library assets (newest first), optionally filtered by folder. Paginated
 * via skip/take. Returns `[]` fail-soft (incl. pre-migration).
 */
export async function listLibraryAssets(
  orgId: string,
  opts: { folder?: string | null; skip?: number; take?: number } = {},
): Promise<LibraryAsset[]> {
  const take = Math.min(Math.max(opts.take ?? 60, 1), 200);
  const skip = Math.max(opts.skip ?? 0, 0);
  try {
    return (await withTenant(orgId, async (tx) =>
      tx.contentLibraryAsset.findMany({
        where: opts.folder !== undefined ? { folder: opts.folder } : {},
        orderBy: { createdAt: "desc" },
        skip,
        take,
        select: LISTED_FIELDS,
      }),
    )) as LibraryAsset[];
  } catch (err) {
    if (isMissingRelation(err)) {
      logger.warn({ orgId, event: "social.library.list.skipped_unmigrated" });
    } else {
      logger.warn({
        orgId,
        event: "social.library.list.failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return [];
  }
}

/** Distinct folder names for the library filter (fail-soft → []). */
export async function listLibraryFolders(orgId: string): Promise<string[]> {
  try {
    const rows = await withTenant(orgId, async (tx) =>
      tx.contentLibraryAsset.findMany({
        where: { folder: { not: null } },
        select: { folder: true },
        distinct: ["folder"],
        take: 100,
      }),
    );
    return rows.map((r) => r.folder).filter((f): f is string => Boolean(f)).sort();
  } catch (err) {
    if (!isMissingRelation(err)) {
      logger.warn({
        orgId,
        event: "social.library.folders.failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return [];
  }
}

const CreateAssetSchema = z.object({
  url: z.string().url().max(2000),
  pathname: z.string().min(1).max(500),
  kind: z.enum(["image", "video"]),
  mimeType: z.string().max(80).optional(),
  sizeBytes: z.coerce.number().int().positive().optional(),
  width: z.coerce.number().int().positive().optional(),
  height: z.coerce.number().int().positive().optional(),
  folder: z.string().max(120).optional(),
  source: z.enum(["upload", "ai_creative"]).default("upload"),
  caption: z.string().max(500).optional(),
  establishmentId: z.string().uuid().optional(),
});

export type CreateAssetInput = z.infer<typeof CreateAssetSchema>;

/**
 * Persist a library asset row (after the blob upload already happened via the
 * upload route / image-gen). Audited. Callable from a form action or directly.
 */
export async function createLibraryUpload(
  input: FormData | CreateAssetInput,
): Promise<{ id: string } | { error: string }> {
  const { orgId, userId } = await requireOrg();

  const raw =
    input instanceof FormData
      ? {
          url: input.get("url"),
          pathname: input.get("pathname"),
          kind: input.get("kind"),
          mimeType: (input.get("mimeType") as string) || undefined,
          sizeBytes: (input.get("sizeBytes") as string) || undefined,
          width: (input.get("width") as string) || undefined,
          height: (input.get("height") as string) || undefined,
          folder: (input.get("folder") as string) || undefined,
          source: (input.get("source") as string) || "upload",
          caption: (input.get("caption") as string) || undefined,
          establishmentId: (input.get("establishmentId") as string) || undefined,
        }
      : input;

  const parsed = CreateAssetSchema.safeParse(raw);
  if (!parsed.success) return { error: "invalid_input" };
  const d = parsed.data;

  try {
    const id = await withTenant(orgId, async (tx) => {
      const created = await tx.contentLibraryAsset.create({
        data: {
          organizationId: orgId,
          establishmentId: d.establishmentId ?? null,
          url: d.url,
          pathname: d.pathname,
          kind: d.kind,
          mimeType: d.mimeType ?? null,
          sizeBytes: d.sizeBytes ?? null,
          width: d.width ?? null,
          height: d.height ?? null,
          folder: d.folder ?? null,
          source: d.source,
          caption: d.caption ?? null,
        },
        select: { id: true },
      });
      return created.id;
    });

    // Best-effort audit OUTSIDE the asset transaction — an audit hiccup must
    // not roll back (and so fail) the upload itself.
    try {
      await withTenant(orgId, (tx) =>
        tx.auditLog.create({
          data: {
            organizationId: orgId,
            actorType: "user",
            actorId: userId,
            action: "content_library.asset_created",
            resourceType: "content_library_asset",
            resourceId: id,
            afterData: { kind: d.kind, source: d.source, folder: d.folder ?? null },
          },
        }),
      );
    } catch (err) {
      logger.warn({
        orgId,
        event: "social.library.create.audit_failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }

    revalidatePath("/social/posts");
    return { id };
  } catch (err) {
    if (isMissingRelation(err)) return { error: "library_not_migrated" };
    logger.error({
      orgId,
      event: "social.library.create.failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return { error: "create_failed" };
  }
}

/**
 * Delete an asset (admin-gated) — removes the blob then the row. Audited.
 * Fail-soft on missing relation.
 */
export async function deleteLibraryAsset(form: FormData): Promise<void> {
  const { orgId, userId } = await requireRole("admin");
  const id = z.string().uuid().parse(form.get("id"));

  try {
    const pathname = await withTenant(orgId, async (tx) => {
      const before = await tx.contentLibraryAsset.findFirst({
        where: { id },
        select: { pathname: true, kind: true },
      });
      if (!before) return null;
      await tx.contentLibraryAsset.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorType: "user",
          actorId: userId,
          action: "content_library.asset_deleted",
          resourceType: "content_library_asset",
          resourceId: id,
          beforeData: { kind: before.kind },
        },
      });
      return before.pathname;
    });
    // Best-effort blob delete outside the tx (a failed CDN delete shouldn't roll
    // back the row removal).
    if (pathname) await deleteFromBlob(pathname).catch(() => {});
  } catch (err) {
    if (isMissingRelation(err)) return;
    logger.error({
      orgId,
      event: "social.library.delete.failed",
      error: err instanceof Error ? err.message : String(err),
    });
    throw new Error("delete_failed");
  }
  revalidatePath("/social/posts");
}

const SetFolderSchema = z.object({
  id: z.string().uuid(),
  folder: z.string().max(120).nullable(),
});

/** Move an asset into (or out of) a folder. */
export async function setAssetFolder(form: FormData): Promise<void> {
  const { orgId } = await requireOrg();
  const folderRaw = form.get("folder");
  const parsed = SetFolderSchema.safeParse({
    id: form.get("id"),
    folder: folderRaw === null || folderRaw === "" ? null : folderRaw,
  });
  if (!parsed.success) throw new Error("invalid_input");
  try {
    await withTenant(orgId, async (tx) => {
      await tx.contentLibraryAsset.updateMany({
        where: { id: parsed.data.id },
        data: { folder: parsed.data.folder },
      });
    });
  } catch (err) {
    if (isMissingRelation(err)) return;
    throw err;
  }
  revalidatePath("/social/posts");
}

/** Rename a folder (bulk update all assets in `from` → `to`). */
export async function renameLibraryFolder(form: FormData): Promise<void> {
  const { orgId } = await requireOrg();
  const from = z.string().min(1).max(120).parse(form.get("from"));
  const to = z.string().max(120).parse(form.get("to"));
  try {
    await withTenant(orgId, async (tx) => {
      await tx.contentLibraryAsset.updateMany({
        where: { folder: from },
        data: { folder: to || null },
      });
    });
  } catch (err) {
    if (isMissingRelation(err)) return;
    throw err;
  }
  revalidatePath("/social/posts");
}
