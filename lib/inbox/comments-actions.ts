"use server";

/**
 * Comments tab — SERVER ACTIONS (Module 09 — Inbox, Wave 3c-A).
 *
 * Split out of `lib/inbox/comments.ts` because the client island
 * (`comments-panel.tsx`) imports these mutators directly. Next.js only lets a
 * Client Component import Server Actions from a module that carries a TOP-LEVEL
 * "use server" directive — a module that ALSO exports sync helpers/types (like
 * comments.ts, which the server panel reads from) can't carry that directive, so
 * the actions live here. comments.ts keeps the pure helpers + RSC-only reads.
 *
 * CRITICAL DISTINCTION (guardrail): FB/IG comments are SOCIAL comments and ARE
 * hideable via the platform APIs. Google ("google_qa") rows are NOT hideable —
 * they can only be REPLIED to. `canHide()` (imported from comments.ts) encodes
 * this and `hideComment` hard-refuses Google so the UI can never imply a Google
 * review/comment is hideable.
 */

import { revalidatePath } from "next/cache";
import { assist } from "@/lib/ai/assist";
import { getOrgContext } from "@/lib/auth/org-context";
import { requireRole } from "@/lib/auth/rbac";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { evaluateInbound } from "@/lib/moderation/queue";
import { canHide, platformLabel } from "./comments";

/**
 * Hide a SOCIAL comment (FB/IG only). Refuses Google — Google comments/reviews
 * cannot be hidden via API. When a Meta connection exists (Phase 3 adapter),
 * the hide is mirrored to the platform; until then this updates status only.
 */
export async function hideComment(form: FormData): Promise<void> {
  const { orgId, userId } = await requireRole("manager");
  const id = String(form.get("id") ?? "");
  if (!id) return;

  await withTenant(orgId, async (tx) => {
    const c = await tx.socialComment.findUnique({ where: { id } });
    if (!c) return;
    if (!canHide(c.platform)) {
      // Hard refusal — never hide Google. Surface as an error to the caller.
      throw new Error("Google comments and reviews can't be hidden — you can only reply to them.");
    }
    await tx.socialComment.update({ where: { id }, data: { status: "hidden" } });
  });

  logger.info({ orgId, userId, commentId: id, event: "inbox.comment.hidden" });
  revalidatePath("/support");
}

/** Un-hide a previously hidden social comment → back to needs_reply. */
export async function unhideComment(form: FormData): Promise<void> {
  const { orgId } = await requireRole("manager");
  const id = String(form.get("id") ?? "");
  if (!id) return;
  await withTenant(orgId, async (tx) => {
    await tx.socialComment
      .update({ where: { id }, data: { status: "needs_reply" } })
      .catch(() => undefined);
  });
  revalidatePath("/support");
}

/** Star/favorite a comment (status "starred"). Toggles starred ↔ needs_reply. */
export async function favoriteComment(form: FormData): Promise<void> {
  const { orgId } = await requireRole("manager");
  const id = String(form.get("id") ?? "");
  if (!id) return;
  await withTenant(orgId, async (tx) => {
    const c = await tx.socialComment.findUnique({ where: { id } });
    if (!c) return;
    const next = c.status === "starred" ? "needs_reply" : "starred";
    await tx.socialComment.update({ where: { id }, data: { status: next } });
  });
  revalidatePath("/support");
}

/** Assign a comment to a team member (or clear with empty userId). */
export async function assignComment(form: FormData): Promise<void> {
  const { orgId } = await requireRole("manager");
  const id = String(form.get("id") ?? "");
  const assignee = String(form.get("userId") ?? "").trim();
  if (!id) return;
  await withTenant(orgId, async (tx) => {
    await tx.socialComment
      .update({ where: { id }, data: { assignedTo: assignee || null } })
      .catch(() => undefined);
  });
  revalidatePath("/support");
}

/**
 * Reply to a comment. Records the reply by marking the comment "replied" +
 * stamping respondedAt. When a Meta connection exists (Phase 3), the body is
 * sent to the platform; until then this is a store-only state change so the
 * unified queue reflects that it was handled. Works for BOTH social comments
 * and Google Q&A (reply is the only allowed Google action).
 */
export async function replyToComment(form: FormData): Promise<void> {
  const { orgId, userId } = await requireRole("manager");
  const id = String(form.get("id") ?? "");
  const body = String(form.get("body") ?? "").trim();
  if (!id || !body) {
    throw new Error("A reply message is required.");
  }
  await withTenant(orgId, async (tx) => {
    const c = await tx.socialComment.findUnique({ where: { id } });
    if (!c) return;
    await tx.socialComment.update({
      where: { id },
      data: { status: "replied", respondedAt: new Date() },
    });
  });
  logger.info({ orgId, userId, commentId: id, event: "inbox.comment.replied" });
  revalidatePath("/support");
}

/** Delete a comment from our queue (does NOT delete from the platform). Manager+. */
export async function deleteComment(form: FormData): Promise<void> {
  const { orgId } = await requireRole("manager");
  const id = String(form.get("id") ?? "");
  if (!id) return;
  await withTenant(orgId, async (tx) => {
    await tx.socialComment.delete({ where: { id } }).catch(() => undefined);
  });
  revalidatePath("/support");
}

/**
 * Flag a comment for moderation review. Runs the moderation engine against it
 * and enqueues a `ModerationItem` so it appears in the Moderation queue. Only
 * meaningful for FB/IG (the engine refuses other sources). Fail-soft.
 */
export async function flagComment(form: FormData): Promise<void> {
  const { orgId } = await requireRole("manager");
  const id = String(form.get("id") ?? "");
  if (!id) return;

  const comment = await withTenant(orgId, async (tx) =>
    tx.socialComment.findUnique({ where: { id } }),
  );
  if (!comment) return;

  const source =
    comment.platform === "facebook"
      ? "facebook"
      : comment.platform === "instagram"
        ? "instagram"
        : null;
  if (!source) {
    // Google etc. can't be moderated/hidden — flagging is a no-op.
    revalidatePath("/support");
    return;
  }

  await evaluateInbound({
    orgId,
    source,
    sourceType: "comment",
    sourceId: comment.id,
    externalId: comment.externalId,
    authorName: comment.authorName,
    body: comment.body,
  }).catch((err) => {
    logger.warn({
      orgId,
      event: "inbox.comment.flag_failed",
      error: err instanceof Error ? err.message : String(err),
    });
  });

  revalidatePath("/support");
}

/**
 * Draft an AI reply suggestion for a comment via AiAssist (purpose
 * "inbox_reply"). Returns the best option text; the client fills the composer.
 * Env-/budget-/entitlement-safe via AiAssist internals; returns "" on any
 * failure so the UI degrades to manual.
 */
export async function suggestCommentReply(commentId: string): Promise<{ text: string }> {
  const { orgId } = await getOrgContext();
  const comment = await withTenant(orgId, async (tx) =>
    tx.socialComment.findUnique({ where: { id: commentId } }),
  );
  if (!comment) return { text: "" };

  try {
    const result = await assist({
      orgId,
      purpose: "inbox_reply",
      input: `Write a brief, friendly public reply to this ${platformLabel(comment.platform)} comment.`,
      domainContext: { primaryText: comment.body },
      n: 1,
    });
    const best = result.options.find((o) => !o.blocked) ?? result.options[0];
    return { text: best?.text ?? "" };
  } catch (err) {
    logger.warn({
      orgId,
      event: "inbox.comment.suggest_failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return { text: "" };
  }
}
