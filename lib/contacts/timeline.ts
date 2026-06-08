/**
 * Activity Timeline service (module 12, Wave 3b) — the architectural keystone.
 *
 * The timeline is a READ-TIME UNION across existing domain tables keyed on the
 * contact's identifiers (email / phone / name / socialIds), NOT a duplicated
 * event log. Rich events live in their home tables (reviews, survey responses,
 * inbox messages, review requests, calls, scans, social comments); the only rows
 * we WRITE are `ContactActivity` (tag/note/import/merge + "captured via X"
 * markers).
 *
 * Resilience properties (all required by the spec):
 *  - Each per-source query is wrapped in its own try/catch and capped with
 *    `take`, so one slow/empty/not-yet-migrated source can never break the page.
 *  - Results are normalized to a uniform `TimelineEvent`, merged, sorted by
 *    `occurredAt` desc, and cursor-paginated (cursor = occurredAt ISO + id).
 *  - Runs inside a single `withTenant` transaction (RLS).
 *
 * Pure mapping helpers are exported for unit tests (no DB needed).
 */

import type { Prisma } from "@prisma/client";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";

/** A channel/category a timeline event belongs to (drives the icon + badge). */
export type TimelineChannel =
  | "review"
  | "review_request"
  | "survey"
  | "inbox"
  | "social"
  | "live_chat"
  | "phone"
  | "scan"
  | "note"
  | "system";

export interface TimelineEvent {
  /** Stable per-event id: `<channel>:<sourceRowId>` (used for cursor + keys). */
  id: string;
  kind: string;
  channel: TimelineChannel;
  title: string;
  body: string | null;
  occurredAt: Date;
  /** Optional deep-link into the source surface. */
  href: string | null;
  /** Short glyph for the row icon (no icon dependency). */
  icon: string;
}

/** Minimal contact identity the timeline needs. */
export interface TimelineContact {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  socialIds?: Prisma.JsonValue | null;
}

export interface TimelineArgs {
  orgId: string;
  contact: TimelineContact;
  /** Cursor from a previous page: `${occurredAtISO}|${eventId}`. */
  cursor?: string | null;
  /** Page size (events returned). Default 20, capped 100. */
  take?: number | null;
}

export interface TimelinePage {
  events: TimelineEvent[];
  nextCursor: string | null;
}

const PER_SOURCE_CAP = 50;
const DEFAULT_TAKE = 20;
const MAX_TAKE = 100;

const ICONS: Record<TimelineChannel, string> = {
  review: "★",
  review_request: "✉",
  survey: "❒",
  inbox: "✱",
  social: "♥",
  live_chat: "✦",
  phone: "☎",
  scan: "▦",
  note: "✎",
  system: "•",
};

// ---------------------------------------------------------------------------
// Pure normalizers (exported for tests)
// ---------------------------------------------------------------------------

export function reviewToEvent(r: {
  id: string;
  source: string;
  rating: number;
  body: string | null;
  reviewerName: string | null;
  postedAt: Date;
}): TimelineEvent {
  return {
    id: `review:${r.id}`,
    kind: "review",
    channel: "review",
    title: `Left a ${r.rating}★ ${r.source.replace(/_/g, " ")} review`,
    body: r.body ?? null,
    occurredAt: r.postedAt,
    href: "/reviews",
    icon: ICONS.review,
  };
}

export function reviewRequestToEvent(r: {
  id: string;
  channel: string;
  status: string;
  recipient: string;
  createdAt: Date;
  sentAt: Date | null;
}): TimelineEvent {
  return {
    id: `review_request:${r.id}`,
    kind: "review_request",
    channel: "review_request",
    title: `Review request sent via ${r.channel}`,
    body: r.status ? `Status: ${r.status}` : null,
    occurredAt: r.sentAt ?? r.createdAt,
    href: "/outreach",
    icon: ICONS.review_request,
  };
}

export function surveyResponseToEvent(r: {
  id: string;
  rating: number | null;
  createdAt: Date;
  completedAt: Date | null;
  campaignName?: string | null;
}): TimelineEvent {
  return {
    id: `survey:${r.id}`,
    kind: "survey_response",
    channel: "survey",
    title: r.campaignName ? `Responded to “${r.campaignName}”` : "Responded to a survey",
    body: r.rating != null ? `Rating: ${r.rating}` : null,
    occurredAt: r.completedAt ?? r.createdAt,
    href: "/surveys",
    icon: ICONS.survey,
  };
}

export function surveyInviteToEvent(t: {
  tokenHash: string;
  createdAt: Date;
  consumedAt: Date | null;
}): TimelineEvent {
  return {
    id: `survey_invite:${t.tokenHash.slice(0, 12)}`,
    kind: "survey_invite",
    channel: "survey",
    title: t.consumedAt ? "Survey invite (responded)" : "Survey invite sent",
    body: null,
    occurredAt: t.createdAt,
    href: "/surveys",
    icon: ICONS.survey,
  };
}

export function inboxMessageToEvent(m: {
  id: string;
  channel: string;
  direction: string;
  body: string;
  sentAt: Date;
  threadId: string;
}): TimelineEvent {
  const dir = m.direction === "outbound" ? "Sent" : "Received";
  return {
    id: `inbox:${m.id}`,
    kind: "inbox_message",
    channel: "inbox",
    title: `${dir} ${m.channel.replace(/_/g, " ")} message`,
    body: m.body ? m.body.slice(0, 280) : null,
    occurredAt: m.sentAt,
    href: "/support",
    icon: ICONS.inbox,
  };
}

export function socialCommentToEvent(c: {
  id: string;
  platform: string;
  body: string;
  postedAt: Date;
}): TimelineEvent {
  return {
    id: `social:${c.id}`,
    kind: "social_comment",
    channel: "social",
    title: `Commented on ${c.platform.replace(/_/g, " ")}`,
    body: c.body ? c.body.slice(0, 280) : null,
    occurredAt: c.postedAt,
    href: "/support",
    icon: ICONS.social,
  };
}

export function liveChatToEvent(c: {
  id: string;
  createdAt: Date;
}): TimelineEvent {
  return {
    id: `live_chat:${c.id}`,
    kind: "live_chat",
    channel: "live_chat",
    title: "Started a live chat",
    body: null,
    occurredAt: c.createdAt,
    href: "/support",
    icon: ICONS.live_chat,
  };
}

export function phoneCallToEvent(c: {
  id: string;
  direction: string;
  summary: string | null;
  startedAt: Date;
}): TimelineEvent {
  return {
    id: `phone:${c.id}`,
    kind: "phone_call",
    channel: "phone",
    title: c.direction === "outbound" ? "Outbound call" : "Inbound call",
    body: c.summary ?? null,
    occurredAt: c.startedAt,
    href: null,
    icon: ICONS.phone,
  };
}

export function activityToEvent(a: {
  id: string;
  kind: string;
  source: string | null;
  title: string | null;
  body: string | null;
  occurredAt: Date;
}): TimelineEvent {
  const channel: TimelineChannel = a.kind === "captured" ? "system" : "note";
  return {
    id: `activity:${a.id}`,
    kind: a.kind,
    channel,
    title: a.title ?? a.kind.replace(/_/g, " "),
    body: a.body ?? null,
    occurredAt: a.occurredAt,
    href: null,
    icon: a.kind === "captured" ? ICONS.system : ICONS.note,
  };
}

/**
 * Merge, sort desc, and cursor-paginate a flat list of events. Exported for
 * tests. Cursor format: `${occurredAt.toISOString()}|${id}`. We page by taking
 * events strictly older than the cursor (ties broken by id) — deterministic
 * because (occurredAt, id) is a total order.
 */
export function mergeAndPaginate(
  events: TimelineEvent[],
  cursor: string | null | undefined,
  take: number,
): TimelinePage {
  const sorted = [...events].sort((a, b) => {
    const d = b.occurredAt.getTime() - a.occurredAt.getTime();
    return d !== 0 ? d : (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
  });

  let start = 0;
  if (cursor) {
    const [iso, id] = cursor.split("|");
    const cTime = iso ? new Date(iso).getTime() : Number.NaN;
    if (!Number.isNaN(cTime)) {
      start = sorted.findIndex((e) => {
        const t = e.occurredAt.getTime();
        if (t < cTime) return true;
        if (t === cTime && id) return e.id < id;
        return false;
      });
      if (start === -1) start = sorted.length;
    }
  }

  const slice = sorted.slice(start, start + take);
  const last = slice[slice.length - 1];
  const hasMore = start + take < sorted.length;
  const nextCursor = hasMore && last ? `${last.occurredAt.toISOString()}|${last.id}` : null;
  return { events: slice, nextCursor };
}

// ---------------------------------------------------------------------------
// Per-source readers (each isolated + capped + fail-soft)
// ---------------------------------------------------------------------------

/** Run a capped per-source read; on ANY error return [] (logged at debug). */
async function safeSource<T extends TimelineEvent>(
  label: string,
  fn: () => Promise<T[]>,
): Promise<TimelineEvent[]> {
  try {
    return await fn();
  } catch (err) {
    // Missing tables (pre-migration) + transient errors must never break the
    // page. Log at warn only for genuinely unexpected shapes.
    logger.warn({
      event: "contacts.timeline.source_failed",
      source: label,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Collect every source's events for a contact inside one tenant transaction.
 * Returns the full unsorted union (caller paginates). Each source is independent.
 */
async function collectEvents(
  tx: Prisma.TransactionClient,
  orgId: string,
  contact: TimelineContact,
): Promise<TimelineEvent[]> {
  const email = contact.email?.toLowerCase() ?? null;
  const phone = contact.phone ?? null;
  const name = contact.name ?? null;
  const recipientKeys = [email, phone].filter((v): v is string => !!v);

  const out: TimelineEvent[] = [];

  // --- ContactActivity (the only table we write) ---
  out.push(
    ...(await safeSource("activity", async () => {
      const rows = await tx.contactActivity.findMany({
        where: { contactId: contact.id, organizationId: orgId },
        orderBy: { occurredAt: "desc" },
        take: PER_SOURCE_CAP,
        select: { id: true, kind: true, source: true, title: true, body: true, occurredAt: true },
      });
      return rows.map(activityToEvent);
    })),
  );

  // --- Reviews (no contact FK → best-effort match on reviewerName) ---
  if (name) {
    out.push(
      ...(await safeSource("reviews", async () => {
        const rows = await tx.review.findMany({
          where: { organizationId: orgId, reviewerName: { equals: name, mode: "insensitive" } },
          orderBy: { postedAt: "desc" },
          take: PER_SOURCE_CAP,
          select: { id: true, source: true, rating: true, body: true, reviewerName: true, postedAt: true },
        });
        return rows.map(reviewToEvent);
      })),
    );
  }

  // --- Review requests (match recipient on email/phone) ---
  if (recipientKeys.length > 0) {
    out.push(
      ...(await safeSource("review_requests", async () => {
        const rows = await tx.reviewRequest.findMany({
          where: { organizationId: orgId, recipient: { in: recipientKeys } },
          orderBy: { createdAt: "desc" },
          take: PER_SOURCE_CAP,
          select: { id: true, channel: true, status: true, recipient: true, createdAt: true, sentAt: true },
        });
        return rows.map(reviewRequestToEvent);
      })),
    );
  }

  // --- Survey responses (recipient = email) ---
  if (email) {
    out.push(
      ...(await safeSource("survey_responses", async () => {
        const rows = await tx.surveyResponse.findMany({
          where: { organizationId: orgId, recipient: email },
          orderBy: { createdAt: "desc" },
          take: PER_SOURCE_CAP,
          select: {
            id: true,
            ratingSummary: true,
            createdAt: true,
            completedAt: true,
            campaign: { select: { name: true } },
          },
        });
        return rows.map((r) =>
          surveyResponseToEvent({
            id: r.id,
            rating: r.ratingSummary != null ? Number(r.ratingSummary) : null,
            createdAt: r.createdAt,
            completedAt: r.completedAt,
            campaignName: r.campaign?.name ?? null,
          }),
        );
      })),
    );

    // --- Survey invites (token recipient = email) ---
    out.push(
      ...(await safeSource("survey_invites", async () => {
        const rows = await tx.surveyResponseToken.findMany({
          where: { organizationId: orgId, recipient: email },
          orderBy: { createdAt: "desc" },
          take: PER_SOURCE_CAP,
          select: { tokenHash: true, createdAt: true, consumedAt: true },
        });
        return rows.map(surveyInviteToEvent);
      })),
    );
  }

  // --- Inbox messages (match thread participant email/phone) ---
  if (recipientKeys.length > 0) {
    out.push(
      ...(await safeSource("inbox", async () => {
        // participant is free-form JSON; match threads whose participant JSON
        // string contains an identifier, then pull their messages. Bounded.
        // `string_contains` is the JSON filter op; build the where as a typed
        // value so it validates against the (nullable) Json field exactly.
        const inboxWhere: Prisma.InboxThreadWhereInput = {
          organizationId: orgId,
          OR: recipientKeys.map(
            (k): Prisma.InboxThreadWhereInput => ({ participant: { string_contains: k } }),
          ),
        };
        const threads = await tx.inboxThread.findMany({
          where: inboxWhere,
          orderBy: { lastMessageAt: "desc" },
          take: 10,
          select: { id: true },
        });
        if (threads.length === 0) return [];
        const messages = await tx.inboxMessage.findMany({
          where: { threadId: { in: threads.map((t) => t.id) }, organizationId: orgId },
          orderBy: { sentAt: "desc" },
          take: PER_SOURCE_CAP,
          select: { id: true, direction: true, body: true, sentAt: true, threadId: true },
        });
        // channel lives on the thread; fetch a map for labels.
        const channelById = new Map<string, string>();
        const full = await tx.inboxThread.findMany({
          where: { id: { in: threads.map((t) => t.id) } },
          select: { id: true, channel: true },
        });
        for (const t of full) channelById.set(t.id, t.channel);
        return messages.map((m) =>
          inboxMessageToEvent({
            id: m.id,
            channel: channelById.get(m.threadId) ?? "inbox",
            direction: m.direction,
            body: m.body,
            sentAt: m.sentAt,
            threadId: m.threadId,
          }),
        );
      })),
    );
  }

  // --- Social comments (match authorName) ---
  if (name) {
    out.push(
      ...(await safeSource("social", async () => {
        const rows = await tx.socialComment.findMany({
          where: { organizationId: orgId, authorName: { equals: name, mode: "insensitive" } },
          orderBy: { postedAt: "desc" },
          take: PER_SOURCE_CAP,
          select: { id: true, platform: true, body: true, postedAt: true },
        });
        return rows.map(socialCommentToEvent);
      })),
    );
  }

  // --- Live chat (AiConversation lead email/phone) ---
  if (recipientKeys.length > 0) {
    out.push(
      ...(await safeSource("live_chat", async () => {
        const rows = await tx.aiConversation.findMany({
          where: {
            organizationId: orgId,
            OR: [
              ...(email ? [{ leadEmail: email }] : []),
              ...(phone ? [{ leadPhone: phone }] : []),
            ],
          },
          orderBy: { createdAt: "desc" },
          take: PER_SOURCE_CAP,
          select: { id: true, createdAt: true },
        });
        return rows.map(liveChatToEvent);
      })),
    );
  }

  // --- Phone calls (caller number = contact phone) ---
  if (phone) {
    out.push(
      ...(await safeSource("phone", async () => {
        const rows = await tx.phoneCall.findMany({
          where: { organizationId: orgId, OR: [{ fromE164: phone }, { leadPhone: phone }] },
          orderBy: { startedAt: "desc" },
          take: PER_SOURCE_CAP,
          select: { id: true, direction: true, summary: true, startedAt: true },
        });
        return rows.map(phoneCallToEvent);
      })),
    );
  }

  return out;
}

/**
 * The public entry point. Loads every source for the contact, merges, sorts
 * desc, and returns one cursor page. Fail-soft end to end: a whole-transaction
 * failure yields an empty page rather than throwing.
 */
export async function getContactTimeline(args: TimelineArgs): Promise<TimelinePage> {
  const take = Math.min(Math.max(args.take ?? DEFAULT_TAKE, 1), MAX_TAKE);
  try {
    const events = await withTenant(args.orgId, (tx) =>
      collectEvents(tx, args.orgId, args.contact),
    );
    return mergeAndPaginate(events, args.cursor, take);
  } catch (err) {
    logger.warn({
      event: "contacts.timeline.failed",
      orgId: args.orgId,
      contactId: args.contact.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return { events: [], nextCursor: null };
  }
}
