/**
 * Shared inbox read helpers (Module 09, Wave 3c — phase 1).
 *
 * One place for the Conversations panel + the poll route to read threads so the
 * shapes stay identical. All reads are tenant-scoped (`withTenant`) and fail-soft
 * (a not-yet-migrated relation returns empty, never 500s the inbox).
 *
 * NOTE: `InboxThread` / `InboxMessage` already exist in the live DB (shipped pre-
 * delta), so these reads work today; the fail-soft wrap is belt-and-suspenders
 * and also covers the `ModerationItem`-backed Needs-Attention count.
 */

import type { Prisma } from "@prisma/client";
import { withTenant } from "@/lib/db/with-tenant";
import { softInbox } from "./fail-soft";

/** The six channels an InboxThread can carry (matches the schema comment). */
export const INBOX_CHANNELS = [
  "email",
  "facebook_msg",
  "instagram_dm",
  "whatsapp",
  "gbp_qa",
  "webchat",
  "sms",
] as const;
export type InboxChannel = (typeof INBOX_CHANNELS)[number];

/** Coerce a free-text query-param channel into a known channel, else undefined. */
export function normalizeChannel(v: string | null | undefined): InboxChannel | undefined {
  if (!v) return undefined;
  return (INBOX_CHANNELS as readonly string[]).includes(v) ? (v as InboxChannel) : undefined;
}

/** Thread statuses we filter on. `open` / `resolved` are the primary toggle. */
export type InboxStatus = "open" | "resolved" | "snoozed" | "spam" | "all";
export function normalizeStatus(v: string | null | undefined): InboxStatus {
  if (v === "resolved" || v === "snoozed" || v === "spam" || v === "all") return v;
  return "open";
}

export type ThreadListItem = {
  id: string;
  channel: string;
  subject: string | null;
  status: string;
  assigneeId: string | null;
  participantName: string | null;
  startedViaWidget: boolean;
  lastMessageAt: string; // ISO
  lastMessageBody: string | null;
  lastMessageDirection: string | null;
  unreadCount: number;
};

/** Pull a display name + the widget-origin marker out of `participant` JSON. */
function readParticipant(p: unknown): { name: string | null; startedViaWidget: boolean } {
  if (!p || typeof p !== "object") return { name: null, startedViaWidget: false };
  const obj = p as Record<string, unknown>;
  const name =
    (typeof obj.name === "string" && obj.name) ||
    (typeof obj.displayName === "string" && obj.displayName) ||
    (typeof obj.email === "string" && obj.email) ||
    (typeof obj.phone === "string" && obj.phone) ||
    null;
  const startedViaWidget = obj.startedViaWidget === true;
  return { name, startedViaWidget };
}

function toListItem(t: {
  id: string;
  channel: string;
  subject: string | null;
  status: string;
  assigneeId: string | null;
  participant: unknown;
  lastMessageAt: Date;
  lastMessageBody: string | null;
  lastMessageDirection: string | null;
  unreadCount: number;
}): ThreadListItem {
  const { name, startedViaWidget } = readParticipant(t.participant);
  return {
    id: t.id,
    channel: t.channel,
    subject: t.subject,
    status: t.status,
    assigneeId: t.assigneeId,
    participantName: name,
    startedViaWidget,
    lastMessageAt: t.lastMessageAt.toISOString(),
    lastMessageBody: t.lastMessageBody,
    lastMessageDirection: t.lastMessageDirection,
    unreadCount: t.unreadCount,
  };
}

/**
 * List threads for the Conversations tab, filtered by channel/status/search and
 * ordered by recency. `q` matches subject OR last-message body (case-insensitive).
 */
export async function listThreads(args: {
  orgId: string;
  channel?: string;
  status?: string;
  q?: string;
  take?: number;
}): Promise<ThreadListItem[]> {
  const channel = normalizeChannel(args.channel);
  const status = normalizeStatus(args.status);
  const q = args.q?.trim();
  const take = Math.min(Math.max(args.take ?? 100, 1), 200);

  return softInbox(
    () =>
      withTenant(args.orgId, async (tx) => {
        const where: Prisma.InboxThreadWhereInput = {};
        if (channel) where.channel = channel;
        if (status !== "all") where.status = status;
        if (q) {
          where.OR = [
            { subject: { contains: q, mode: "insensitive" } },
            { lastMessageBody: { contains: q, mode: "insensitive" } },
          ];
        }
        const rows = await tx.inboxThread.findMany({
          where,
          orderBy: { lastMessageAt: "desc" },
          take,
          select: {
            id: true,
            channel: true,
            subject: true,
            status: true,
            assigneeId: true,
            participant: true,
            lastMessageAt: true,
            lastMessageBody: true,
            lastMessageDirection: true,
            unreadCount: true,
          },
        });
        return rows.map(toListItem);
      }),
    [],
    { event: "inbox.listThreads.failed", swallowAll: true, context: { orgId: args.orgId } },
  );
}

export type ThreadMessage = {
  id: string;
  direction: string; // inbound | outbound | internal
  body: string;
  authorUserId: string | null;
  aiSuggested: string | null;
  attachments: unknown;
  sentAt: string; // ISO
};

export type ThreadDetail = {
  thread: ThreadListItem & { externalThreadId: string | null; establishmentId: string | null };
  messages: ThreadMessage[];
};

/**
 * Load a single thread + its messages (oldest-first for chat rendering). Returns
 * null when the thread doesn't exist / isn't visible to this tenant (RLS) or the
 * relation isn't migrated.
 */
export async function getThreadWithMessages(args: {
  orgId: string;
  threadId: string;
  /** Only return messages strictly newer than this ISO timestamp (poll deltas). */
  since?: string;
}): Promise<ThreadDetail | null> {
  const sinceDate = args.since ? new Date(args.since) : null;
  const validSince = sinceDate && !Number.isNaN(sinceDate.getTime()) ? sinceDate : null;

  return softInbox(
    () =>
      withTenant(args.orgId, async (tx) => {
        const t = await tx.inboxThread.findUnique({
          where: { id: args.threadId },
          select: {
            id: true,
            channel: true,
            subject: true,
            status: true,
            assigneeId: true,
            participant: true,
            externalThreadId: true,
            establishmentId: true,
            lastMessageAt: true,
            lastMessageBody: true,
            lastMessageDirection: true,
            unreadCount: true,
          },
        });
        if (!t) return null;

        const messages = await tx.inboxMessage.findMany({
          where: {
            threadId: args.threadId,
            ...(validSince ? { sentAt: { gt: validSince } } : {}),
          },
          orderBy: { sentAt: "asc" },
          take: 200,
          select: {
            id: true,
            direction: true,
            body: true,
            authorUserId: true,
            aiSuggested: true,
            attachments: true,
            sentAt: true,
          },
        });

        const base = toListItem(t);
        return {
          thread: {
            ...base,
            externalThreadId: t.externalThreadId,
            establishmentId: t.establishmentId,
          },
          messages: messages.map((m) => ({
            id: m.id,
            direction: m.direction,
            body: m.body,
            authorUserId: m.authorUserId,
            aiSuggested: m.aiSuggested,
            attachments: m.attachments,
            sentAt: m.sentAt.toISOString(),
          })),
        };
      }),
    null,
    { event: "inbox.getThread.failed", swallowAll: true, context: { orgId: args.orgId } },
  );
}

/**
 * Count "Needs Attention" threads: inbound-last + still open. Used for the tab
 * badge + the queue header. Fail-soft → 0.
 */
export async function countNeedsAttention(orgId: string): Promise<number> {
  return softInbox(
    () =>
      withTenant(orgId, async (tx) =>
        tx.inboxThread.count({
          where: { status: "open", lastMessageDirection: "inbound" },
        }),
      ),
    0,
    { event: "inbox.countNeedsAttention.failed", swallowAll: true, context: { orgId } },
  );
}

/** Total open conversations (drives the "N active conversations" header chip). */
export async function countOpenThreads(orgId: string): Promise<number> {
  return softInbox(
    () => withTenant(orgId, async (tx) => tx.inboxThread.count({ where: { status: "open" } })),
    0,
    { event: "inbox.countOpen.failed", swallowAll: true, context: { orgId } },
  );
}

/** Per-channel open counts for the filter pills. Fail-soft → {}. */
export async function channelCounts(orgId: string): Promise<Record<string, number>> {
  return softInbox(
    () =>
      withTenant(orgId, async (tx) => {
        const grouped = await tx.inboxThread.groupBy({
          by: ["channel"],
          where: { status: { not: "spam" } },
          _count: true,
        });
        const out: Record<string, number> = {};
        for (const g of grouped) out[g.channel] = g._count;
        return out;
      }),
    {},
    { event: "inbox.channelCounts.failed", swallowAll: true, context: { orgId } },
  );
}
