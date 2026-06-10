import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { assertEntitled } from "@/lib/billing/entitlements";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { assertRateLimit } from "@/lib/ratelimit";
import { crawlSite, type CrawlError } from "./crawl";
import { extractBusinessProfile, type ExtractedProfile, type OperatingHours } from "./extract-profile";
import { ingestDocument } from "./ingest";

// NOTE: no top-level "use server" — this module exports the pure `mergeProfile`
// + the `ScanResult` type alongside the `scanAndBuild` action. The action gets
// an inline "use server" directive instead (a top-level directive would forbid
// the non-async exports).

/**
 * Auto-Setup orchestrator (Module 05) — the "Scan & Build My AI" flow.
 *
 * scanAndBuild(form): requireOrg → assertEntitled → rate-limit → validate URL →
 * crawlSite (depth-3, same-origin) → extractBusinessProfile (Haiku tool-use) →
 * merge-upsert AiTrainingProfile (only overwrite fields the extractor returned
 * non-empty; never clobber a user-edited field with empty) + create/replace an
 * AiDocument and ingest it so the chat tester has chunks too → store sourceUrl
 * for the weekly updater → audit → revalidate.
 *
 * Returns a `{ error }` shape the page renders — never throws a raw crawl error.
 * The Anthropic + crawl calls are the only network; both are gated by
 * entitlement + rate limit. No paid call happens for an un-entitled org.
 */

async function requireOrg() {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  const userId = session?.user?.id;
  if (!session || !orgId || !userId) redirect("/login");
  return { orgId, userId };
}

const ScanSchema = z.object({
  url: z
    .string()
    .url()
    .max(2048)
    .refine((u) => u.startsWith("https://") || u.startsWith("http://"), "URL must be http(s)"),
});

const CRAWL_ERROR_MESSAGES: Record<CrawlError, string> = {
  invalid_url: "That doesn't look like a valid URL. Check it and try again.",
  non_https: "Only http(s) URLs are supported.",
  private_ip_blocked: "That URL resolves to a private/internal address and can't be crawled.",
  credentials_in_url: "Remove the username:password from the URL and try again.",
  robots_disallowed: "This site's robots.txt asks us not to crawl that page.",
  fetch_failed: "We couldn't reach that page. Check the URL is public and live.",
  content_too_large: "That page is too large to scan. Try a more specific page.",
  unsupported_content_type: "That URL didn't return a web page we can read.",
  too_many_redirects: "That URL redirected too many times. Try the final URL directly.",
  empty_after_strip: "We couldn't find any readable text on that page.",
  too_little_text:
    "We couldn't read enough text from that site to build your AI. This often happens with sites that render their content with JavaScript. Try linking a specific page with more text (like an About or Services page), or fill in your details manually below.",
};

export type ScanResult =
  | { ok: true; pagesCrawled: number; fields: string[] }
  | { ok: false; error: string };

/**
 * Merge extracted fields onto an existing profile. Only non-empty extracted
 * values are written; existing user-edited values are preserved when the
 * extractor returned nothing. Returns the data to upsert + which fields changed.
 */
export function mergeProfile(
  extracted: Omit<ExtractedProfile, "costMicros">,
  existing: {
    businessOverview: string | null;
    servicesProducts: string | null;
    pricingDetails: string | null;
    locations: string | null;
    operatingHours: unknown;
  } | null,
): {
  data: {
    businessOverview: string | null;
    servicesProducts: string | null;
    pricingDetails: string | null;
    locations: string | null;
    // Always an object (never null) — keeps Prisma's Json? input happy without
    // needing Prisma.JsonNull, and {} is semantically "no hours".
    operatingHours: OperatingHours;
  };
  fields: string[];
} {
  const fields: string[] = [];
  const pick = (next: string, prev: string | null, label: string): string | null => {
    const n = next.trim();
    if (n && n !== (prev ?? "").trim()) {
      fields.push(label);
      return n;
    }
    return prev ?? null;
  };

  const hasHours = Object.keys(extracted.operatingHours ?? {}).length > 0;
  const prevHours = (existing?.operatingHours as OperatingHours | null) ?? {};
  let operatingHours: OperatingHours = prevHours;
  if (hasHours) {
    const a = JSON.stringify(extracted.operatingHours);
    const b = JSON.stringify(prevHours);
    if (a !== b) {
      fields.push("hours");
      operatingHours = extracted.operatingHours;
    }
  }

  return {
    data: {
      businessOverview: pick(extracted.businessOverview, existing?.businessOverview ?? null, "overview"),
      servicesProducts: pick(extracted.servicesProducts, existing?.servicesProducts ?? null, "services"),
      pricingDetails: pick(extracted.pricingDetails, existing?.pricingDetails ?? null, "pricing"),
      locations: pick(extracted.locations, existing?.locations ?? null, "locations"),
      operatingHours,
    },
    fields,
  };
}

/**
 * Server action — the "Scan & Build My AI" form handler. Resolves the session
 * (requireOrg/redirect) + reads the URL from the FormData, then delegates to the
 * pure {@link runAutoSetup} core. Kept as a thin wrapper so the AI page's form
 * action contract is unchanged.
 */
export async function scanAndBuild(form: FormData): Promise<ScanResult> {
  "use server";
  const { orgId, userId } = await requireOrg();
  const rawUrl = typeof form.get("url") === "string" ? (form.get("url") as string) : "";
  return runAutoSetup({ orgId, userId, url: rawUrl });
}

/**
 * Pure pipeline core — the crawl → extract → seed-KB work WITHOUT any
 * session/redirect coupling, so the onboarding orchestrator can drive it
 * server-side (already inside `withTenant`-scoped step code). The exported
 * `scanAndBuild` action wraps this after resolving the session.
 *
 * Gates the same way the action does — entitlement + rate-limit before any
 * external fetch or model call — so a budget/plan failure short-circuits with a
 * friendly `{ ok:false }` rather than spending. Never throws a raw crawl error.
 */
export async function runAutoSetup(args: {
  orgId: string;
  userId: string;
  url: string;
}): Promise<ScanResult> {
  const { orgId, userId } = args;

  // Paid AI feature — gate before any external fetch or model call.
  try {
    await assertEntitled(orgId);
  } catch {
    return { ok: false, error: "AI auto-setup isn't included on your current plan. Upgrade in Settings → Subscription." };
  }

  try {
    await assertRateLimit("url_crawl", orgId);
  } catch {
    return { ok: false, error: "You've scanned a few sites recently. Please wait a couple of minutes and try again." };
  }

  const parsed = ScanSchema.safeParse({ url: args.url });
  if (!parsed.success) {
    return { ok: false, error: "Enter a valid website URL (e.g. https://yourbusiness.com)." };
  }
  const url = parsed.data.url;

  // 1. Crawl (depth-3, same-origin, all SSRF guards per hop).
  const crawl = await crawlSite(url, { maxDepth: 3, maxPages: 20 });
  if ("error" in crawl) {
    return { ok: false, error: CRAWL_ERROR_MESSAGES[crawl.error] ?? "We couldn't scan that site. Try a different page." };
  }
  const corpus = crawl.result.text;

  // 2. Extract structured profile (Haiku tool-use).
  let extracted: ExtractedProfile;
  try {
    extracted = await extractBusinessProfile(corpus, { orgId });
  } catch (err) {
    logger.error(
      { event: "kb.auto_setup.extract_failed", orgId, error: err instanceof Error ? err.message : String(err) },
    );
    return { ok: false, error: "We scanned your site but couldn't extract a profile. Try again, or fill it in manually." };
  }

  if (!extracted.businessOverview && !extracted.servicesProducts) {
    return {
      ok: false,
      error:
        "We read your site but couldn't pull out enough business detail to build your AI. Try linking a page with more text (like an About or Services page), or fill in your details manually below.",
    };
  }

  // 3. Merge-upsert profile + create/replace the source doc (transactional read,
  //    then ingest outside the tenant tx since ingest uses its own connection).
  const docTitle = "Website (auto-setup)";
  let fields: string[] = [];
  let docId: string | null = null;
  try {
    const result = await withTenant(orgId, async (tx) => {
      const existing = await tx.aiTrainingProfile.findUnique({
        where: { organizationId: orgId },
        select: {
          businessOverview: true,
          servicesProducts: true,
          pricingDetails: true,
          locations: true,
          operatingHours: true,
        },
      });
      const merged = mergeProfile(extracted, existing);

      if (existing) {
        await tx.aiTrainingProfile.update({
          where: { organizationId: orgId },
          data: { ...merged.data, sourceUrl: url, lastAutoUpdatedAt: new Date() },
        });
      } else {
        await tx.aiTrainingProfile.create({
          data: { organizationId: orgId, ...merged.data, sourceUrl: url, lastAutoUpdatedAt: new Date() },
        });
      }

      // Create / replace the AiDocument for the crawled corpus so the chat
      // tester retrieves from it too.
      const contentHash = createHash("sha256").update(corpus).digest("hex");
      const existingDoc = await tx.aiDocument.findFirst({
        where: { organizationId: orgId, establishmentId: null, title: docTitle },
        select: { id: true },
      });
      const doc = existingDoc
        ? await tx.aiDocument.update({
            where: { id: existingDoc.id },
            data: {
              content: corpus,
              contentHash,
              sourceType: "url",
              sourceUri: url,
              sourceMetadata: { pagesCrawled: crawl.result.pagesCrawled, fetchedAt: crawl.result.fetchedAt.toISOString() },
              status: "indexing",
            },
            select: { id: true },
          })
        : await tx.aiDocument.create({
            data: {
              organizationId: orgId,
              establishmentId: null,
              title: docTitle,
              content: corpus,
              contentHash,
              sourceType: "url",
              sourceUri: url,
              sourceMetadata: { pagesCrawled: crawl.result.pagesCrawled, fetchedAt: crawl.result.fetchedAt.toISOString() },
              status: "indexing",
            },
            select: { id: true },
          });

      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorType: "user",
          actorId: userId,
          action: "ai.kb.auto_setup",
          resourceType: "ai_training_profile",
          resourceId: orgId,
          afterData: { url, pagesCrawled: crawl.result.pagesCrawled, fields: merged.fields },
        },
      });

      return { fields: merged.fields, docId: doc.id };
    });
    fields = result.fields;
    docId = result.docId;
  } catch (err) {
    logger.error(
      { event: "kb.auto_setup.persist_failed", orgId, error: err instanceof Error ? err.message : String(err) },
    );
    return { ok: false, error: "We extracted your profile but couldn't save it. Please try again." };
  }

  // 4. Ingest the source doc (chunk → embed). Best-effort: a failure here still
  //    leaves the profile populated, so we don't fail the whole scan.
  if (docId) {
    try {
      await ingestDocument({ documentId: docId, organizationId: orgId, establishmentId: null, content: corpus });
    } catch (err) {
      logger.warn(
        { event: "kb.auto_setup.ingest_failed", orgId, docId, error: err instanceof Error ? err.message : String(err) },
      );
    }
  }

  revalidatePath("/ai/training");
  revalidatePath("/ai");
  return { ok: true, pagesCrawled: crawl.result.pagesCrawled, fields };
}
