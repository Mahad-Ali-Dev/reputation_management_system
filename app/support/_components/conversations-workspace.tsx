"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/shell/icon";
import { ThreadList } from "./thread-list";
import { ThreadView } from "./thread-view";
import { CustomerContext } from "./customer-context";
import { ChannelGlyph } from "./channel-glyph";

/**
 * Conversations workspace (client) — the 4-column hub matching the delivered
 * "conversations / active state" kit artboard.
 *
 *   Rail  : 64px brand-channel filter strip (All + per-channel glyphs).
 *   Left  : conversation queue (search + filter chip + ThreadList).
 *   Center: the selected thread (ThreadView) — bubbles, AI suggested replies,
 *           composer.
 *   Right : CustomerContext (cover, profile, details, labels, recent, timeline).
 *
 * Owns:
 *   - URL-driven filters (`?channel=`, `?q=`, `?thread=`) via router.replace so
 *     the server re-fetches the list (RSC) — the queue stays server-rendered.
 *   - the polling hook that refreshes the ACTIVE thread's messages every few
 *     seconds (Page-Visibility-paused), reconciling optimistic sends.
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
  { key: "facebook_msg", label: "Facebook" },
  { key: "instagram_dm", label: "Instagram" },
  { key: "email", label: "Email" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "webchat", label: "Live Chat" },
  { key: "gbp_qa", label: "Google" },
  { key: "sms", label: "SMS" },
  { key: "phone", label: "Phone" },
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
  const [aiDraft, setAiDraft] = useState<string | null>(null);

  // Re-seed local state whenever the server hands us a different thread.
  useEffect(() => {
    setMessages(selectedMessages);
    setThreadStatus(selectedThread?.status ?? "open");
    setAiDraft(null);
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
  const lastRealSentAtRef = useRef<string | null>(null);
  lastRealSentAtRef.current = messages.filter((m) => !m.optimistic).at(-1)?.sentAt ?? null;

  useEffect(() => {
    if (!selectedThreadId) return;
    let cancelled = false;

    async function poll() {
      if (document.visibilityState !== "visible") return;
      try {
        const params = new URLSearchParams({ thread: selectedThreadId as string });
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
    <div className="uik-card" style={{ padding: 0 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "64px minmax(280px, 320px) minmax(0, 1fr) minmax(300px, 380px)",
          minHeight: 620,
        }}
      >
        {/* ---------- CHANNEL RAIL ---------- */}
        <nav className="uik-rail" aria-label="Filter by channel">
          {CHANNEL_PILLS.map((p) => {
            const active = activeChannel === p.key;
            if (p.key === "all") {
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setParam("channel", "all")}
                  className={`uik-rail__all${active ? " is-active" : ""}`}
                  aria-pressed={active}
                  aria-label="All channels"
                  title="All channels"
                >
                  All
                </button>
              );
            }
            const count = perChannel[p.key];
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setParam("channel", p.key)}
                className={`uik-rail__btn${active ? " is-active" : ""}`}
                aria-pressed={active}
                aria-label={`${p.label}${count ? ` (${count})` : ""}`}
                title={p.label}
              >
                <ChannelGlyph channel={p.key} size={20} />
              </button>
            );
          })}
        </nav>

        {/* ---------- LEFT: queue ---------- */}
        <aside
          style={{
            borderRight: "1px solid var(--uik-line)",
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
          }}
        >
          <div style={{ padding: "16px 16px 10px" }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span className="uik-chip is-active" style={{ cursor: "default" }}>
                All conversations
                <span className="uik-chip__count">{openCount}</span>
              </span>
              <button type="button" className="uik-quick" style={{ width: 36, height: 36 }} aria-label="Filter" title="Filter">
                <Icon name="sliders" size={15} />
              </button>
            </div>

            {/* Search */}
            <div style={{ position: "relative", marginTop: 10 }}>
              <Icon
                name="search"
                size={14}
                style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--uik-faint)" }}
              />
              <input
                type="search"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                placeholder="Search conversations"
                aria-label="Search conversations"
                className="uik-input"
                style={{ paddingLeft: 32 }}
              />
            </div>
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
            aiDraft={aiDraft}
            onSent={onSent}
            onStatusChange={setThreadStatus}
            onUseAi={setAiDraft}
          />
        </section>

        {/* ---------- RIGHT: customer context ---------- */}
        <aside style={{ borderLeft: "1px solid var(--uik-line)", overflowY: "auto", minWidth: 0 }}>
          <CustomerContext thread={selectedThread} messageCount={messages.length} />
        </aside>
      </div>
    </div>
  );
}
