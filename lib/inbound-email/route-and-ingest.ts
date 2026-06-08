/**
 * Inbound-email router + ingest.
 *
 * Pipeline (called by the Resend webhook handler):
 *   1. Resolve the destination `To` address to an organization. Per-org
 *      addresses look like `reviews-<orgSlug>@inbound.repulabs.com`.
 *      We never trust the host's claim of which org owns this email —
 *      the address itself carries the org binding.
 *   2. Insert the raw payload into `inbound_emails` (parse-once-store-raw).
 *      Dedup on Resend's provider_message_id so webhook retries are
 *      idempotent.
 *   3. Identify the matching Establishment within that org. For Airbnb
 *      reviews, the email contains the listing name (sometimes the listing
 *      id); we match against `establishments.airbnb_listing_id` first,
 *      then by case-insensitive listing name.
 *   4. Run the parser. On success → insert/upsert a Review row. On failure
 *      → store the error on the inbound_emails row and leave parsedAt NULL
 *      so the retry-sweep cron can try again later.
 *
 * Why this isn't a single big function: each step is independently
 * testable, and the route-only / ingest-only split lets us run the retry
 * sweep against historical rows without re-running the routing logic
 * (which depends on the To address).
 */

import { maybeFireBadReviewAlert } from "@/lib/alerts/bad-review-sms";
import { executeAutoReplyRules } from "@/lib/auto-reply/executor";
import { captureContactInBackground } from "@/lib/contacts/upsert-from-interaction";
import { prisma } from "@/lib/db/client";
import { logger } from "@/lib/logger";
import { type ParseResult, parseAirbnbReviewEmail } from "./parse-airbnb";

// =========================================================================
// Routing — turn a To address into an organization
// =========================================================================

/**
 * Extract the org-slug local-part from a forward target address.
 *
 *   reviews-acme-corp@inbound.repulabs.com → "acme-corp"
 *   bookings-cool-bnb@inbound.repulabs.com → "cool-bnb"  (future)
 *
 * Returns null if the address doesn't match our pattern — those will be
 * stored with organization_id = NULL for ops triage.
 */
export function extractOrgSlugFromInboundAddress(toAddress: string): string | null {
  // Lowercase + trim + remove display-name + collapse multi-recipient lists.
  const addr = toAddress
    .toLowerCase()
    .replace(/.*<([^>]+)>.*/, "$1")
    .split(",")[0]
    ?.trim();
  if (!addr) return null;

  // Match `reviews-<slug>@inbound.repulabs.com`. Slug is lowercase
  // alphanumerics + hyphens, 2..64 chars, matches what we allow in
  // `organizations.slug`.
  const m = addr.match(/^reviews-([a-z0-9][a-z0-9-]{1,62}[a-z0-9])@inbound\.repulabs\.com$/);
  return m?.[1] ?? null;
}

export interface RouteResult {
  organizationId: string | null;
  organizationSlug: string | null;
  /** True if the slug was found but didn't match a real organization. */
  unknownSlug: boolean;
}

export async function routeInboundToOrg(toAddress: string): Promise<RouteResult> {
  const slug = extractOrgSlugFromInboundAddress(toAddress);
  if (!slug) {
    return { organizationId: null, organizationSlug: null, unknownSlug: false };
  }
  const org = await prisma.organization.findUnique({
    where: { slug },
    select: { id: true, slug: true },
  });
  if (!org) {
    return { organizationId: null, organizationSlug: slug, unknownSlug: true };
  }
  return {
    organizationId: org.id,
    organizationSlug: org.slug,
    unknownSlug: false,
  };
}

// =========================================================================
// Ingest — turn a raw email into an InboundEmail row, then a Review row
// =========================================================================

export interface InboundPayload {
  /** Resend's per-delivery message id. Used for webhook-retry dedup. */
  providerMessageId: string | null;
  from: string;
  to: string;
  subject: string;
  htmlBody: string | null;
  textBody: string | null;
  receivedAt: Date;
}

export interface IngestResult {
  inboundEmailId: string;
  /** Set only when the parser succeeded AND we matched a listing. */
  reviewId: string | null;
  /** A human-readable status surfaced in the dashboard's email log. */
  status: "review_ingested" | "parse_failed" | "listing_not_matched" | "unknown_org" | "dedup_skip";
  detail: string;
}

/**
 * Idempotent. Calling with the same `providerMessageId` twice is safe —
 * the second call returns a `dedup_skip` result without modifying state.
 */
export async function ingestInboundEmail(payload: InboundPayload): Promise<IngestResult> {
  const { organizationId, unknownSlug } = await routeInboundToOrg(payload.to);

  // Dedup against Resend webhook retries. Resend WILL retry on 5xx; we
  // don't want to ingest the same review twice (Review has a unique
  // constraint on (establishment, source, external_id) so the second
  // ingest WOULD fail anyway, but we'd rather not waste the parse pass).
  if (payload.providerMessageId) {
    const existing = await prisma.inboundEmail.findUnique({
      where: { providerMessageId: payload.providerMessageId },
      select: { id: true, parsedReviewId: true },
    });
    if (existing) {
      return {
        inboundEmailId: existing.id,
        reviewId: existing.parsedReviewId,
        status: "dedup_skip",
        detail: `provider_message_id ${payload.providerMessageId} already ingested`,
      };
    }
  }

  // Always store the raw payload first — even if we can't route it. This
  // lets ops manually inspect inbound emails that arrived on addresses
  // we couldn't resolve (e.g., a host typoed the slug).
  const inbound = await prisma.inboundEmail.create({
    data: {
      organizationId,
      source: "airbnb",
      toAddress: payload.to,
      fromAddress: payload.from,
      subject: payload.subject,
      htmlBody: payload.htmlBody,
      textBody: payload.textBody,
      providerMessageId: payload.providerMessageId,
      receivedAt: payload.receivedAt,
    },
    select: { id: true },
  });

  if (!organizationId) {
    const detail = unknownSlug
      ? `to-address slug doesn't match any org`
      : `to-address didn't match the reviews-<slug>@inbound.repulabs.com pattern`;
    logger.warn({ inboundEmailId: inbound.id, to: payload.to, event: "inbound.unknown_org" });
    await prisma.inboundEmail.update({
      where: { id: inbound.id },
      data: { parsedAt: new Date(), parseError: detail },
    });
    return {
      inboundEmailId: inbound.id,
      reviewId: null,
      status: "unknown_org",
      detail,
    };
  }

  // Parse the email content.
  const parsed = parseAirbnbReviewEmail({
    from: payload.from,
    subject: payload.subject,
    htmlBody: payload.htmlBody,
    textBody: payload.textBody,
    receivedAt: payload.receivedAt,
  });

  if (!parsed.ok) {
    await prisma.inboundEmail.update({
      where: { id: inbound.id },
      data: {
        parsedAt: null,
        parseError: `${parsed.reason}: ${parsed.detail}`,
      },
    });
    logger.warn(
      {
        inboundEmailId: inbound.id,
        organizationId,
        reason: parsed.reason,
        partial: parsed.partial,
        event: "inbound.parse_failed",
      },
      "airbnb email parse failed",
    );
    return {
      inboundEmailId: inbound.id,
      reviewId: null,
      status: "parse_failed",
      detail: parsed.detail,
    };
  }

  // Match listing → Establishment. Try the explicit Airbnb listing id
  // first (most reliable), then fall back to name match within the org.
  const establishment = await findMatchingEstablishment({
    organizationId,
    listingId: parsed.listingId,
    listingName: parsed.listingName,
  });

  if (!establishment) {
    const detail = `parsed listing "${parsed.listingName}" doesn't match any Establishment in this org. Host needs to connect the listing in /establishments.`;
    await prisma.inboundEmail.update({
      where: { id: inbound.id },
      data: {
        parsedAt: new Date(),
        parseError: detail,
      },
    });
    logger.warn(
      {
        inboundEmailId: inbound.id,
        organizationId,
        listingName: parsed.listingName,
        event: "inbound.listing_not_matched",
      },
      "airbnb listing not matched to any establishment",
    );
    return {
      inboundEmailId: inbound.id,
      reviewId: null,
      status: "listing_not_matched",
      detail,
    };
  }

  // Upsert the Review. The unique constraint is (establishment_id, source,
  // external_id), so the same email parsed twice yields one Review row.
  // We use UPDATE-on-conflict to keep the latest body/rating in case
  // Airbnb changed the email after the original send.
  const review = await prisma.review.upsert({
    where: {
      establishmentId_source_externalId: {
        establishmentId: establishment.id,
        source: "airbnb",
        externalId: parsed.externalReviewId,
      },
    },
    create: {
      organizationId,
      establishmentId: establishment.id,
      source: "airbnb",
      externalId: parsed.externalReviewId,
      reviewerName: parsed.reviewerName,
      rating: parsed.rating,
      body: parsed.body || null,
      postedAt: parsed.postedAt,
      raw: {
        subject: parsed.raw.subject,
        from: parsed.raw.from,
        listingName: parsed.listingName,
        listingId: parsed.listingId,
        htmlSnippet: parsed.raw.htmlSnippet,
      },
    },
    update: {
      // Don't clobber the original posted_at — it's the canonical timestamp.
      // Do update body + rating in case the host re-forwarded a corrected one.
      reviewerName: parsed.reviewerName,
      rating: parsed.rating,
      body: parsed.body || null,
    },
    select: { id: true },
  });

  await prisma.inboundEmail.update({
    where: { id: inbound.id },
    data: {
      parsedAt: new Date(),
      parsedReviewId: review.id,
      parseError: null,
    },
  });

  logger.info(
    {
      inboundEmailId: inbound.id,
      reviewId: review.id,
      organizationId,
      establishmentId: establishment.id,
      rating: parsed.rating,
      event: "inbound.review_ingested",
    },
    "airbnb review ingested",
  );

  // Auto-capture the review author into the Contact directory. Fire-and-
  // forget + fail-soft (the hook never throws and dedupes internally) so it
  // can't break / slow ingest. Airbnb's `from` is an automated no-reply
  // address (not the guest), so we capture the guest by name + dedupe on
  // (org, "review", externalId).
  if (parsed.reviewerName) {
    captureContactInBackground({
      orgId: organizationId,
      source: "review",
      externalId: parsed.externalReviewId,
      name: parsed.reviewerName,
      establishmentId: establishment.id,
      occurredAt: parsed.postedAt,
      activity: {
        title: "Left an Airbnb review",
        externalRef: `review:${parsed.externalReviewId}`,
      },
    });
  }

  // Bad-review SMS early-warning — fire-and-forget so a Twilio outage
  // can't bottleneck ingest. The alert module short-circuits cheaply
  // when not enabled, so it's safe to call on every review.
  void maybeFireBadReviewAlert({
    reviewId: review.id,
    organizationId,
    establishmentId: establishment.id,
    establishmentName: establishment.name,
    reviewerName: parsed.reviewerName,
    rating: parsed.rating,
    bodyPreview: parsed.body || null,
    source: "airbnb",
    alert: {
      enabled: establishment.alertSmsEnabled,
      phone: establishment.alertSmsPhone,
      minRating: establishment.alertSmsMinRating,
    },
  }).catch((err) => {
    logger.error(
      {
        err: err instanceof Error ? err.message : String(err),
        reviewId: review.id,
        event: "inbound.alert.unhandled",
      },
      "bad-review alert threw unexpectedly",
    );
  });

  // Auto-reply rule executor — also fire-and-forget. The executor
  // self-protects against rule mismatches and concurrent writers so a
  // misconfigured rule can't crash ingest.
  void executeAutoReplyRules({
    reviewId: review.id,
    organizationId,
    establishmentId: establishment.id,
  }).catch((err) => {
    logger.error(
      {
        err: err instanceof Error ? err.message : String(err),
        reviewId: review.id,
        event: "inbound.auto_reply.unhandled",
      },
      "auto-reply executor threw unexpectedly",
    );
  });

  return {
    inboundEmailId: inbound.id,
    reviewId: review.id,
    status: "review_ingested",
    detail: `${parsed.rating}★ from ${parsed.reviewerName} → ${establishment.name}`,
  };
}

// =========================================================================
// Helpers
// =========================================================================

/** Subset of Establishment columns the ingest path actually uses. We
 *  include the alert-SMS config because the alert path fires immediately
 *  after a successful ingest — avoids a second round-trip. */
type EstablishmentForIngest = {
  id: string;
  name: string;
  alertSmsEnabled: boolean;
  alertSmsPhone: string | null;
  alertSmsMinRating: number;
};

async function findMatchingEstablishment(args: {
  organizationId: string;
  listingId: string | null;
  listingName: string;
}): Promise<EstablishmentForIngest | null> {
  const SELECT = {
    id: true,
    name: true,
    alertSmsEnabled: true,
    alertSmsPhone: true,
    alertSmsMinRating: true,
  } as const;

  // Try Airbnb listing id first — exact match, most reliable.
  if (args.listingId) {
    const byId = await prisma.establishment.findFirst({
      where: {
        organizationId: args.organizationId,
        airbnbListingId: args.listingId,
        deletedAt: null,
      },
      select: SELECT,
    });
    if (byId) return byId;
  }

  // Fall back to case-insensitive name match. We accept exact-substring on
  // either side because Airbnb sometimes truncates long names in the email
  // subject ("Cliff House Coastal Retreat..." → "Cliff House").
  const normalized = args.listingName.toLowerCase().trim();
  if (normalized.length === 0) return null;

  const byName = await prisma.establishment.findFirst({
    where: {
      organizationId: args.organizationId,
      deletedAt: null,
      OR: [
        { name: { equals: args.listingName, mode: "insensitive" } },
        { name: { contains: args.listingName, mode: "insensitive" } },
      ],
    },
    select: SELECT,
  });
  return byName;
}
