// Server-side library (NOT a "use server" actions file): it exports a class +
// sync helpers + types, and is invoked only from server components and the
// use-server composer-actions bridge — never imported directly by a client.
import { assertEntitled, isOrgEntitled } from "@/lib/billing/entitlements";
import { logger } from "@/lib/logger";
import { uploadToBlob } from "@/lib/uploads/blob";

/**
 * AI Image Creatives adapter (Module 10, Wave 3d) — the ONE genuinely new
 * external dependency. **Pro-gated + env-gated; never a live paid call by
 * default.** Ships last.
 *
 * Order of gates (strict):
 *   1. `assertEntitled(orgId)` — Pro/trial only (throws `PlanInactiveError`).
 *   2. `isImageGenEnabled()` — requires `IMAGE_GEN_PROVIDER` + that provider's
 *      API key. Unset → throw `ImageGenNotConfiguredError` so the UI shows
 *      "AI image generation isn't enabled for this workspace" — no paid call,
 *      no silent spend.
 *
 * With NEITHER configured this module makes ZERO network calls. `availability()`
 * lets the UI render the right disabled/upsell state without throwing.
 */

/** Thrown when image generation isn't enabled for the workspace (no provider/key). */
export class ImageGenNotConfiguredError extends Error {
  readonly code = "image_gen_not_configured";
  constructor() {
    super("image_gen_not_configured: AI image generation isn't enabled for this workspace");
    this.name = "ImageGenNotConfiguredError";
  }
}

export type GeneratedCreative = { url: string; pathname: string };

export type ImageGenAvailability = {
  available: boolean;
  /** "ok" | "not_pro" | "not_configured" */
  reason: "ok" | "not_pro" | "not_configured";
};

/**
 * Is an image provider configured? Synchronous + cheap. Default unset → false →
 * no paid call. Mirrors the connections adapter-availability pattern.
 */
export function isImageGenEnabled(): boolean {
  const provider = (process.env.IMAGE_GEN_PROVIDER ?? "").toLowerCase();
  if (provider === "openai") return Boolean(process.env.OPENAI_API_KEY);
  if (provider === "stability") return Boolean(process.env.STABILITY_API_KEY);
  return false;
}

/**
 * Combined gate for the UI: is the feature usable for this org right now? Never
 * throws — returns a typed reason so the card can show the upsell vs the
 * "not enabled" state. Makes no network call.
 */
export async function imageGenAvailability(orgId: string): Promise<ImageGenAvailability> {
  if (!isImageGenEnabled()) return { available: false, reason: "not_configured" };
  const entitled = await isOrgEntitled(orgId).catch(() => false);
  if (!entitled) return { available: false, reason: "not_pro" };
  return { available: true, reason: "ok" };
}

const MAX_COUNT = 4;

export type GenerateCreativesInput = {
  orgId: string;
  brief: string;
  brandColors?: string[];
  style?: string;
  sourceImageUrl?: string;
  count?: number;
};

/**
 * Generate `count` (1–4) image variations from a brief. Pro + env gated.
 *
 * THROWS:
 *   - `PlanInactiveError` if the org isn't entitled (no provider call).
 *   - `ImageGenNotConfiguredError` if no image provider/key (no paid call).
 *
 * Each result is uploaded to Vercel Blob (`ai_creative` context) and returned
 * as `{ url, pathname }`. The actual provider call is isolated in
 * `callImageProvider`; it is only reached after BOTH gates pass, so the default
 * code path (no env) never hits it.
 */
export async function generateCreatives(
  input: GenerateCreativesInput,
): Promise<GeneratedCreative[]> {
  // 1) Pro gate FIRST — a non-Pro org can never trigger a provider call.
  await assertEntitled(input.orgId);

  // 2) Env gate — no provider/key ⇒ typed "not configured", no paid call.
  if (!isImageGenEnabled()) {
    throw new ImageGenNotConfiguredError();
  }

  const count = Math.max(1, Math.min(MAX_COUNT, input.count ?? 1));
  const brief = (input.brief ?? "").trim();
  if (!brief) throw new Error("brief_required");

  const provider = (process.env.IMAGE_GEN_PROVIDER ?? "").toLowerCase();
  const images = await callImageProvider({
    provider,
    brief,
    style: input.style,
    brandColors: input.brandColors ?? [],
    sourceImageUrl: input.sourceImageUrl,
    count,
  });

  const out: GeneratedCreative[] = [];
  for (let i = 0; i < images.length; i++) {
    const img = images[i]!;
    try {
      const uploaded = await uploadToBlob({
        orgId: input.orgId,
        context: "ai_creative",
        buffer: img.buffer,
        mimeType: img.mimeType,
        filename: `creative-${Date.now()}-${i}.png`,
      });
      out.push(uploaded);
    } catch (err) {
      logger.warn({
        orgId: input.orgId,
        event: "social.image_gen.upload_failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (out.length === 0) throw new Error("image_gen_no_output");
  logger.info({ orgId: input.orgId, event: "social.image_gen.ok", count: out.length });
  return out;
}

/**
 * Provider call boundary. Reached ONLY after Pro + env gates pass. Implemented
 * for OpenAI Images; Stability is a stub until its adapter lands. Returns raw
 * image buffers (PNG). Mocked in tests — never exercised in default paths.
 */
async function callImageProvider(args: {
  provider: string;
  brief: string;
  style?: string;
  brandColors: string[];
  sourceImageUrl?: string;
  count: number;
}): Promise<Array<{ buffer: Buffer; mimeType: string }>> {
  if (args.provider === "openai") {
    return callOpenAiImages(args);
  }
  // Stability / others: not wired yet — fail clearly rather than silently.
  throw new ImageGenNotConfiguredError();
}

async function callOpenAiImages(args: {
  brief: string;
  style?: string;
  brandColors: string[];
  count: number;
}): Promise<Array<{ buffer: Buffer; mimeType: string }>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new ImageGenNotConfiguredError();

  const palette =
    args.brandColors.length > 0 ? ` Brand colors: ${args.brandColors.join(", ")}.` : "";
  const styleHint = args.style ? ` Style: ${args.style}.` : "";
  const prompt = `${args.brief}.${styleHint}${palette} Marketing-ready, no text overlays.`;

  const model = process.env.IMAGE_GEN_MODEL || "gpt-image-1";
  // dall-e-3 rejects n > 1 ("You may only generate 1 image at a time"), while
  // gpt-image-1 batches happily. Asking for 2 variations on dall-e-3 would fail
  // the whole request, so fan out into single-image calls instead.
  const batches = model.startsWith("dall-e-3")
    ? Array.from({ length: args.count }, () => 1)
    : [args.count];

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const out: Array<{ buffer: Buffer; mimeType: string }> = [];
    for (const n of batches) {
      const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, prompt, n, size: "1024x1024" }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        // Carries the provider's own words through — the caller turns this into
        // something the owner can act on rather than "try again".
        throw new Error(`image_gen_http_${res.status}: ${txt.slice(0, 300)}`);
      }
      const json = (await res.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
      for (const item of json.data ?? []) {
        if (item.b64_json) {
          out.push({ buffer: Buffer.from(item.b64_json, "base64"), mimeType: "image/png" });
        } else if (item.url) {
          const imgRes = await fetch(item.url, { signal: ctrl.signal });
          if (imgRes.ok) {
            const ab = await imgRes.arrayBuffer();
            out.push({ buffer: Buffer.from(ab), mimeType: "image/png" });
          }
        }
      }
    }
    return out;
  } finally {
    clearTimeout(timer);
  }
}
