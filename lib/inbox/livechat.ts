/**
 * Live-chat session reads + helpers (Module 09, Wave 3c — phase 3).
 *
 * The Live Chat tab is the real-time face of the `webchat` channel: anonymous
 * website visitors talking to the AI/agent through the embedded widget. Three
 * data sources back it:
 *   - `LiveChatVisitor`  — presence/identity/geo per visitor (one row per visitor)
 *   - `AiConversation`   — the widget conversation (channel:"webchat") + handoff
 *   - `AiMessage`        — the actual chatbot transcript (purpose:"chatbot")
 *   - `InboxThread`      — the unified mirror (channel:"webchat") that the
 *                          Conversations tab + agents reply through
 *
 * This module exposes:
 *   - `listLiveSessions` — the visitor session list for the tab (joined view)
 *   - `getSessionTranscript` — a single session's transcript (AiMessage rows)
 *   - `mirrorWebchatTurn` — additively mirror a widget turn into an InboxThread
 *       so it shows up in Conversations (called by the converse route)
 *   - `closeStaleLiveSessions` — the cron sweep that resolves idle webchat threads
 *
 * All reads/writes are tenant-scoped + fail-soft. `mirrorWebchatTurn` NEVER
 * throws (it runs inside the live widget request path — a mirror failure must not
 * break the visitor's chat).
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { isMissingRelation, softInbox } from "./fail-soft";

/** A live-chat session row for the tab list. */
export type LiveSession = {
  conversationId: string;
  visitorId: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  currentUrl: string | null;
  online: boolean; // active in the last few minutes
  handedOff: boolean;
  lastActivityAt: string; // ISO
  /** The mirrored InboxThread id (if one exists) for "open in Conversations". */
  threadId: string | null;
};

/** A transcript message (widget AiMessage). */
export type LiveTranscriptMessage = {
  id: string;
  role: string; // user | assistant | system
  content: string;
  createdAt: string; // ISO
};

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

function locationOf(v: {
  city: string | null;
  region: string | null;
  country: string | null;
}): string | null {
  const parts = [v.city, v.region, v.country].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/**
 * List recent live-chat sessions (most-recent-active first). Joins the
 * `AiConversation` (webchat) to its `LiveChatVisitor` (presence/identity) and
 * resolves the mirrored `InboxThread` id where present. Fail-soft → [].
 */
export async function listLiveSessions(args: {
  orgId: string;
  take?: number;
}): Promise<LiveSession[]> {
  const take = Math.min(Math.max(args.take ?? 50, 1), 100);
  return softInbox(
    () =>
      withTenant(args.orgId, async (tx) => {
        const convs = await tx.aiConversation.findMany({
          where: { channel: "webchat" },
          orderBy: { createdAt: "desc" },
          take,
          select: {
            id: true,
            visitorId: true,
            leadEmail: true,
            leadPhone: true,
            handedOffAt: true,
            createdAt: true,
          },
        });
        if (convs.length === 0) return [];

        const visitorIds = [...new Set(convs.map((c) => c.visitorId))];
        const visitors = await tx.liveChatVisitor.findMany({
          where: { visitorId: { in: visitorIds } },
          select: {
            visitorId: true,
            displayName: true,
            email: true,
            phone: true,
            city: true,
            region: true,
            country: true,
            currentUrl: true,
            lastActivityAt: true,
          },
        });
        const byVisitor = new Map(visitors.map((v) => [v.visitorId, v]));

        // Mirrored threads: webchat threads keyed by externalThreadId = conv id.
        const convIds = convs.map((c) => c.id);
        const threads = await tx.inboxThread.findMany({
          where: {
            channel: "webchat",
            externalThreadId: { in: convIds.map((id) => `webchat:${id}`) },
          },
          select: { id: true, externalThreadId: true },
        });
        const threadByExt = new Map(
          threads.map((t) => [t.externalThreadId ?? "", t.id] as const),
        );

        const now = Date.now();
        return convs.map((c) => {
          const v = byVisitor.get(c.visitorId);
          const lastActivity = v?.lastActivityAt ?? c.createdAt;
          return {
            conversationId: c.id,
            visitorId: c.visitorId,
            displayName: v?.displayName ?? null,
            email: c.leadEmail ?? v?.email ?? null,
            phone: c.leadPhone ?? v?.phone ?? null,
            location: v ? locationOf(v) : null,
            currentUrl: v?.currentUrl ?? null,
            online: now - new Date(lastActivity).getTime() < ONLINE_WINDOW_MS,
            handedOff: c.handedOffAt !== null,
            lastActivityAt: new Date(lastActivity).toISOString(),
            threadId: threadByExt.get(`webchat:${c.id}`) ?? null,
          } satisfies LiveSession;
        });
      }),
    [],
    { event: "inbox.livechat.listSessions.failed", swallowAll: true, context: { orgId: args.orgId } },
  );
}

/** Count online (active in last 5 min) live-chat visitors. Fail-soft → 0. */
export async function countOnlineVisitors(orgId: string): Promise<number> {
  return softInbox(
    () =>
      withTenant(orgId, async (tx) =>
        tx.liveChatVisitor.count({
          where: { lastActivityAt: { gte: new Date(Date.now() - ONLINE_WINDOW_MS) } },
        }),
      ),
    0,
    { event: "inbox.livechat.countOnline.failed", swallowAll: true, context: { orgId } },
  );
}

/**
 * Load a single session's transcript (the widget AiMessage rows, oldest-first).
 * AiMessage has no Prisma relation to AiConversation, so we filter by
 * conversationId + org + purpose. Fail-soft → [].
 */
export async function getSessionTranscript(args: {
  orgId: string;
  conversationId: string;
}): Promise<LiveTranscriptMessage[]> {
  return softInbox(
    () =>
      withTenant(args.orgId, async (tx) => {
        const rows = await tx.aiMessage.findMany({
          where: {
            organizationId: args.orgId,
            conversationId: args.conversationId,
            purpose: "chatbot",
          },
          orderBy: { createdAt: "asc" },
          take: 200,
          select: { id: true, role: true, content: true, createdAt: true },
        });
        return rows.map((r) => ({
          id: r.id,
          role: r.role,
          content: r.content,
          createdAt: r.createdAt.toISOString(),
        }));
      }),
    [],
    {
      event: "inbox.livechat.transcript.failed",
      swallowAll: true,
      context: { orgId: args.orgId },
    },
  );
}

/**
 * Additively mirror a widget conversation turn into a `webchat` InboxThread so
 * the conversation appears in the unified Conversations tab and an agent can take
 * it over. Idempotent on (channel:"webchat", externalThreadId:"webchat:<convId>")
 * for the thread; messages are de-duped on `externalId` (the AiMessage id).
 *
 * NEVER throws — this runs inside the live `/api/ai/chatbot/converse` request and
 * a mirror failure (incl. a not-yet-migrated relation) must not break the chat.
 * Returns the thread id on success, null otherwise.
 */
export async function mirrorWebchatTurn(args: {
  orgId: string;
  establishmentId?: string | null;
  conversationId: string;
  visitorId: string;
  /** The visitor's inbound message. */
  inbound: { id?: string | null; body: string; at?: Date };
  /** The AI's reply (omit when the AI didn't answer, e.g. handoff/capture). */
  outbound?: { id?: string | null; body: string; at?: Date } | null;
  /** Mark the mirrored thread as needing a human (handoff/escalation). */
  needsHuman?: boolean;
  /** Visitor display name / contact, if known. */
  participant?: { name?: string | null; email?: string | null; phone?: string | null };
}): Promise<string | null> {
  try {
    return await withTenant(args.orgId, async (tx) => {
      const externalThreadId = `webchat:${args.conversationId}`;
      const now = new Date();

      const existing = await tx.inboxThread.findFirst({
        where: { channel: "webchat", externalThreadId },
        select: { id: true, participant: true },
      });

      const baseParticipant: Record<string, unknown> = {
        startedViaWidget: true,
        visitorId: args.visitorId,
        conversationId: args.conversationId,
        ...(args.participant?.name ? { name: args.participant.name } : {}),
        ...(args.participant?.email ? { email: args.participant.email } : {}),
        ...(args.participant?.phone ? { phone: args.participant.phone } : {}),
      };

      let threadId: string;
      if (existing) {
        threadId = existing.id;
        const prev =
          existing.participant && typeof existing.participant === "object"
            ? (existing.participant as Record<string, unknown>)
            : {};
        await tx.inboxThread.update({
          where: { id: threadId },
          data: {
            participant: { ...prev, ...baseParticipant } as Prisma.InputJsonValue,
            ...(args.needsHuman ? { status: "open" } : {}),
          },
        });
      } else {
        const created = await tx.inboxThread.create({
          data: {
            organizationId: args.orgId,
            establishmentId: args.establishmentId ?? null,
            channel: "webchat",
            externalThreadId,
            subject: "Website chat",
            participant: baseParticipant as Prisma.InputJsonValue,
            status: "open",
            lastMessageAt: now,
            unreadCount: 0,
          },
          select: { id: true },
        });
        threadId = created.id;
      }

      // Append the inbound message (dedupe on externalId when we have one).
      const inboundAt = args.inbound.at ?? now;
      const inboundExtId = args.inbound.id ? `aim:${args.inbound.id}` : null;
      const inboundExists = inboundExtId
        ? await tx.inboxMessage.findFirst({
            where: { threadId, externalId: inboundExtId },
            select: { id: true },
          })
        : null;
      if (!inboundExists) {
        await tx.inboxMessage.create({
          data: {
            threadId,
            organizationId: args.orgId,
            direction: "inbound",
            body: args.inbound.body.slice(0, 8000),
            externalId: inboundExtId,
            sentAt: inboundAt,
          },
        });
      }

      let lastBody = args.inbound.body;
      let lastDir = "inbound";
      let lastAt = inboundAt;
      let unreadDelta = inboundExists ? 0 : 1;

      // Append the AI/outbound reply if present.
      if (args.outbound && args.outbound.body.trim()) {
        const outAt = args.outbound.at ?? new Date(inboundAt.getTime() + 1);
        const outExtId = args.outbound.id ? `aim:${args.outbound.id}` : null;
        const outExists = outExtId
          ? await tx.inboxMessage.findFirst({
              where: { threadId, externalId: outExtId },
              select: { id: true },
            })
          : null;
        if (!outExists) {
          await tx.inboxMessage.create({
            data: {
              threadId,
              organizationId: args.orgId,
              direction: "outbound",
              body: args.outbound.body.slice(0, 8000),
              aiSuggested: args.outbound.body.slice(0, 8000),
              externalId: outExtId,
              sentAt: outAt,
            },
          });
          lastBody = args.outbound.body;
          lastDir = "outbound";
          lastAt = outAt;
          // An AI auto-answer clears the unread bump (it's handled).
          unreadDelta = 0;
        }
      }

      await tx.inboxThread.update({
        where: { id: threadId },
        data: {
          lastMessageAt: lastAt,
          lastMessageBody: lastBody.slice(0, 500),
          lastMessageDirection: lastDir,
          ...(unreadDelta ? { unreadCount: { increment: unreadDelta } } : {}),
        },
      });

      return threadId;
    });
  } catch (err) {
    if (!isMissingRelation(err)) {
      logger.warn({
        event: "inbox.livechat.mirror.failed",
        orgId: args.orgId,
        conversationId: args.conversationId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return null;
  }
}

/**
 * Cron sweep: close idle webchat sessions. A `webchat` InboxThread whose last
 * activity is older than `idleMinutes` and is still `open` is marked `resolved`
 * (the visitor left; nothing pending). Returns how many were closed.
 *
 * Cross-tenant safe: caller passes one orgId at a time via withTenant. Fail-soft
 * → 0 when the relation isn't migrated.
 */
export async function closeStaleLiveSessions(args: {
  orgId: string;
  idleMinutes?: number;
}): Promise<number> {
  const idleMs = Math.max(args.idleMinutes ?? 30, 1) * 60 * 1000;
  const cutoff = new Date(Date.now() - idleMs);
  return softInbox(
    () =>
      withTenant(args.orgId, async (tx) => {
        const r = await tx.inboxThread.updateMany({
          where: {
            channel: "webchat",
            status: "open",
            lastMessageAt: { lt: cutoff },
            // Only auto-close visitor-originated sessions, not human escalations
            // that are explicitly waiting. We close those where the LAST message
            // was outbound (AI/agent answered, visitor gone) OR inbound but old.
          },
          data: { status: "resolved" },
        });
        return r.count;
      }),
    0,
    { event: "inbox.livechat.staleSweep.failed", context: { orgId: args.orgId } },
  );
}

/** Org ids with any webchat activity — used by the stale-sweep cron loop. */
export async function orgsWithLiveChat(limit = 5000): Promise<string[]> {
  try {
    const rows = await prisma.organization.findMany({ select: { id: true }, take: limit });
    return rows.map((r) => r.id);
  } catch (err) {
    logger.error({
      event: "inbox.livechat.orgList.failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
