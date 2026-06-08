"use server";

import { MODELS, anthropic } from "@/lib/ai/client";
import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import { assertEntitled } from "@/lib/billing/entitlements";
import { dispatchDuePost } from "@/lib/social/dispatch";
import {
  generateCaptions as generateCaptionsV2,
  type GenerateCaptionsResult,
} from "@/lib/social/captions";
import { withTenant } from "@/lib/db/with-tenant";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

/**
 * Extended caption generator (3 options + tone/CTA/emoji/hashtag toggles),
 * surfaced from here so the rest of the app has one import surface for social
 * captions. Defined as a local async wrapper (not a bare re-export) so it's a
 * first-class server action of THIS `"use server"` module. The inline
 * single-option `generateSocialCaption` below stays working for the legacy form
 * during the staged build.
 */
export async function generateCaptions(form: FormData): Promise<GenerateCaptionsResult> {
  return generateCaptionsV2(form);
}

const PostSchema = z.object({
  caption: z.string().max(3000).optional(),
  hashtags: z.string().max(500).optional(), // comma or space separated
  platforms: z.string().min(1).max(200), // comma-separated
  mediaUrl: z.string().url().max(2000).or(z.literal("")).optional(),
  mediaType: z.enum(["image", "video", "reel"]).optional(),
  /** JSON array of media URLs (carousel). First becomes the legacy mediaUrl. */
  mediaUrls: z.string().max(8000).optional(),
  isAiCaption: z.coerce.boolean().optional(),
  scheduledFor: z.string().datetime().optional(),
  establishmentId: z.string().uuid().optional(),
});

/** Parse the optional mediaUrls JSON field → a sane, deduped URL array. */
function parseMediaUrls(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return [...new Set(arr.filter((u) => typeof u === "string" && u.length > 0))].slice(0, 10);
  } catch {
    return [];
  }
}

async function requireOrg() {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  const userId = session?.user?.id;
  if (!session || !orgId || !userId) redirect("/login");
  return { orgId, userId };
}

export async function createSocialPost(form: FormData): Promise<void> {
  const { orgId } = await requireOrg();
  const parsed = PostSchema.safeParse({
    caption: (form.get("caption") as string) || undefined,
    hashtags: (form.get("hashtags") as string) || undefined,
    platforms: form.get("platforms"),
    mediaUrl: (form.get("mediaUrl") as string) || undefined,
    mediaType: (form.get("mediaType") as string) || undefined,
    mediaUrls: (form.get("mediaUrls") as string) || undefined,
    isAiCaption: (form.get("isAiCaption") as string) || undefined,
    scheduledFor: (form.get("scheduledFor") as string) || undefined,
    establishmentId: (form.get("establishmentId") as string) || undefined,
  });
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  const d = parsed.data;

  const platforms = d.platforms
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (platforms.length === 0) throw new Error("Pick at least one platform");

  const hashtags = d.hashtags
    ? d.hashtags
        .split(/[,\s]+/)
        .map((t) => t.trim().replace(/^#/, ""))
        .filter(Boolean)
        .map((t) => `#${t}`)
    : [];

  // Carousel media: the full ordered set lives in approvedCreativeUrls; the
  // first item also fills the legacy single mediaUrl for back-compat.
  const mediaUrls = parseMediaUrls(d.mediaUrls);
  const primaryMedia = d.mediaUrl || mediaUrls[0] || null;

  const scheduledFor = d.scheduledFor ? new Date(d.scheduledFor) : null;
  const status = scheduledFor && scheduledFor.getTime() > Date.now() ? "scheduled" : "draft";

  await withTenant(orgId, async (tx) => {
    await tx.socialPost.create({
      data: {
        organizationId: orgId,
        establishmentId: d.establishmentId ?? null,
        platforms,
        caption: d.caption ?? null,
        hashtags,
        mediaUrl: primaryMedia,
        mediaType: d.mediaType ?? (primaryMedia ? "image" : null),
        approvedCreativeUrls: mediaUrls,
        isAiCaption: d.isAiCaption ?? false,
        scheduledFor,
        status,
      },
    });
  });

  revalidatePath("/social/posts");
  revalidatePath("/social/calendar");
}

/**
 * Publish Now — create (or reuse) a post in the `publishing` claim state and
 * dispatch it synchronously. Publishing is a paid action → entitlement-gated.
 * The dispatch core is env-gated; with no connected platform it stub-publishes
 * in dev / fails cleanly in prod (no live paid call by default).
 */
export async function publishSocialPostNow(form: FormData): Promise<void> {
  const { orgId } = await requireOrg();
  await assertEntitled(orgId);

  const existingId = (form.get("id") as string) || "";
  let postId: string;

  if (existingId) {
    const id = z.string().uuid().parse(existingId);
    // Claim an existing draft/scheduled/failed row into publishing.
    const claimed = await withTenant(orgId, async (tx) =>
      tx.socialPost.updateMany({
        where: { id, status: { in: ["draft", "scheduled", "failed"] } },
        data: { status: "publishing", error: null },
      }),
    );
    if (claimed.count === 0) throw new Error("post_not_publishable");
    postId = id;
  } else {
    const parsed = PostSchema.safeParse({
      caption: (form.get("caption") as string) || undefined,
      hashtags: (form.get("hashtags") as string) || undefined,
      platforms: form.get("platforms"),
      mediaUrl: (form.get("mediaUrl") as string) || undefined,
      mediaType: (form.get("mediaType") as string) || undefined,
      mediaUrls: (form.get("mediaUrls") as string) || undefined,
      isAiCaption: (form.get("isAiCaption") as string) || undefined,
      establishmentId: (form.get("establishmentId") as string) || undefined,
    });
    if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
    const d = parsed.data;
    const platforms = d.platforms.split(",").map((p) => p.trim()).filter(Boolean);
    if (platforms.length === 0) throw new Error("Pick at least one platform");
    const hashtags = d.hashtags
      ? d.hashtags.split(/[,\s]+/).map((t) => t.trim().replace(/^#/, "")).filter(Boolean).map((t) => `#${t}`)
      : [];
    const mediaUrls = parseMediaUrls(d.mediaUrls);
    const primaryMedia = d.mediaUrl || mediaUrls[0] || null;

    postId = await withTenant(orgId, async (tx) => {
      const created = await tx.socialPost.create({
        data: {
          organizationId: orgId,
          establishmentId: d.establishmentId ?? null,
          platforms,
          caption: d.caption ?? null,
          hashtags,
          mediaUrl: primaryMedia,
          mediaType: d.mediaType ?? (primaryMedia ? "image" : null),
          approvedCreativeUrls: mediaUrls,
          isAiCaption: d.isAiCaption ?? false,
          status: "publishing",
        },
        select: { id: true },
      });
      return created.id;
    });
  }

  await dispatchDuePost(postId, orgId);
  revalidatePath("/social/posts");
  revalidatePath("/social/calendar");
}

/**
 * Retry a failed post — reset it to `scheduled` at now so the dispatch cron
 * re-sends, clearing the prior error. Only `failed` rows are retryable.
 */
export async function retrySocialPost(form: FormData): Promise<void> {
  const { orgId } = await requireOrg();
  const id = z.string().uuid().parse(form.get("id"));
  const updated = await withTenant(orgId, async (tx) =>
    tx.socialPost.updateMany({
      where: { id, status: "failed" },
      data: { status: "scheduled", scheduledFor: new Date(), error: null },
    }),
  );
  if (updated.count === 0) throw new Error("post_not_retryable");
  revalidatePath("/social/posts");
  revalidatePath("/social/calendar");
}

const RescheduleSchema = z.object({
  id: z.string().uuid(),
  scheduledFor: z.string().datetime(),
});

/**
 * Reschedule a post (calendar drag-to-reschedule). Only `draft`/`scheduled`
 * rows can move; a published/publishing/failed post is refused. Audited.
 */
export async function rescheduleSocialPost(form: FormData): Promise<void> {
  const { orgId, userId } = await requireOrg();
  const parsed = RescheduleSchema.safeParse({
    id: form.get("id"),
    scheduledFor: form.get("scheduledFor"),
  });
  if (!parsed.success) throw new Error("invalid_input");
  const { id, scheduledFor } = parsed.data;
  const when = new Date(scheduledFor);

  const result = await withTenant(orgId, async (tx) => {
    const updated = await tx.socialPost.updateMany({
      where: { id, status: { in: ["draft", "scheduled"] } },
      // Moving a draft into the future also flips it to scheduled so the cron
      // will pick it up; a past time keeps it a draft.
      data: {
        scheduledFor: when,
        status: when.getTime() > Date.now() ? "scheduled" : "draft",
      },
    });
    if (updated.count > 0) {
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorType: "user",
          actorId: userId,
          action: "social_post.rescheduled",
          resourceType: "social_post",
          resourceId: id,
          afterData: { scheduledFor: when.toISOString() },
        },
      });
    }
    return updated.count;
  });
  if (result === 0) throw new Error("post_not_reschedulable");
  revalidatePath("/social/calendar");
  revalidatePath("/social/posts");
}

const AiCaptionSchema = z.object({
  platforms: z.string().min(1),
  topic: z.string().max(500).optional(),
  tone: z.enum(["professional", "friendly", "playful", "informative"]).default("friendly"),
});

export async function generateSocialCaption(
  form: FormData,
): Promise<{ caption: string; hashtags: string[] }> {
  const { orgId } = await requireOrg();
  const parsed = AiCaptionSchema.safeParse({
    platforms: form.get("platforms"),
    topic: (form.get("topic") as string) || undefined,
    tone: (form.get("tone") as string) || "friendly",
  });
  if (!parsed.success) throw new Error("invalid_input");

  // Look up org name for context
  const { name } = await withTenant(orgId, async (tx) => {
    const o = await tx.organization.findUnique({ where: { id: orgId }, select: { name: true } });
    return { name: o?.name ?? "Our business" };
  });

  const platforms = parsed.data.platforms.split(",").map((p) => p.trim());
  const charLimit = platforms.includes("twitter")
    ? 280
    : platforms.includes("instagram")
      ? 2200
      : 600;

  const SYSTEM = `You write social media captions for local businesses. Tone: ${parsed.data.tone}.

Rules:
- Stay under ${charLimit} characters for the caption itself.
- Suggest 3-5 relevant hashtags separately.
- No clickbait. No emojis unless tone = "playful".
- Don't invent specifics about customers or pricing.
- Return JSON: {"caption": "...", "hashtags": ["..."]}.`;

  const response = await anthropic.messages.create({
    model: MODELS.HAIKU,
    max_tokens: 600,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `Generate a social caption for ${name} on ${platforms.join(", ")}. ${parsed.data.topic ? `Topic: ${parsed.data.topic}` : "General brand post."} Return JSON only.`,
      },
    ],
  });

  const text = response.content.find((c) => c.type === "text");
  if (!text || text.type !== "text") throw new Error("ai_no_response");

  // Try to parse JSON from response
  const match = text.text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("ai_invalid_json");
  try {
    const parsed = JSON.parse(match[0]) as { caption: string; hashtags?: string[] };
    return {
      caption: String(parsed.caption ?? "").slice(0, charLimit),
      hashtags: Array.isArray(parsed.hashtags)
        ? parsed.hashtags.slice(0, 8).map((h) => String(h).replace(/^#/, ""))
        : [],
    };
  } catch {
    return { caption: text.text.slice(0, charLimit), hashtags: [] };
  }
}

export async function deleteSocialPost(form: FormData): Promise<void> {
  const { orgId, userId } = await requireRole("admin");
  const id = z.string().uuid().parse(form.get("id"));
  await withTenant(orgId, async (tx) => {
    const before = await tx.socialPost.findFirst({
      where: { id },
      select: { platforms: true, status: true, scheduledFor: true },
    });
    if (!before) return;
    await tx.socialPost.delete({ where: { id } });
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "social_post.deleted",
        resourceType: "social_post",
        resourceId: id,
        beforeData: {
          platforms: before.platforms,
          status: before.status,
          scheduledFor: before.scheduledFor?.toISOString() ?? null,
        },
      },
    });
  });
  revalidatePath("/social/posts");
}
