"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Avatar } from "@/components/shell/avatar";
import { Icon } from "@/components/shell/icon";
import {
  bulkResolveModerationAction,
  resolveModerationItemAction,
} from "@/lib/moderation/blacklist-actions";
import {
  ModerationRuleForm,
  type KeywordRuleView,
  type ModerationConfigView,
} from "./moderation-rule-form";

/**
 * ModerationPanel (Module 09 — Inbox, Wave 3c-A) — client island.
 *
 * Two sub-tabs (?sub=queue|rules):
 *   - Queue: the `ModerationItem` queue (pending / approved / hidden) showing AI
 *     confidence + reason + source badge, with per-item Approve / Hide / Reply
 *     and bulk Approve / Hide of the selected pending items.
 *   - Rules: the keyword blacklist + auto-moderation toggles (<ModerationRuleForm/>).
 *
 * The empty state spells out that Google reviews can't be hidden via API — only
 * replied to — so the moderation surface never implies otherwise.
 */

export type QueueItemView = {
  id: string;
  source: string;
  sourceType: string;
  authorName: string | null;
  body: string;
  reason: string;
  matchedKeyword: string | null;
  aiConfidence: number | null;
  suggestedAction: string;
  status: string;
  createdAt: string;
};

export function ModerationPanel({
  sub = "queue",
  items,
  counts,
  status = "pending",
  keywords,
  config,
}: {
  sub?: string;
  items: QueueItemView[];
  counts: Record<string, number>;
  status?: string;
  keywords: KeywordRuleView[];
  config: ModerationConfigView;
}) {
  const activeSub = sub === "rules" ? "rules" : "queue";

  return (
    <div>
      {/* Sub-tabs */}
      <div className="tabs" style={{ marginBottom: 14 }}>
        <Link
          href="/support?tab=moderation&sub=queue"
          className={`tabs__t${activeSub === "queue" ? " is-active" : ""}`}
          style={{ textDecoration: "none" }}
        >
          Queue
          {(counts.pending ?? 0) > 0 && (
            <span className="chip chip--bad" style={{ marginLeft: 6, fontSize: 9.5 }}>
              {counts.pending}
            </span>
          )}
        </Link>
        <Link
          href="/support?tab=moderation&sub=rules"
          className={`tabs__t${activeSub === "rules" ? " is-active" : ""}`}
          style={{ textDecoration: "none" }}
        >
          Rules
        </Link>
      </div>

      {activeSub === "rules" ? (
        <ModerationRuleForm keywords={keywords} config={config} />
      ) : (
        <ModerationQueue items={items} counts={counts} status={status} />
      )}
    </div>
  );
}

const QUEUE_FILTERS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "hidden", label: "Hidden" },
  { key: "all", label: "All" },
] as const;

function ModerationQueue({
  items,
  counts,
  status,
}: {
  items: QueueItemView[];
  counts: Record<string, number>;
  status: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const pendingIds = useMemo(
    () => items.filter((i) => i.status === "pending").map((i) => i.id),
    [items],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === pendingIds.length ? new Set() : new Set(pendingIds)));
  }

  function resolveOne(itemId: string, action: "approve" | "hide" | "reply") {
    setError(null);
    const fd = new FormData();
    fd.set("itemId", itemId);
    fd.set("action", action);
    startTransition(async () => {
      try {
        await resolveModerationItemAction(fd);
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(itemId);
          return next;
        });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Action failed");
      }
    });
  }

  function bulk(action: "approve" | "hide") {
    if (selected.size === 0) return;
    setError(null);
    const fd = new FormData();
    fd.set("itemIds", Array.from(selected).join(","));
    fd.set("action", action);
    startTransition(async () => {
      try {
        await bulkResolveModerationAction(fd);
        setSelected(new Set());
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Bulk action failed");
      }
    });
  }

  return (
    <div>
      {/* Status filter chips */}
      <div className="row" style={{ marginBottom: 12, gap: 6, flexWrap: "wrap" }}>
        {QUEUE_FILTERS.map((f) => {
          const active = (status || "pending") === f.key;
          const count = counts[f.key] ?? 0;
          return (
            <Link
              key={f.key}
              href={`/support?tab=moderation&sub=queue&status=${f.key}`}
              className={`chip${active ? " chip--ink" : " chip--out"}`}
              style={{ textDecoration: "none" }}
            >
              {f.label}
              {count > 0 && (
                <span className="mono" style={{ marginLeft: 5, opacity: 0.7 }}>
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* Bulk bar */}
      {pendingIds.length > 0 && (
        <div
          className="row"
          style={{
            gap: 8,
            marginBottom: 12,
            padding: "8px 12px",
            border: "1px solid var(--line)",
            borderRadius: "var(--r-sm)",
            background: "var(--surface-2, #f8fafc)",
            flexWrap: "wrap",
          }}
        >
          <label className="row" style={{ gap: 6, cursor: "pointer", fontSize: 12 }}>
            <input
              type="checkbox"
              checked={selected.size > 0 && selected.size === pendingIds.length}
              onChange={toggleAll}
              style={{ width: 15, height: 15, accentColor: "var(--pri)" }}
            />
            {selected.size > 0 ? `${selected.size} selected` : "Select all pending"}
          </label>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="btn btn--out btn--sm"
            onClick={() => bulk("approve")}
            disabled={pending || selected.size === 0}
          >
            <Icon name="check" size={12} />
            Approve
          </button>
          <button
            type="button"
            className="btn btn--out btn--sm"
            onClick={() => bulk("hide")}
            disabled={pending || selected.size === 0}
          >
            <Icon name="eyeOff" size={12} />
            Hide
          </button>
        </div>
      )}

      {error && (
        <div className="chip chip--bad" role="alert" style={{ display: "inline-flex", marginBottom: 10 }}>
          {error}
        </div>
      )}

      {items.length === 0 ? (
        <EmptyQueue status={status} />
      ) : (
        <div className="ds-card" style={{ padding: 4 }}>
          {items.map((it, i) => (
            <QueueRow
              key={it.id}
              item={it}
              first={i === 0}
              checked={selected.has(it.id)}
              onToggle={() => toggle(it.id)}
              onResolve={resolveOne}
              busy={pending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function QueueRow({
  item,
  first,
  checked,
  onToggle,
  onResolve,
  busy,
}: {
  item: QueueItemView;
  first: boolean;
  checked: boolean;
  onToggle: () => void;
  onResolve: (id: string, action: "approve" | "hide" | "reply") => void;
  busy: boolean;
}) {
  const isPending = item.status === "pending";
  return (
    <div
      className="row"
      style={{
        padding: 12,
        gap: 10,
        alignItems: "flex-start",
        borderTop: first ? "none" : "1px solid var(--line)",
      }}
    >
      {isPending && (
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          style={{ marginTop: 8, width: 15, height: 15, accentColor: "var(--pri)" }}
          aria-label="Select item"
        />
      )}
      <Avatar name={item.authorName ?? "User"} size={30} tone={((item.id.charCodeAt(0) % 7) + 1) as 1} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row" style={{ gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12.5, fontWeight: 600 }}>{item.authorName ?? "Anonymous"}</span>
          <SourceBadge source={item.source} />
          <ReasonBadge reason={item.reason} matchedKeyword={item.matchedKeyword} />
          <ConfidenceBadge confidence={item.aiConfidence} />
          {!isPending && (
            <span className={`chip ${statusChip(item.status)}`} style={{ fontSize: 10 }}>
              {item.status}
            </span>
          )}
        </div>
        <p style={{ margin: 0, fontSize: 12, color: "var(--ink-2)", lineHeight: 1.5 }}>{item.body}</p>

        {isPending && (
          <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn--out btn--sm"
              onClick={() => onResolve(item.id, "approve")}
              disabled={busy}
              title="Mark safe and restore visibility"
            >
              <Icon name="check" size={12} />
              Approve
            </button>
            <button
              type="button"
              className="btn btn--out btn--sm"
              onClick={() => onResolve(item.id, "hide")}
              disabled={busy}
            >
              <Icon name="eyeOff" size={12} />
              Hide
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => onResolve(item.id, "reply")}
              disabled={busy}
              title="Mark handled — reply in the Comments tab"
            >
              <Icon name="reply" size={12} />
              Reply &amp; clear
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyQueue({ status }: { status: string }) {
  const isPending = (status || "pending") === "pending";
  return (
    <div className="ds-card">
      <div className="ds-card__body dim" style={{ textAlign: "center", padding: 44 }}>
        <Icon name="checkCircle" size={26} style={{ color: "var(--ok, #16a34a)" }} />
        <h3 style={{ fontSize: 15, fontWeight: 600, marginTop: 12, color: "var(--ink)" }}>
          {isPending ? "Nothing needs review" : `No ${status} items`}
        </h3>
        <p style={{ fontSize: 12.5, marginTop: 6, maxWidth: 420, marginInline: "auto", lineHeight: 1.55 }}>
          Flagged Facebook, Instagram and live-chat content shows up here with an AI confidence score
          for you to approve or hide.
        </p>
        <p
          style={{
            fontSize: 11.5,
            marginTop: 10,
            color: "var(--ink-2)",
            maxWidth: 440,
            marginInline: "auto",
            lineHeight: 1.5,
          }}
        >
          <Icon name="info" size={12} style={{ verticalAlign: -1, marginRight: 4 }} />
          Google reviews can&apos;t be hidden through the API — they can only be replied to, so they
          never appear in this queue.
        </p>
      </div>
    </div>
  );
}

function SourceBadge({ source }: { source: string }) {
  const map: Record<string, { icon: "fb" | "insta" | "chat"; label: string; cls: string }> = {
    facebook: { icon: "fb", label: "Facebook", cls: "chip--info" },
    instagram: { icon: "insta", label: "Instagram", cls: "chip--pri" },
    webchat: { icon: "chat", label: "Live chat", cls: "chip--out" },
  };
  const m = map[source] ?? { icon: "chat" as const, label: source, cls: "chip--out" };
  return (
    <span className={`chip ${m.cls}`} style={{ gap: 4, fontSize: 9.5 }}>
      <Icon name={m.icon} size={10} />
      {m.label}
    </span>
  );
}

function ReasonBadge({ reason, matchedKeyword }: { reason: string; matchedKeyword: string | null }) {
  const map: Record<string, { label: string; cls: string }> = {
    keyword: { label: "Keyword", cls: "chip--bad" },
    profanity: { label: "Profanity", cls: "chip--bad" },
    spam: { label: "Spam", cls: "chip--warn" },
    negativity: { label: "Negative", cls: "chip--info" },
  };
  const m = map[reason] ?? { label: reason, cls: "chip--out" };
  return (
    <span className={`chip ${m.cls}`} style={{ fontSize: 9.5 }} title={matchedKeyword ? `Matched “${matchedKeyword}”` : undefined}>
      {m.label}
      {matchedKeyword && <span className="mono" style={{ marginLeft: 4, opacity: 0.8 }}>{matchedKeyword}</span>}
    </span>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number | null }) {
  if (confidence == null) return null;
  const pct = Math.round(confidence * 100);
  const cls = pct >= 80 ? "chip--bad" : pct >= 50 ? "chip--warn" : "chip--out";
  return (
    <span className={`chip ${cls}`} style={{ fontSize: 9.5, gap: 3 }} title="AI confidence this content is harmful">
      <Icon name="sparkle" size={9} />
      {pct}%
    </span>
  );
}

function statusChip(status: string): string {
  switch (status) {
    case "approved":
      return "chip--ok";
    case "hidden":
      return "chip--warn";
    case "replied":
      return "chip--info";
    default:
      return "chip--out";
  }
}
