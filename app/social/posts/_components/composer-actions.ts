"use server";

/**
 * Thin `"use server"` adapters (Module 10) that bridge the composer's client
 * islands to the backend `lib/social/*` services WITHOUT the client importing a
 * server-only module directly, and WITHOUT leaking `orgId` to the client.
 *
 * Why this layer exists:
 *  - `generateCaptions` takes FormData + returns a `{ ok, … }` envelope; the
 *    caption modal wants a clean `(input) => CaptionOption[]`. We translate, and
 *    map the `{ ok:false, reason }` cases to a thrown Error the modal renders.
 *  - `generateCreatives` needs a server-trusted `orgId` (never the client's) and
 *    returns `{ url, pathname }`; the creatives modal wants `(input) => urls`.
 *  - These wrappers are imported by the client modals as plain async functions;
 *    Next.js serializes the call across the boundary.
 *
 * Files here are owned by the composer (10_post_creator UI). They only re-shape;
 * all auth/entitlement/budget gating stays in the underlying services.
 */

import { auth } from "@/lib/auth/config";
import { logger } from "@/lib/logger";
import { recommendTimes as recommendTimesBackend } from "@/lib/social/best-time";
import {
  type CaptionOption,
  generateCaptions as generateCaptionsBackend,
} from "@/lib/social/captions";
import {
  ImageGenNotConfiguredError,
  generateCreatives as generateCreativesBackend,
} from "@/lib/social/image-gen";
import { redirect } from "next/navigation";
import type { CaptionGenResult } from "./caption-modal";
import type { CreativeGenResult } from "./creatives-modal";

async function requireOrgId(): Promise<string> {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  if (!session || !orgId) redirect("/login");
  return orgId;
}

const CAPTION_REASON_COPY: Record<string, string> = {
  ai_unconfigured: "AI captions aren’t enabled for this workspace yet.",
  budget: "You’ve reached today’s AI usage limit. Try again tomorrow.",
  invalid_input: "Add a topic or pick a platform first.",
  ai_error: "The AI couldn’t draft captions just now. Try again.",
};

/**
 * Caption modal adapter — returns 3 options or throws a friendly message.
 * (Client-callable: the modal passes this as its `generate` prop.)
 */
export async function generateCaptionsForComposer(input: {
  topic: string;
  tone: string;
  platform: string;
  includeCta: boolean;
  includeEmoji: boolean;
  includeHashtags: boolean;
}): Promise<CaptionGenResult> {
  const form = new FormData();
  // The backend tightens the char limit across all selected platforms; the modal
  // optimizes for one, so pass that single platform.
  form.set("platforms", input.platform);
  if (input.topic) form.set("topic", input.topic);
  form.set("tone", input.tone);
  form.set("includeCta", input.includeCta ? "true" : "");
  form.set("includeEmoji", input.includeEmoji ? "true" : "");
  form.set("includeHashtags", input.includeHashtags ? "true" : "");

  const result = await generateCaptionsBackend(form);
  if (!result.ok) {
    return { ok: false, error: CAPTION_REASON_COPY[result.reason] ?? "Caption generation failed." };
  }
  return { ok: true, options: result.options };
}

/**
 * Creatives modal adapter — injects the server-trusted orgId and returns the
 * public URLs of the generated creatives.
 *
 * The gate is classified HERE, on the server, and sent as an explicit `code`.
 * This used to re-throw `ImageGenNotConfiguredError` so the modal could detect
 * it, but neither half of that survives the boundary: class identity is lost on
 * serialization, and Next.js redacts server-action error messages in production.
 * The modal's `err.name` / message sniffing therefore always missed in prod and
 * the "not enabled" and "upgrade" panels could never appear.
 */
export async function generateCreativesForComposer(input: {
  brief: string;
  brandColors: string[];
  style: string;
  count: number;
}): Promise<CreativeGenResult> {
  const orgId = await requireOrgId();
  try {
    const creatives = await generateCreativesBackend({
      orgId,
      brief: input.brief,
      brandColors: input.brandColors,
      style: input.style,
      count: input.count,
    });
    return { ok: true, creatives: creatives.map((c) => ({ url: c.url, kind: "image" as const })) };
  } catch (err) {
    if (err instanceof ImageGenNotConfiguredError) {
      return {
        ok: false,
        code: "not_enabled",
        error: "AI image generation isn't configured on this server yet.",
      };
    }
    const name = (err as { name?: string } | null)?.name ?? "";
    if (name === "PlanInactiveError" || name === "EntitlementError") {
      return { ok: false, code: "plan", error: "AI creatives are a paid feature." };
    }
    logger.error({
      event: "composer.creatives.failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, code: "error", error: "Image generation failed. Try again." };
  }
}

/**
 * Best-time adapter — injects the server-trusted orgId. The composer calls
 * `recommendTimes(platforms)` and gets back 3 upcoming ISO datetimes.
 */
export async function recommendTimesForComposer(platforms: string[]): Promise<string[]> {
  const orgId = await requireOrgId();
  return recommendTimesBackend(orgId, platforms);
}
