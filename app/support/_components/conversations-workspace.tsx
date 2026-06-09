"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/shell/icon";
import { ThreadList } from "./thread-list";
import { ThreadView } from "./thread-view";
import { CustomerContext } from "./customer-context";

/**
 * Conversations workspace (client) — the 3-column hub matching the
 * 05_support-inbox artboard.
 *
 *   Left  : channel filter pills + search + the conversation queue (ThreadList).
 *   Center: the selected thread (ThreadView) — bubbles, status toggle, composer,
 *           AI Suggest.
 *   Right : CustomerContext (profile, AI assist summary, quick actions, timeline).
 *
 * Owns:
 *   - URL-driven filters (`?channel=`, `?q=`, `?thread=`) via router.replace so
 *     the server re-fetches the list (RSC) — the queue stays server-rendered.
 *   - the polling hook (useInboxPoll) that refreshes the ACTIVE thread's messages
 *     every few seconds (Page-Visibility-paused), reconciling optimistic sends.
 */

export type WorkThread = {
  id: string;
  channel: string;
  subject: string | null;
  status: string;
  assigneeId: string | null;
  participantName: string | null;
  startedViaWidget: boolean;
  lastMessageAt: string;
  lastMessageBody: string | null;
  lastMessageDirection: string | null;
  unreadCount: number;
};

export type WorkThreadDetail = WorkThread & {
  externalThreadId: string | null;
  establishmentId: string | null;
};

export type WorkMessage = {
  id: string;
  direction: string; // inbound | outbound | internal
  body: string;
  authorUserId: string | null;
  aiSuggested: string | null;
  attachments: unknown;
  sentAt: string;
  /** Client-only: optimistic message not yet reconciled from the server. */
  optimistic?: boolean;
};

export type Teammate = { id: string; name: string };

const CHANNEL_PILLS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "gbp_qa", label: "Google" },
  { key: "facebook_msg", label: "Facebook" },
  { key: "instagram_dm", label: "Instagram" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "email", label: "Email" },
  { key: "sms", label: "SMS" },
  { key: "webchat", label: "Live Chat" },
];

const POLL_INTERVAL_MS = 6000;

export function ConversationsWorkspace({
  threads: initialThreads,
  selectedThreadId,
  selectedThread,
  selectedMessages,
  teammates,
  filters,
  perChannel,
  openCount,
  aiEnabled,
}: {
  threads: WorkThread[];
  selectedThreadId: string | null;
  selectedThread: WorkThreadDetail | null;
  selectedMessages: WorkMessage[];
  teammates: Teammate[];
  filters: { channel: string; status: string; q: string };
  perChannel: Record<string, number>;
  openCount: number;
  aiEnabled: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // The list is server-driven (re-fetched on filter change). The active thread's
  // messages are owned locally so optimistic sends + polling can mutate them.
  const [messages, setMessages] = useState<WorkMessage[]>(selectedMessages);
  const [threadStatus, setThreadStatus] = useState<string>(selectedThread?.status ?? "open");
  const [searchValue, setSearchValue] = useState(filters.q);

  // Re-seed local state whenever the server hands us a different thread.
  useEffect(() => {
    setMessages(selectedMessages);
    setThreadStatus(selectedThread?.status ?? "open");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedThreadId]);

  /** Push a single search-param change, preserving the rest. */
  const setParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.set("tab", "conversations");
      if (value === null || value === "" || (key === "channel" && value === "all")) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
      // Changing filters resets the open thread to "first in list".
      if (key === "channel" || key === "q" || key === "status") params.delete("thread");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const selectThread = useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.set("tab", "conversations");
      params.set("thread", id);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  // Debounced search → ?q=
  useEffect(() => {
    if (searchValue === filters.q) return;
    const t = setTimeout(() => setParam("q", searchValue.trim() || null), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchValue]);

  // ---- Polling: refresh the active thread's messages (visibility-paused) ----
  // Keep the latest "real" (server-confirmed) message timestamp in a ref so the
  // poll closure always reads the current value (it isn't in the effect deps).
  const lastRealSentAtRef = useRef<string | null>(null);
  lastRealSentAtRef.current = messages.filter((m) => !m.optimistic).at(-1)?.sentAt ?? null;

  useEffect(() => {
    if (!selectedThreadId) return;
    let cancelled = false;

    async function poll() {
      if (document.visibilityState !== "visible") return;
      try {
        const params = new URLSearchParams({ thread: selectedThreadId as string });
        // Only fetch deltas newer than our last real (non-optimistic) message.
        const realLast = lastRealSentAtRef.current;
        if (realLast) params.set("since", realLast);
        const res = await fetch(`/api/inbox/poll?${params.toString()}`, {
          headers: { accept: "application/json" },
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          active: { messages: WorkMessage[] } | null;
        };
        const incoming = data.active?.messages ?? [];
        if (incoming.length === 0) return;
        setMessages((prev) => {
          const known = new Set(prev.filter((m) => !m.optimistic).map((m) => m.id));
          const fresh = incoming.filter((m) => !known.has(m.id));
          if (fresh.length === 0) return prev;
          // Drop optimistic rows that the server now confirms (match by body+dir).
          const confirmedBodies = new Set(fresh.map((m) => `${m.direction}:${m.body}`));
          const kept = prev.filter(
            (m) => !(m.optimistic && confirmedBodies.has(`${m.direction}:${m.body}`)),
          );
          return [...kept, ...fresh];
        });
      } catch {
        /* poll is best-effort */
      }
    }

    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedThreadId]);

  /** Optimistically append an outbound/internal message after a successful send. */
  const onSent = useCallback((msg: WorkMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const activeChannel = filters.channel;

  return (
    <div className="ds-card" style={{ padding: 0, overflow: "hidden" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(280px, 320px) minmax(0, 1fr) minmax(280px, 340px)",
          minHeight: 560,
        }}
      >
        {/* ---------- LEFT: queue ---------- */}
        <aside
          style={{
            borderRight: "1px solid var(--line)",
            background: "var(--bg-soft, #fbfcfa)",
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
          }}
        >
          <div style={{ padding: "18px 18px 10px" }}>
            <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: "var(--ink)" }}>
              Priority queue
            </h3>
            <p className="dim" style={{ fontSize: 12.5, margin: "2px 0 0" }}>
              {openCount} open · sorted by recency
            </p>
          </div>

          {/* Search */}
          <div style={{ padding: "0 14px 10px" }}>
            <div className="row" style={{ position: "relative" }}>
              <Icon
                name="search"
                size={14}
                style={{ position: "absolute", left: 10, color: "var(--ink-3, #98a2b3)" }}
              />
              <input
                type="search"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                placeholder="Search conversations"
                aria-label="Search conversations"
                style={{
                  width: "100%",
                  padding: "8px 10px 8px 30px",
                  fontSize: 13,
                  borderRadius: 8,
                  border: "1px solid var(--line)",
                  background: "#fff",
                }}
              />
            </div>
          </div>

          {/* Channel pills */}
          <div
            className="row"
            style={{ gap: 6, flexWrap: "wrap", padding: "0 14px 12px" }}
          >
            {CHANNEL_PILLS.map((p) => {
              const active = activeChannel === p.key;
              const count = p.key === "all" ? undefined : perChannel[p.key];
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setParam("channel", p.key)}
                  className={`chip${active ? " chip--ink" : " chip--out"}`}
                  style={{ cursor: "pointer", border: "none" }}
                >
                  {p.label}
                  {count ? (
                    <span className="mono" style={{ marginLeft: 5, opacity: 0.7 }}>
                      {count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            <ThreadList
              threads={initialThreads}
              selectedId={selectedThreadId}
              onSelect={selectThread}
            />
          </div>
        </aside>

        {/* ---------- CENTER: thread ---------- */}
        <section style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <ThreadView
            thread={selectedThread}
            messages={messages}
            status={threadStatus}
            teammates={teammates}
            aiEnabled={aiEnabled}
            onSent={onSent}
            onStatusChange={setThreadStatus}
          />
        </section>

        {/* ---------- RIGHT: customer context ---------- */}
        <aside
          style={{
            borderLeft: "1px solid var(--line)",
            padding: 18,
            overflowY: "auto",
          }}
        >
          <CustomerContext thread={selectedThread} messageCount={messages.length} />
        </aside>
      </div>
    </div>
  );
}
