/**
 * Unified inbound ingest pipeline (Module 09, Wave 3c-B — phase 3).
 *
 * The single normalisation + persistence layer every inbound channel webhook
 * (Meta Messenger / Instagram DM + comments, Google Business Messages, and later
 * Twilio inbound-SMS) funnels through. A webhook's only job is to verify the
 * signature, resolve the org, and hand a `InboundNormalized` (or `NormalizedComment`)
 * to `ingestInbound` / `ingestComment` here.
 *
 * ⚠ SELF-CONTAINED BY DESIGN. This file imports ONLY leaf-level shared infra:
 *   - `withTenant`            (tenant-scoped transaction + RLS)
 *   - `logger`
 *   - `captureContactInBackground`  (the reusable, self-contained contacts hook)
 * It MUST NOT import from `app/*` or from the other inbox coder's modules
 * (`./queries`, `./conversations`, `./suggest`, `./index`, …). A back-import would
 * couple the webhook ingest to the UI/read layer and risk a circular build. The
 * fail-soft helper is intentionally re-implemented locally for the same reason.
 *
 * Behaviour (all required by the spec):
 *  - **upsertThread** — find an `InboxThread` by `(organizationId, channel,
 *    externalThreadId)`; create it on first contact, else bump the last-message
 *    pointers + unread counter. Returns the thread id (or null fail-soft).
 *  - **appendMessage** — insert an inbound `InboxMessage`, **idempotent on
 *    `(threadId, externalId)`**: a re-delivered provider event with the same
 *    message id is a no-op (returns the existing row, `inserted:false`).
 *  - **upsertComment** — upsert a `SocialComment` (FB/IG comment), **idempotent
 *    on the `(platform, externalId)` unique** the schema already enforces.
 *  - **ingestInbound / ingestComment** — orchestrate the above for one normalised
 *    payload, then fire the contact auto-capture hook (fire-and-forget, never
 *    blocks). Returns a small summary the webhook can log.
 *  - **Fail-soft.** Any `42P01` (undefined_table) / `42703` (undefined_column)
 *    — i.e. the inbox schema not migrated yet — is swallowed and treated as a
 *    no-op so a webhook can never 500 the request before the migration lands.
 *
 * No external/paid calls happen here — this layer only persists. Auto-reply +
 * moderation are layered on by their own modules (phase 2/3) and are deliberately
 * NOT imported here to keep ingest a pure leaf.
 */

import { captureContactInBackground } from "@/lib/contacts/upsert-from-interaction";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import type { Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// Local fail-soft (kept self-contained — no import of the other coder's files)
// ---------------------------------------------------------------------------

/** Postgres 42P01 (undefined_table) / 42703 (undefined_column) → not migrated. */
export function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  if (code === "42P01" || code === "42703" || code === "P2021" || code === "P2022") return true;
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /does not exist|relation .* does not exist|column .* does not exist/i.test(msg);
}

/**
 * Run a DB fn; on a missing-relation/column (pre-migration) return `fallback`,
 * otherwise log + swallow (ingest must never throw back into a webhook handler —
 * the handler decides the HTTP status, and a transient ingest error should ACK so
 * the provider doesn't retry-storm on a poisoned payload).
 */
async function softIngest<T>(
  fn: () => Promise<T>,
  fallback: T,
  ctx: Record<string, unknown>,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isMissingRelation(err)) {
      logger.warn({
        event: "inbox.ingest.failed",
        ...ctx,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Normalised shapes — what every adapter produces
// ---------------------------------------------------------------------------

/** Canonical InboxThread.channel values an inbound message can map to. */
export type InboxChannel =
  | "email"
  | "facebook_msg"
  | "instagram_dm"
  | "whatsapp"
  | "gbp_qa"
  | "webchat"
  | "sms";

/** The normalised shape a DM / message webhook produces (one per message). */
export interface InboundNormalized {
  channel: InboxChannel;
  /** Provider thread/conversation id — the dedupe key for the thread. */
  externalThreadId: string;
  /** Provider message id — the idempotency key for the message. */
  externalId: string;
  body: string;
  /** Always inbound for a webhook; kept explicit for symmetry with the adapter type. */
  direction?: "inbound";
  sentAt?: Date | null;
  attachments?: unknown;
  /** Who sent it — drives the thread participant + contact auto-capture. */
  participant?: {
    externalId?: string | null;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    avatarUrl?: string | null;
  } | null;
  /** Optional thread subject (mostly GBP). */
  subject?: string | null;
}

/**
 * The platform a normalised comment is stored under. Organic page/media comments
 * use `facebook`/`instagram`; comments on BOOSTED / ad posts use the `_ad`
 * variants so the Comments inbox can offer an "Ad comments" filter and so the
 * `(platform, externalId)` idempotency key stays self-describing — all without a
 * schema migration (the `platform` column already free-texts the discriminator).
 */
export type CommentPlatform = "facebook" | "instagram" | "facebook_ad" | "instagram_ad";

/** The normalised shape a comment webhook / ad-comment poll produces (FB/IG). */
export interface NormalizedComment {
  platform: CommentPlatform;
  /** Semantic source of the comment. Defaults to "organic" when omitted. */
  kind?: "organic" | "ad";
  /** Provider comment id — the idempotency key (unique with platform). */
  externalId: string;
  /** The post/media the comment is on (for "view in context"). */
  externalPostId?: string | null;
  body: string;
  authorName?: string | null;
  authorAvatarUrl?: string | null;
  authorExternalId?: string | null;
  postedAt?: Date | null;
}

export interface IngestResult {
  ok: boolean;
  threadId?: string;
  messageInserted?: boolean;
  commentId?: string;
  commentInserted?: boolean;
  skipped?: string;
}

// ---------------------------------------------------------------------------
// Channel → Contact source mapping (mirrors lib/inbox/conversations.ts)
// ---------------------------------------------------------------------------

function channelToSource(channel: InboxChannel): string {
  switch (channel) {
    case "facebook_msg":
      return "facebook";
    case "instagram_dm":
      return "instagram";
    case "whatsapp":
      return "whatsapp";
    case "webchat":
      return "live_chat";
    case "gbp_qa":
      return "google_business";
    case "sms":
      return "sms";
    case "email":
      return "email";
    default:
      return "inbox";
  }
}

/** Build the `<platform>:<id>` socialId the contacts dedupe understands. */
function socialIdFor(
  channel: InboxChannel,
  externalAuthorId: string | null | undefined,
): string | null {
  if (!externalAuthorId) return null;
  if (channel === "facebook_msg") return `facebook:${externalAuthorId}`;
  if (channel === "instagram_dm") return `instagram:${externalAuthorId}`;
  if (channel === "whatsapp") return `whatsapp:${externalAuthorId}`;
  return null;
}

// ---------------------------------------------------------------------------
// upsertThread
// ---------------------------------------------------------------------------

/**
 * Find-or-create the `InboxThread` for an inbound message, bumping the
 * last-message pointers + unread counter when it already exists. Runs inside a
 * caller-supplied tenant transaction (so ingest can do thread + message in one
 * atomic unit). Returns the thread id, or null when the row can't be resolved.
 */
export async function upsertThread(
  tx: Prisma.TransactionClient,
  orgId: string,
  msg: InboundNormalized,
): Promise<string | null> {
  const now = msg.sentAt ?? new Date();
  const preview = msg.body.slice(0, 500);

  const existing = await tx.inboxThread.findFirst({
    where: {
      organizationId: orgId,
      channel: msg.channel,
      externalThreadId: msg.externalThreadId,
    },
    select: { id: true, participant: true },
  });

  if (existing) {
    // Merge any newly-seen participant identity without clobbering what's there.
    let participant: Prisma.InputJsonValue | undefined;
    if (msg.participant) {
      const prev =
        existing.participant && typeof existing.participant === "object"
          ? (existing.participant as Record<string, unknown>)
          : {};
      participant = pruneUndefined({
        ...prev,
        externalId: msg.participant.externalId ?? prev.externalId,
        name: msg.participant.name ?? prev.name,
        email: msg.participant.email ?? prev.email,
        phone: msg.participant.phone ?? prev.phone,
        avatarUrl: msg.participant.avatarUrl ?? prev.avatarUrl,
      }) as Prisma.InputJsonValue;
    }
    await tx.inboxThread.update({
      where: { id: existing.id },
      data: {
        lastMessageAt: now,
        lastMessageBody: preview,
        lastMessageDirection: "inbound",
        unreadCount: { increment: 1 },
        ...(participant ? { participant } : {}),
      },
    });
    return existing.id;
  }

  const created = await tx.inboxThread.create({
    data: {
      organizationId: orgId,
      channel: msg.channel,
      externalThreadId: msg.externalThreadId,
      subject: msg.subject ?? null,
      participant: msg.participant
        ? (pruneUndefined({
            externalId: msg.participant.externalId ?? undefined,
            name: msg.participant.name ?? undefined,
            email: msg.participant.email ?? undefined,
            phone: msg.participant.phone ?? undefined,
            avatarUrl: msg.participant.avatarUrl ?? undefined,
          }) as Prisma.InputJsonValue)
        : undefined,
      status: "open",
      lastMessageAt: now,
      lastMessageBody: preview,
      lastMessageDirection: "inbound",
      unreadCount: 1,
    },
    select: { id: true },
  });
  return created.id;
}

// ---------------------------------------------------------------------------
// appendMessage (idempotent on (threadId, externalId))
// ---------------------------------------------------------------------------

/**
 * Append an inbound `InboxMessage`, idempotent on `(threadId, externalId)`.
 * A re-delivered provider event with the same message id returns the existing
 * row with `inserted:false` and inserts nothing.
 */
export async function appendMessage(
  tx: Prisma.TransactionClient,
  orgId: string,
  threadId: string,
  msg: InboundNormalized,
): Promise<{ id: string; inserted: boolean }> {
  // Idempotency: dedupe on the provider message id within the thread.
  if (msg.externalId) {
    const dup = await tx.inboxMessage.findFirst({
      where: { threadId, externalId: msg.externalId },
      select: { id: true },
    });
    if (dup) return { id: dup.id, inserted: false };
  }

  const row = await tx.inboxMessage.create({
    data: {
      threadId,
      organizationId: orgId,
      direction: "inbound",
      body: msg.body,
      externalId: msg.externalId || null,
      attachments: (msg.attachments as Prisma.InputJsonValue | undefined) ?? undefined,
      sentAt: msg.sentAt ?? new Date(),
    },
    select: { id: true },
  });
  return { id: row.id, inserted: true };
}

// ---------------------------------------------------------------------------
// upsertComment (idempotent on (platform, externalId) unique)
// ---------------------------------------------------------------------------

/**
 * Upsert a `SocialComment` from an inbound FB/IG comment, idempotent on the
 * `(platform, externalId)` unique the schema enforces. A re-delivery updates the
 * body/author (which can change via edits) but never duplicates. Returns the
 * comment id + whether it was newly created.
 */
export async function upsertComment(
  tx: Prisma.TransactionClient,
  orgId: string,
  comment: NormalizedComment,
): Promise<{ id: string; inserted: boolean }> {
  const postedAt = comment.postedAt ?? new Date();

  const existing = await tx.socialComment.findUnique({
    where: { platform_externalId: { platform: comment.platform, externalId: comment.externalId } },
    select: { id: true },
  });

  if (existing) {
    await tx.socialComment.update({
      where: { id: existing.id },
      data: {
        body: comment.body,
        authorName: comment.authorName ?? undefined,
        authorAvatarUrl: comment.authorAvatarUrl ?? undefined,
        externalPostId: comment.externalPostId ?? undefined,
      },
    });
    return { id: existing.id, inserted: false };
  }

  const row = await tx.socialComment.create({
    data: {
      organizationId: orgId,
      platform: comment.platform,
      externalId: comment.externalId,
      externalPostId: comment.externalPostId ?? null,
      authorName: comment.authorName ?? null,
      authorAvatarUrl: comment.authorAvatarUrl ?? null,
      body: comment.body,
      status: "needs_reply",
      postedAt,
    },
    select: { id: true },
  });
  return { id: row.id, inserted: true };
}

// ---------------------------------------------------------------------------
// ingestInbound — DM/message orchestration (thread + message + contact capture)
// ---------------------------------------------------------------------------

/**
 * Ingest one normalised inbound DM/message: upsert the thread, append the message
 * (idempotent), and fire the contact auto-capture hook. Fail-soft end-to-end —
 * returns `{ ok:false, skipped }` rather than throwing on a not-migrated schema
 * or a missing identifier.
 */
export async function ingestInbound(orgId: string, msg: InboundNormalized): Promise<IngestResult> {
  if (!orgId) return { ok: false, skipped: "no_org" };
  if (!msg.externalThreadId || !msg.externalId) {
    return { ok: false, skipped: "missing_ids" };
  }

  const result = await softIngest<{ threadId: string; inserted: boolean } | null>(
    () =>
      withTenant(orgId, async (tx) => {
        const threadId = await upsertThread(tx, orgId, msg);
        if (!threadId) return null;
        const appended = await appendMessage(tx, orgId, threadId, msg);
        return { threadId, inserted: appended.inserted };
      }),
    null,
    { orgId, channel: msg.channel, externalId: msg.externalId },
  );

  if (!result) return { ok: false, skipped: "ingest_failed" };

  // Fire-and-forget contact auto-capture (only when the message was NEW — a
  // replay shouldn't re-stamp the timeline, and the hook is idempotent anyway).
  if (result.inserted && msg.participant) {
    const socialId = socialIdFor(msg.channel, msg.participant.externalId);
    if (msg.participant.email || msg.participant.phone || socialId) {
      captureContactInBackground({
        orgId,
        source: channelToSource(msg.channel),
        email: msg.participant.email ?? null,
        phone: msg.participant.phone ?? null,
        socialId,
        name: msg.participant.name ?? null,
        occurredAt: msg.sentAt ?? new Date(),
        activity: {
          title: "Messaged via Unified Inbox",
          externalRef: `inbox-inbound:${msg.externalId}`,
        },
      });
    }
  }

  logger.info({
    event: "inbox.ingest.message",
    orgId,
    channel: msg.channel,
    threadId: result.threadId,
    inserted: result.inserted,
  });

  return { ok: true, threadId: result.threadId, messageInserted: result.inserted };
}

// ---------------------------------------------------------------------------
// ingestComment — FB/IG comment orchestration (SocialComment + contact capture)
// ---------------------------------------------------------------------------

/**
 * Ingest one normalised inbound FB/IG comment: upsert the `SocialComment`
 * (idempotent) and fire contact auto-capture from the comment author. Fail-soft.
 */
export async function ingestComment(
  orgId: string,
  comment: NormalizedComment,
): Promise<IngestResult> {
  if (!orgId) return { ok: false, skipped: "no_org" };
  if (!comment.externalId) return { ok: false, skipped: "missing_ids" };

  const result = await softIngest<{ id: string; inserted: boolean } | null>(
    () => withTenant(orgId, (tx) => upsertComment(tx, orgId, comment)),
    null,
    { orgId, platform: comment.platform, externalId: comment.externalId },
  );

  if (!result) return { ok: false, skipped: "ingest_failed" };

  if (result.inserted && comment.authorExternalId) {
    // Ad comments share the same author identity space as organic ones — dedupe
    // contacts on the BASE platform ("facebook"/"instagram"), not the `_ad`
    // storage variant, so a commenter isn't split across two contact sources.
    const basePlatform = comment.platform.startsWith("instagram") ? "instagram" : "facebook";
    captureContactInBackground({
      orgId,
      source: basePlatform, // "facebook" | "instagram"
      socialId: `${basePlatform}:${comment.authorExternalId}`,
      name: comment.authorName ?? null,
      occurredAt: comment.postedAt ?? new Date(),
      activity: {
        title: comment.kind === "ad" ? `Commented on a ${basePlatform} ad` : `Commented on ${basePlatform}`,
        externalRef: `social-comment:${comment.externalId}`,
      },
    });
  }

  logger.info({
    event: "inbox.ingest.comment",
    orgId,
    platform: comment.platform,
    commentId: result.id,
    inserted: result.inserted,
  });

  return { ok: true, commentId: result.id, commentInserted: result.inserted };
}

// ---------------------------------------------------------------------------
// small util
// ---------------------------------------------------------------------------

/** Drop `undefined` keys so we never write JSON `undefined` into participant. */
function pruneUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}
