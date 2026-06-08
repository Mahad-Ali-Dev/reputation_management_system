"use server";

import { MODELS, anthropic } from "@/lib/ai/client";
import { auth } from "@/lib/auth/config";
import { checkBudget } from "@/lib/ai/budget";
import { PLATFORM_LIMITS, type SocialPlatform } from "@/lib/social/connections";
import { withTenant } from "@/lib/db/with-tenant";
import { redirect } from "next/navigation";
import { z } from "zod";

/**
 * Extended AI caption generator (Module 10, Wave 3d) — the post creator's
 * AiAssist surface for captions. Supersedes the inline single-option
 * `generateSocialCaption` in `post-actions.ts` (kept working for the legacy
 * form). Returns **3 caption options** and honours the spec's tone enum +
 * CTA/Emoji/Hashtag toggles.
 *
 * Safety:
 *  - Entitlement/budget gated: `checkBudget(orgId)` short-circuits when the org
 *    has blown its daily AI cap (returns `{ ok:false, reason:"budget" }`,
 *    NO model call).
 *  - When `ANTHROPIC_API_KEY` is unset, `anthropic.*` throws; we catch and
 *    return `{ ok:false, reason:"ai_unconfigured" }` rather than 500-ing — so
 *    the modal shows a friendly message and never a paid call is attempted.
 */

/**
 * Form checkboxes arrive as strings — `z.coerce.boolean()` is WRONG here because
 * the string "false" is truthy and coerces to `true`. Parse the literal value:
 * "true"/"on"/"1" → true, anything else → false. The `def` controls the
 * missing/empty case (hashtags default ON, the others OFF).
 */
const formBool = (def: boolean) =>
  z
    .union([z.string(), z.boolean(), z.undefined()])
    .transform((v) => {
      if (typeof v === "boolean") return v;
      if (v === undefined || v === "") return def;
      return v === "true" || v === "on" || v === "1";
    });

const CaptionSchema = z.object({
  platforms: z.string().min(1).max(200),
  topic: z.string().max(500).optional(),
  tone: z
    .enum(["professional", "casual", "friendly", "funny", "promotional"])
    .default("friendly"),
  includeCta: formBool(false),
  includeEmoji: formBool(false),
  includeHashtags: formBool(true),
});

export type CaptionOption = { caption: string; hashtags: string[] };

export type GenerateCaptionsResult =
  | { ok: true; options: CaptionOption[] }
  | { ok: false; reason: "ai_unconfigured" | "budget" | "invalid_input" | "ai_error" };

async function requireOrg() {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  const userId = session?.user?.id;
  if (!session || !orgId || !userId) redirect("/login");
  return { orgId, userId };
}

/** Tightest char ceiling across the selected platforms. */
function captionCharLimit(platforms: string[]): number {
  let min = 3000;
  for (const p of platforms) {
    const limit = PLATFORM_LIMITS[p.toLowerCase() as SocialPlatform];
    if (limit) min = Math.min(min, limit.maxChars);
  }
  // Practical ceiling so Haiku doesn't write an essay even for FB.
  return Math.min(min, 600);
}

export async function generateCaptions(form: FormData): Promise<GenerateCaptionsResult> {
  const { orgId } = await requireOrg();

  const parsed = CaptionSchema.safeParse({
    platforms: form.get("platforms"),
    topic: (form.get("topic") as string) || undefined,
    tone: (form.get("tone") as string) || "friendly",
    includeCta: form.get("includeCta") ?? undefined,
    includeEmoji: form.get("includeEmoji") ?? undefined,
    includeHashtags: form.get("includeHashtags") ?? undefined,
  });
  if (!parsed.success) return { ok: false, reason: "invalid_input" };
  const d = parsed.data;

  // AI not configured → no call, friendly message.
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === "sk-ant-...") {
    return { ok: false, reason: "ai_unconfigured" };
  }

  // Budget gate (per-tenant daily cap).
  const budget = await checkBudget(orgId);
  if (!budget.ok) return { ok: false, reason: "budget" };

  const { name } = await withTenant(orgId, async (tx) => {
    const o = await tx.organization.findUnique({ where: { id: orgId }, select: { name: true } });
    return { name: o?.name ?? "Our business" };
  });

  const platforms = d.platforms.split(",").map((p) => p.trim()).filter(Boolean);
  const charLimit = captionCharLimit(platforms);

  const toggles: string[] = [];
  toggles.push(
    d.includeCta
      ? "- Include a clear call-to-action."
      : "- Do not force a call-to-action.",
  );
  toggles.push(
    d.includeEmoji
      ? "- A few tasteful emojis are welcome."
      : "- No emojis.",
  );
  toggles.push(
    d.includeHashtags
      ? "- Suggest 3-5 relevant hashtags per option (without the # in JSON)."
      : "- Do NOT include hashtags; return an empty hashtags array.",
  );

  const SYSTEM = `You write social media captions for local businesses. Tone: ${d.tone}.

Rules:
- Produce exactly THREE distinct caption OPTIONS.
- Stay under ${charLimit} characters for each caption itself.
${toggles.join("\n")}
- No clickbait. Don't invent specifics about customers, pricing, or claims.
- Return JSON ONLY: {"options":[{"caption":"...","hashtags":["..."]}, ...]} with 3 items.`;

  let text: string;
  try {
    const response = await anthropic.messages.create({
      model: MODELS.HAIKU,
      max_tokens: 900,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: `Generate 3 social caption options for ${name} on ${platforms.join(", ")}. ${
            d.topic ? `Topic: ${d.topic}.` : "General brand post."
          } Return JSON only.`,
        },
      ],
    });
    const block = response.content.find((c) => c.type === "text");
    if (!block || block.type !== "text") return { ok: false, reason: "ai_error" };
    text = block.text;
  } catch {
    // Covers unconfigured/limited client + transient API errors — never a 500.
    return { ok: false, reason: "ai_error" };
  }

  const options = parseOptions(text, charLimit, d.includeHashtags);
  if (options.length === 0) return { ok: false, reason: "ai_error" };
  return { ok: true, options };
}

/** Extract up to 3 options from the model's JSON; tolerant of stray prose. */
function parseOptions(text: string, charLimit: number, includeHashtags: boolean): CaptionOption[] {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    // Fallback: treat the whole thing as a single caption.
    return [{ caption: text.slice(0, charLimit).trim(), hashtags: [] }];
  }
  try {
    const json = JSON.parse(match[0]) as {
      options?: Array<{ caption?: string; hashtags?: string[] }>;
    };
    const raw = Array.isArray(json.options) ? json.options : [];
    const out: CaptionOption[] = [];
    for (const o of raw.slice(0, 3)) {
      const caption = String(o?.caption ?? "").slice(0, charLimit).trim();
      if (!caption) continue;
      const hashtags = includeHashtags && Array.isArray(o?.hashtags)
        ? o.hashtags.slice(0, 8).map((h) => String(h).replace(/^#/, "")).filter(Boolean)
        : [];
      out.push({ caption, hashtags });
    }
    return out;
  } catch {
    return [{ caption: text.slice(0, charLimit).trim(), hashtags: [] }];
  }
}
