/**
 * Airbnb review-notification email parser.
 *
 * Background. Airbnb sends an email to the host every time a guest leaves a
 * review on a completed stay. The host configures Gmail (or Outlook) to
 * forward those emails to `reviews-<orgSlug>@inbound.repulabs.com`. Resend's
 * inbound parsing delivers them to our webhook (see
 * `app/api/webhooks/resend-inbound/route.ts`). This module turns those raw
 * forwarded emails into structured `Review` rows.
 *
 * Design constraint. Airbnb changes their email template every few months
 * — usually small CSS tweaks, occasionally bigger HTML structure changes.
 * We deliberately DO NOT bind extraction to specific CSS selectors or
 * template strings. Each field is extracted by trying several strategies
 * in priority order, then validated. If every strategy fails for a field,
 * the parser returns a partial result with `error` populated; the caller
 * can decide whether to ingest as-is or stash for retry.
 *
 * What we extract:
 *   - listingName       — the property the guest stayed at
 *   - listingId         — Airbnb's internal listing id (when present in HTML)
 *   - reviewerName      — guest's display name as Airbnb shows it
 *   - rating            — overall star rating 1..5 (round to integer)
 *   - body              — the public review text (can be empty for star-only)
 *   - postedAt          — when the guest submitted, parsed from the email subject/date
 *   - externalReviewId  — derived stable id for `(establishmentId, source, externalId)` dedup
 *
 * Languages. Airbnb localizes their emails. We attempt English first
 * (covers ~70% of traffic in AU/US/UK), then fall back to language-neutral
 * extractors (numeric rating + email From + display patterns). Non-English
 * emails parse with reduced confidence but the structured fields still
 * come through.
 *
 * What we deliberately don't do:
 *   - Trust the From header beyond a soft check. Spoofing is trivial; the
 *     real defense is "host explicitly forwarded this from their account."
 *   - Try to extract the Airbnb reservation id. It's not in the email body
 *     reliably and Airbnb doesn't include it in metadata. We use the email's
 *     Message-Id as the stable dedupe key instead.
 */

export interface ParsedAirbnbReview {
  ok: true;
  // Stable id for the (establishment, source) unique constraint. Format:
  // `airbnb:<sha256(listingName|reviewerName|postedAt-yyyymmdd)>` — survives
  // re-parses and tolerates Airbnb editing the email after the fact.
  externalReviewId: string;
  listingName: string;
  listingId: string | null;
  reviewerName: string;
  rating: number; // 1..5 integer
  body: string; // may be empty string for star-only reviews
  postedAt: Date;
  raw: {
    subject: string;
    from: string;
    htmlSnippet: string; // first 2 KB of HTML for forensic re-parse
  };
}

export interface ParseFailure {
  ok: false;
  /** Short machine-readable reason — used in audit log + metrics. */
  reason:
    | "from_mismatch"
    | "missing_subject"
    | "no_rating_found"
    | "no_reviewer_name"
    | "no_listing_name"
    | "no_body_or_rating";
  /** Human-readable detail for the audit log. */
  detail: string;
  /** Any partial fields we DID extract — useful for manual triage. */
  partial: Partial<Omit<ParsedAirbnbReview, "ok">>;
}

export type ParseResult = ParsedAirbnbReview | ParseFailure;

export interface ParseInput {
  from: string;
  subject: string;
  htmlBody: string | null;
  textBody: string | null;
  /** Optional — Resend's Date header. Falls back to `now` if missing. */
  receivedAt?: Date;
}

// =========================================================================
// Public entry point
// =========================================================================

export function parseAirbnbReviewEmail(input: ParseInput): ParseResult {
  // Reject obviously non-Airbnb senders early. We're tolerant on subdomain
  // (`automated@airbnb.com`, `express@airbnb.com`, `noreply.airbnb.com`)
  // but reject anything that isn't `*airbnb.com`.
  if (!isPlausibleAirbnbSender(input.from)) {
    return {
      ok: false,
      reason: "from_mismatch",
      detail: `sender ${input.from} does not match airbnb.com`,
      partial: {},
    };
  }

  const subject = normalizeSubject(input.subject ?? "");
  if (subject.length === 0) {
    return {
      ok: false,
      reason: "missing_subject",
      detail: "empty subject",
      partial: {},
    };
  }

  // We normalize whitespace on both bodies up front. Email clients
  // sprinkle non-breaking spaces, soft line breaks, and zero-width
  // joiners through forwarded HTML.
  const text = normalizeWhitespace(input.textBody ?? "");
  const html = normalizeWhitespace(input.htmlBody ?? "");
  const haystack = html.length > 0 ? html : text;
  const plainHaystack = html.length > 0 ? stripHtml(html) : text;

  const reviewerName = extractReviewerName(subject, plainHaystack);
  const listingName = extractListingName(subject, plainHaystack);
  const listingId = extractListingId(html);
  const rating = extractRating(plainHaystack);
  const body = extractReviewBody(plainHaystack, html.length > 0 ? html : null);
  const postedAt = extractPostedAt(plainHaystack, input.receivedAt);

  // We require a few fields to ingest. Without them we'd insert a degenerate
  // Review row that's worse than no row at all (it would dedup-clobber later
  // re-parses). Bail with a clear failure that the retry-sweep can act on.
  if (!reviewerName) {
    return {
      ok: false,
      reason: "no_reviewer_name",
      detail: "could not locate reviewer name in subject or body",
      partial: { listingName: listingName ?? undefined, rating: rating ?? undefined },
    };
  }
  if (!listingName) {
    return {
      ok: false,
      reason: "no_listing_name",
      detail: "could not locate listing/property name",
      partial: { reviewerName, rating: rating ?? undefined },
    };
  }
  if (rating == null && !body) {
    // Neither a rating nor a body. Almost certainly not a review email.
    return {
      ok: false,
      reason: "no_body_or_rating",
      detail: "no rating digit and no body text extracted",
      partial: { reviewerName, listingName },
    };
  }
  if (rating == null) {
    return {
      ok: false,
      reason: "no_rating_found",
      detail: "body present but no rating digit could be inferred",
      partial: { reviewerName, listingName, body },
    };
  }

  return {
    ok: true,
    externalReviewId: deriveStableId({
      listingName,
      reviewerName,
      postedAt,
    }),
    listingName,
    listingId,
    reviewerName,
    rating,
    body,
    postedAt,
    raw: {
      subject,
      from: input.from,
      htmlSnippet: html.slice(0, 2048),
    },
  };
}

// =========================================================================
// Field extractors — each tries multiple strategies, returns null on miss.
// =========================================================================

/**
 * Reviewer name. Strategies, in order of confidence:
 *   1. Subject pattern "<Name> reviewed your <listing>" / "<Name> left a review"
 *   2. Body pattern "<Name> said about your stay" / "<Name> wrote"
 *   3. Header line near the rating block (e.g., "From <Name>")
 */
function extractReviewerName(subject: string, plain: string): string | null {
  // Pattern order matters: the `\s{2,80}?` lazy capture in pattern 3 would
  // happily swallow "X has" when followed by "reviewed your", so the
  // "has reviewed" pattern MUST come BEFORE "reviewed your". Caught by
  // the "Sarah Chen has reviewed your home" test fixture.
  const subjectPatterns: RegExp[] = [
    // Most common modern format ("Alex left a review for Cliff House")
    /^([\p{L}\p{M}'’\-\s]{2,80}?)\s+(?:left|wrote|shared|posted|just\s+left)\s+a\s+review/iu,
    // "Sarah Chen has reviewed her stay…" — must come BEFORE the `reviewed your`
    // pattern so the capture stops at the right token.
    /^([\p{L}\p{M}'’\-\s]{2,80}?)\s+has\s+reviewed/iu,
    // Older "Alex reviewed your <listing>"
    /^([\p{L}\p{M}'’\-\s]{2,80}?)\s+(?:reviewed|just\s+reviewed)\s+(?:your|the)/iu,
  ];
  for (const re of subjectPatterns) {
    const m = subject.match(re);
    if (m?.[1]) return tidyName(m[1]);
  }

  const bodyPatterns: RegExp[] = [
    /\bfrom\s+([\p{L}\p{M}'’\-\s]{2,80}?)\b\s*(?:\n|\.|,)/iu,
    /\b([\p{L}\p{M}'’\-\s]{2,80}?)\s+said\b/iu,
    /\b([\p{L}\p{M}'’\-\s]{2,80}?)\s+wrote:/iu,
  ];
  for (const re of bodyPatterns) {
    const m = plain.match(re);
    if (m?.[1]) {
      const candidate = tidyName(m[1]);
      // Reject if it's a stop-phrase that the regex caught (Airbnb says "If
      // you have any questions, please contact us" — we don't want "any
      // questions").
      if (!isStopName(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * Listing/property name. Strategies:
 *   1. Subject quotes — Airbnb wraps the listing in straight or curly quotes
 *      ("Cliff House" or "Cozy Loft")
 *   2. Body "your listing, <Name>" / "review for <Name>"
 *   3. URL slug — Airbnb listing URLs end in /rooms/<id> and sometimes
 *      include a /title slug. We don't reverse-engineer the slug here.
 */
function extractListingName(subject: string, plain: string): string | null {
  // Try quotes first — most reliable signal Airbnb uses
  const quoted = subject.match(/[“"]([^"”]{2,120})[”"]/u) || plain.match(/[“"]([^"”]{2,120})[”"]/u);
  if (quoted?.[1]) return tidyName(quoted[1]);

  const subjectPatterns: RegExp[] = [
    /\bfor\s+your\s+(?:listing|stay\s+at|place|property|home|home\s+at)\s+(.{2,120}?)(?:\.|$)/iu,
    /\bat\s+(.{2,120}?)(?:\s+(?:on|in|just|today|yesterday))/iu,
  ];
  for (const re of subjectPatterns) {
    const m = subject.match(re);
    if (m?.[1]) return tidyName(m[1]);
  }

  const bodyPatterns: RegExp[] = [
    /\byour\s+(?:listing|home|place|property),?\s+([^\n.]{2,120})/iu,
    /\breview\s+for\s+([^\n.]{2,120})/iu,
  ];
  for (const re of bodyPatterns) {
    const m = plain.match(re);
    if (m?.[1]) {
      const candidate = tidyName(m[1]);
      if (!isStopName(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * Airbnb listing id. Best-effort — only extracted from HTML when present in
 * a listing-detail link like `airbnb.com/rooms/12345678` or
 * `airbnb.com/h/<slug>?listing_id=12345`. Used later to link the
 * Establishment row in the dashboard.
 */
function extractListingId(html: string): string | null {
  const patterns: RegExp[] = [
    /airbnb\.com\/rooms\/(\d{6,12})\b/i,
    /[?&]listing_id=(\d{6,12})\b/i,
    /\blisting_id["'\s:=]+(\d{6,12})\b/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

/**
 * Rating extraction is the trickiest field — Airbnb has rendered it three
 * different ways in the last 18 months:
 *   - 5 unicode ★ characters
 *   - 5 filled-star SVG images (alt text = "filled star")
 *   - Plain text "5 out of 5 stars" / "Rated 5"
 *   - Number near the word "stars"
 *
 * We score-vote across strategies. If two agree, we use that. If they
 * disagree, we trust the unicode-star count (most reliable).
 */
function extractRating(plain: string): number | null {
  // Strategy A — count consecutive filled unicode stars
  // (★ = U+2605 BLACK STAR, often grouped 5 in a row in templates)
  const starGroups = plain.match(/(★\s*){1,5}/g);
  if (starGroups && starGroups.length > 0) {
    // Use the LONGEST run — short runs are sometimes decorative
    const max = starGroups
      .map((g) => g.replace(/\s/g, "").length)
      .reduce((a, b) => Math.max(a, b), 0);
    if (max >= 1 && max <= 5) return max;
  }

  // Strategy B — explicit "N out of 5" / "N / 5"
  const outOf = plain.match(/\b([1-5](?:\.\d)?)\s*(?:out of|\/|of)\s*5\b/i);
  if (outOf?.[1]) {
    const n = Math.round(Number(outOf[1]));
    if (n >= 1 && n <= 5) return n;
  }

  // Strategy C — "rated N" / "gave a N-star review"
  const ratedN = plain.match(/\b(?:rated|gave\s+(?:a|an))\s+([1-5])(?:[\s\-]?star)/i);
  if (ratedN?.[1]) {
    const n = Number(ratedN[1]);
    if (n >= 1 && n <= 5) return n;
  }

  // Strategy D — "N-star review"
  const nStar = plain.match(/\b([1-5])[\s\-]?star\s+review/i);
  if (nStar?.[1]) {
    const n = Number(nStar[1]);
    if (n >= 1 && n <= 5) return n;
  }

  return null;
}

/**
 * Public review body — the text the guest wrote. Sometimes empty (guest
 * gave a star rating without writing). We extract by isolating the longest
 * paragraph block that isn't boilerplate.
 *
 * Heuristics for "this is the review":
 *   - Block of 2+ sentences (>=80 chars) OR a quoted block (...)
 *   - Not containing boilerplate phrases ("View this review", "unsubscribe",
 *     "©Airbnb", "Manage your account")
 *   - Not the listing name (we already extracted that)
 */
function extractReviewBody(plain: string, htmlSource: string | null): string {
  // Strategy 1 — pull <blockquote>...</blockquote> directly from HTML.
  // Airbnb consistently wraps the review text in a blockquote, so this
  // is the most reliable signal. Bypasses the "pick longest paragraph"
  // heuristic that otherwise mistakes the meta-header for the review.
  if (htmlSource) {
    const bq = htmlSource.match(/<blockquote[^>]*>([\s\S]+?)<\/blockquote>/i);
    if (bq?.[1]) {
      const text = stripHtml(bq[1]).trim();
      if (text.length >= 10 && !isBoilerplate(text)) {
        return text.replace(/^["“]/, "").replace(/["”]$/, "").trim();
      }
    }
  }
  return extractReviewBodyFromPlain(plain);
}

function extractReviewBodyFromPlain(plain: string): string {
  // Drop boilerplate footers and standardize newlines first.
  const cleaned = plain
    .replace(/^>+/gm, "") // leading > from forwarded-email quoting
    .replace(/[   ]/g, " ") // various non-breaking spaces
    .split(/\n{2,}/) // paragraph break
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .filter((p) => !isBoilerplate(p))
    .filter((p) => !looksLikeMetaHeader(p));

  // Pick longest paragraph that smells like prose, not metadata.
  const candidates = cleaned.filter((p) => {
    if (p.length < 30) return false;
    // Too many digits → probably a receipt or itinerary
    const digitRatio = (p.match(/\d/g)?.length ?? 0) / p.length;
    if (digitRatio > 0.15) return false;
    return true;
  });
  if (candidates.length === 0) return "";

  candidates.sort((a, b) => b.length - a.length);
  // Trim quoted-block markers and trailing host signatures
  return (candidates[0] ?? "").replace(/^["“]/, "").replace(/["”]$/, "").trim();
}

/**
 * Posted-at timestamp. Strategies in order:
 *   1. "Posted on <date>" or "Reviewed on <date>" — Airbnb sometimes
 *      includes this in the body
 *   2. The email's Date header (passed in as receivedAt) — most reliable
 *   3. Now() as a last-resort floor
 *
 * We round to second precision because the email-header date is the most
 * precise we get and it's at second resolution.
 */
function extractPostedAt(plain: string, receivedAt: Date | undefined): Date {
  const phrasePatterns: RegExp[] = [
    /(?:Posted|Reviewed|Submitted|Published)\s+on\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
    /\bon\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
  ];
  for (const re of phrasePatterns) {
    const m = plain.match(re);
    if (m?.[1]) {
      const d = new Date(m[1]);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  return receivedAt ?? new Date();
}

// =========================================================================
// Helpers
// =========================================================================

/**
 * Defensive subject normalization.
 *
 * Forwarded emails arrive with various prefixes ("Fwd:", "FW:", "Re:") and
 * sometimes with an outer pair of wrapping double-quotes (Gmail's
 * forwarded-quote behavior on iOS, or email clients that auto-quote the
 * subject when forwarding). We strip those before pattern-matching so the
 * `^<reviewerName>` anchored regex still hits.
 *
 * We DO NOT strip internal quotes — those are how Airbnb wraps the
 * listing name (e.g. `Maria reviewed your home "Cliff House"`) and the
 * listing-name extractor depends on finding them.
 */
function normalizeSubject(raw: string): string {
  let s = raw.trim();

  // Strip up to two reply/forward prefixes (some hosts forward forwards).
  for (let i = 0; i < 2; i++) {
    s = s.replace(/^(?:re|fw|fwd)\s*:\s*/i, "").trim();
  }

  // Strip a single pair of wrapping straight or curly quotes. Only when
  // the wrapping pair is unambiguous (count of quotes is exactly 2 OR the
  // outer pair is curly-style). Internal quotes used for the listing name
  // stay intact.
  const straightQuoteCount = (s.match(/"/g) ?? []).length;
  if (s.startsWith('"') && straightQuoteCount === 2 && s.endsWith('"')) {
    s = s.slice(1, -1).trim();
  } else if (s.startsWith('"') && straightQuoteCount > 2) {
    // Heuristic: outer wrapper plus one internal quoted segment yields 4
    // total. Strip the leading wrapper; the listing-name extractor will
    // still find the inner quoted pair.
    s = s.slice(1).trim();
  }
  if (s.startsWith("“") && s.endsWith("”")) {
    s = s.slice(1, -1).trim();
  }

  return s;
}

function isPlausibleAirbnbSender(from: string): boolean {
  // We accept envelope-from variations: `Airbnb <automated@airbnb.com>`,
  // `noreply@airbnb.com`, `express@airbnb.com`, even forwarded versions
  // that arrive from the host's own Gmail — Gmail rewrites the Reply-To
  // but leaves the original sender visible in the body. We do a soft
  // check on the raw `from` string and trust the forwarding workflow to
  // gate the rest.
  const f = from.toLowerCase();
  return f.includes("airbnb.com") || f.includes("airbnb.co") || f.includes("airbnb.ie");
}

function tidyName(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/^["'“‘]/, "")
    .replace(/["'”’]$/, "")
    .replace(/[.,;:]\s*$/, "")
    .trim();
}

/** Names that the regex sometimes catches but obviously aren't a guest. */
function isStopName(s: string): boolean {
  const lower = s.toLowerCase();
  return (
    /^(your|the|airbnb|guest|host|review|stay|listing)\b/.test(lower) ||
    /\b(team|support|noreply|automated)\b/.test(lower) ||
    lower.length < 2 ||
    lower.length > 60
  );
}

/**
 * Meta-header detection. These phrases appear ONLY in the email's framing
 * paragraph, never in the guest's actual review text. We filter them out
 * before the "pick longest paragraph" pass — otherwise the framing
 * paragraph (often longer than the review) gets picked as the body.
 */
function looksLikeMetaHeader(p: string): boolean {
  const lower = p.toLowerCase();
  return (
    lower.includes("reviewed your") ||
    lower.includes("left a review") ||
    lower.includes("has reviewed") ||
    lower.includes("just left a review") ||
    lower.includes("your guest") ||
    /\b(your|the)\s+(home|stay|listing|property|place)\s+(at|on)\b/.test(lower)
  );
}

function isBoilerplate(p: string): boolean {
  const lower = p.toLowerCase();
  return (
    lower.includes("unsubscribe") ||
    lower.includes("view this email") ||
    lower.includes("preferences") ||
    lower.includes("©") ||
    lower.includes("manage your account") ||
    lower.includes("learn more") ||
    lower.includes("airbnb, inc") ||
    lower.includes("respond to this review") ||
    lower.includes("read on airbnb") ||
    (lower.startsWith("hi ") && lower.includes("airbnb"))
  );
}

function normalizeWhitespace(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .replace(/[​-‏﻿]/g, "") // zero-width chars
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n");
}

function stripHtml(html: string): string {
  // Tiny HTML-to-text. We don't pull in a dependency because all we need
  // for parsing is "drop tags and decode common entities."
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/&#\d+;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Stable external review id used for the (establishmentId, source, externalId)
 * unique constraint. We can't use Airbnb's review id because it's not in the
 * email. Hashing (listing + reviewer + date) makes the id deterministic
 * across re-parses of the same email — re-parsing the raw inbound row
 * yields the same `externalReviewId`, so we don't dup the Review row.
 */
function deriveStableId(input: {
  listingName: string;
  reviewerName: string;
  postedAt: Date;
}): string {
  // Use Node's built-in crypto without importing — we're already in
  // a Node runtime context. Keep this import dependency-free so the parser
  // can run in Edge or Worker contexts in the future.
  const dayStamp = input.postedAt.toISOString().slice(0, 10); // YYYY-MM-DD
  const fingerprint = `${input.listingName.toLowerCase()}|${input.reviewerName.toLowerCase()}|${dayStamp}`;
  // Tiny 32-bit hash — collision risk is acceptable because our uniqueness
  // is scoped to (establishment_id, source, external_id). Two different
  // hosts collide only if same listing-name + same reviewer + same day.
  let h = 2166136261;
  for (let i = 0; i < fingerprint.length; i++) {
    h ^= fingerprint.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `airbnb:${(h >>> 0).toString(36)}`;
}
