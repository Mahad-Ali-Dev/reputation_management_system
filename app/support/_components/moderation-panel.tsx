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
import "../support-ops.css";

/**
 * ModerationPanel (Module 09 — Inbox) — client island, rebuilt to the delivered
 * "Moderation" design kit (queue + rules + empty states).
 *
 * Two sub-tabs (?sub=queue|rules):
 *   - Queue: a dark queue-summary band (live counts) + status-filter toolbar + a
 *     dense queue table (accent bar, author/excerpt, rule, platform, AI
 *     confidence, age) with per-item Approve / Hide / Reply and bulk Approve /
 *     Hide of the selected pending items.
 *   - Rules: the keyword blacklist + auto-moderation toggles (<ModerationRuleForm/>),
 *     laid out as the kit's rule-builder workspace.
 *
 * LIVE DATA ONLY: everything binds to the real moderation queue/counts/rules
 * already loaded by the shell. The queue's data model has no per-item priority /
 * assignee / escalation FK, so those summary metrics show "—" rather than invent
 * numbers; the metrics we CAN derive (needs-review = pending, total in queue) are
 * real counts.
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
    <div className="sops">
      {/* Moderation view selector (Queue / Rules) */}
      <div className="sops-subtabs">
        <Link
          href="/support?tab=moderation&sub=queue"
          className={`sops-subtab${activeSub === "queue" ? " is-active" : ""}`}
          aria-current={activeSub === "queue" ? "page" : undefined}
        >
          <span className="sops-subtab__ico">
            <Icon name="grid" size={18} />
          </span>
          <span>
            <span className="sops-subtab__t">Queue</span>
            <span className="sops-subtab__d">Review items in real-time</span>
          </span>
          {(counts.pending ?? 0) > 0 && (
            <span className="sops-chip sops-chip--danger" style={{ marginLeft: "auto" }}>
              {counts.pending}
            </span>
          )}
        </Link>
        <Link
          href="/support?tab=moderation&sub=rules"
          className={`sops-subtab${activeSub === "rules" ? " is-active" : ""}`}
          aria-current={activeSub === "rules" ? "page" : undefined}
        >
          <span className="sops-subtab__ico">
            <Icon name="flag" size={18} />
          </span>
          <span>
            <span className="sops-subtab__t">Rules</span>
            <span className="sops-subtab__d">Create &amp; manage moderation rules</span>
          </span>
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
  { key: "pending", label: "Pending", dot: "var(--sops-danger)" },
  { key: "approved", label: "Approved", dot: "var(--sops-ok)" },
  { key: "hidden", label: "Hidden", dot: "var(--sops-warn)" },
  { key: "all", label: "All", dot: "var(--sops-info)" },
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

  // Live summary metrics. needsReview = pending; total = all queue rows. The
  // queue model carries no per-item priority / assignee / escalation FK, so those
  // three metrics show "—" rather than invent numbers (per data-only rule).
  const totalInQueue = counts.all ?? counts.pending ?? items.length;
  const needsReview = counts.pending ?? 0;

  return (
    <div>
      {/* Queue summary band */}
      <div className="sops-qsummary">
        <div className="sops-qsummary__intro">
          <h3>Queue</h3>
          <p>Review flagged social &amp; chat content that needs your attention and take action.</p>
          <div className="sops-qsummary__art">
            <Icon name="archive" size={26} style={{ color: "rgba(255,255,255,0.85)" }} />
            <span className="sops-qsummary__art-badge">{totalInQueue}</span>
          </div>
        </div>
        <MetricCard
          asset="mod-metric-needs-review.svg"
          value={needsReview}
          label="Needs Review"
          desc="Require attention"
          bar="var(--sops-danger)"
        />
        <MetricCard
          asset="mod-metric-high-priority.svg"
          value="—"
          label="High Priority"
          desc="High impact items"
          bar="var(--sops-warn)"
        />
        <MetricCard
          asset="mod-metric-assigned.svg"
          value="—"
          label="Assigned to Me"
          desc="Awaiting your action"
          bar="var(--sops-pri)"
        />
        <MetricCard
          asset="mod-metric-escalated.svg"
          value="—"
          label="Escalated"
          desc="Escalated by team"
          bar="var(--sops-ok)"
        />
        <MetricCard
          asset="mod-metric-total.svg"
          value={totalInQueue}
          label="Total in Queue"
          desc="Across all platforms"
          bar="var(--sops-info)"
        />
      </div>

      {/* Toolbar: status filter chips */}
      <div className="sops-toolbar" role="group" aria-label="Queue status">
        {QUEUE_FILTERS.map((f) => {
          const active = (status || "pending") === f.key;
          const count = counts[f.key] ?? 0;
          return (
            <Link
              key={f.key}
              href={`/support?tab=moderation&sub=queue&status=${f.key}`}
              className={`sops-fchip${active ? " is-active" : ""}`}
              aria-pressed={active}
            >
              {!active && <span className="sops-fchip__dot" style={{ background: f.dot }} />}
              {f.label}
              {count > 0 && <span className="sops-fchip__count">{count}</span>}
            </Link>
          );
        })}
      </div>

      {/* Bulk bar */}
      {pendingIds.length > 0 && (
        <div className="sops-bulkbar">
          <label className="sops" style={{ display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer" }}>
            <input
              type="checkbox"
              className="sops-checkbox"
              checked={selected.size > 0 && selected.size === pendingIds.length}
              onChange={toggleAll}
            />
            {selected.size > 0 ? `${selected.size} selected` : "Select all pending"}
          </label>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="sops-btn sops-btn--sm sops-btn--outpri"
            onClick={() => bulk("approve")}
            disabled={pending || selected.size === 0}
          >
            <Icon name="check" size={13} />
            Approve
          </button>
          <button
            type="button"
            className="sops-btn sops-btn--sm"
            onClick={() => bulk("hide")}
            disabled={pending || selected.size === 0}
          >
            <Icon name="eyeOff" size={13} />
            Hide
          </button>
        </div>
      )}

      {error && (
        <div className="sops-error" role="alert" style={{ marginBottom: 10 }}>
          <Icon name="alert" size={13} />
          {error}
        </div>
      )}

      {items.length === 0 ? (
        <EmptyQueue status={status} />
      ) : (
        <div className="sops-qtable">
          <div className="sops-qrow__head" aria-hidden="true">
            <span />
            <span>Item</span>
            <span className="sops-qcell-rule">Rule Matched</span>
            <span className="sops-qcell-plat">Platform</span>
            <span className="sops-qcell-conf">Confidence</span>
            <span className="sops-qcell-time">Time</span>
            <span style={{ textAlign: "right" }}>Actions</span>
          </div>
          {items.map((it) => (
            <QueueRow
              key={it.id}
              item={it}
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

function MetricCard({
  asset,
  value,
  label,
  desc,
  bar,
}: {
  asset: string;
  value: number | string;
  label: string;
  desc: string;
  bar: string;
}) {
  return (
    <div className="sops-mcard">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="sops-mcard__ico"
        src={`/assets/repulabs/unified-inbox/${asset}`}
        alt=""
        aria-hidden="true"
        style={{ mixBlendMode: "normal" }}
      />
      <div className="sops-mcard__val">{value}</div>
      <div>
        <div className="sops-mcard__lab">{label}</div>
        <div className="sops-mcard__desc">{desc}</div>
      </div>
      <div className="sops-mcard__bar" style={{ background: bar }} />
    </div>
  );
}

function QueueRow({
  item,
  checked,
  onToggle,
  onResolve,
  busy,
}: {
  item: QueueItemView;
  checked: boolean;
  onToggle: () => void;
  onResolve: (id: string, action: "approve" | "hide" | "reply") => void;
  busy: boolean;
}) {
  const isPending = item.status === "pending";
  const accent = reasonAccent(item.reason);
  return (
    <div className="sops-qrow">
      <span className="sops-qrow__accent" style={{ background: accent }} />
      <div>
        {isPending ? (
          <input
            type="checkbox"
            className="sops-checkbox"
            checked={checked}
            onChange={onToggle}
            aria-label={`Select item from ${item.authorName ?? "Anonymous"}`}
          />
        ) : null}
      </div>

      {/* Item */}
      <div className="sops-qcell-main">
        <Avatar name={item.authorName ?? "User"} size={30} tone={((item.id.charCodeAt(0) % 7) + 1) as 1} />
        <div className="sops-qcell-main__body">
          <div className="sops-qcell-main__author">
            <b>{item.authorName ?? "Anonymous"}</b>
            <span className="sops-qcell-main__age">{relAge(item.createdAt)}</span>
            {!isPending && (
              <span className={`sops-chip ${statusChip(item.status)}`}>{item.status}</span>
            )}
          </div>
          <p className="sops-qcell-main__excerpt" title={item.body}>
            {item.body}
          </p>
          <p className="sops-qcell-main__meta">
            {sourceLabel(item.source)}
            {item.sourceType ? ` · ${item.sourceType}` : ""}
          </p>
        </div>
      </div>

      {/* Rule matched */}
      <div className="sops-pill-stack sops-qcell-rule">
        <span className={`sops-chip ${reasonChip(item.reason)}`} style={{ maxWidth: "100%" }}>
          {reasonLabel(item.reason)}
        </span>
        {item.matchedKeyword ? (
          <span className="sops-pill-stack__sub" title={`Matched “${item.matchedKeyword}”`}>
            Rule: {item.matchedKeyword}
          </span>
        ) : (
          <span className="sops-pill-stack__sub">Rule: {reasonLabel(item.reason)}</span>
        )}
      </div>

      {/* Platform */}
      <div className="sops-platcell sops-qcell-plat">
        <Icon name={platformIcon(item.source)} size={18} />
        <div style={{ minWidth: 0 }}>
          <div className="sops-platcell__name">{sourceLabel(item.source)}</div>
          <div className="sops-platcell__type">{item.sourceType || "—"}</div>
        </div>
      </div>

      {/* Confidence */}
      <div className="sops-conf sops-qcell-conf">
        {item.aiConfidence == null ? (
          <span className="sops-conf__v">—</span>
        ) : (
          <>
            <span className="sops-conf__v">{Math.round(item.aiConfidence * 100)}%</span>
            <span className="sops-conf__track">
              <span
                className="sops-conf__fill"
                style={{ width: `${Math.round(item.aiConfidence * 100)}%`, background: accent }}
              />
            </span>
          </>
        )}
      </div>

      {/* Time */}
      <div className="sops-qcell-time">
        <span className="sops-time">{relAge(item.createdAt)}</span>
      </div>

      {/* Actions */}
      <div className="sops-qactions">
        {isPending ? (
          <>
            <button
              type="button"
              className="sops-btn sops-btn--sm sops-btn--outpri"
              onClick={() => onResolve(item.id, "approve")}
              disabled={busy}
              title="Mark safe and restore visibility"
            >
              <Icon name="check" size={13} />
              Approve
            </button>
            <button
              type="button"
              className="sops-btn sops-btn--icon"
              onClick={() => onResolve(item.id, "hide")}
              disabled={busy}
              aria-label={`Hide item from ${item.authorName ?? "Anonymous"}`}
              title="Hide"
            >
              <Icon name="eyeOff" size={14} />
            </button>
            <button
              type="button"
              className="sops-btn sops-btn--icon"
              onClick={() => onResolve(item.id, "reply")}
              disabled={busy}
              aria-label={`Mark replied for ${item.authorName ?? "Anonymous"}`}
              title="Mark handled reply in the Comments tab"
            >
              <Icon name="reply" size={14} />
            </button>
          </>
        ) : (
          <span className="sops-time">—</span>
        )}
      </div>
    </div>
  );
}

function EmptyQueue({ status }: { status: string }) {
  const isPending = (status || "pending") === "pending";
  return (
    <>
      <div className="sops-empty">
        <div className="sops-empty__art">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/repulabs/unified-inbox/mod-empty-flow.svg" alt="" aria-hidden="true" />
        </div>
        <div>
          <h2 className="sops-empty__h">
            {isPending ? "Nothing needs review" : `No ${status} items`}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/repulabs/unified-inbox/mod-sparkles.svg" alt="" aria-hidden="true" />
          </h2>
          <p className="sops-empty__p">
            Flagged Facebook, Instagram, and live-chat content appears here with AI confidence support
            for approval or hiding.
          </p>
          <div className="sops-empty__notice">
            <Icon name="google" size={16} />
            <span>
              Google reviews can&apos;t be hidden through the API they can only be replied to, so
              they never appear in this queue.
            </span>
          </div>
          <div className="sops-empty__actions">
            <Link href="/support?tab=moderation&sub=rules" className="sops-btn sops-btn--pri">
              <Icon name="flag" size={15} />
              Set moderation rules
            </Link>
            <Link href="/support?tab=comments" className="sops-btn">
              <Icon name="book" size={15} />
              Go to comments
            </Link>
          </div>
        </div>
      </div>
      <div className="sops-helper">
        <Icon name="flag" size={15} style={{ color: "var(--sops-muted)" }} />
        Manage what gets flagged and how AI helps you decide.
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function sourceLabel(source: string): string {
  const map: Record<string, string> = {
    facebook: "Facebook",
    instagram: "Instagram",
    webchat: "Live chat",
  };
  return map[source] ?? source;
}

function platformIcon(source: string): "fb" | "insta" | "chat" {
  if (source === "facebook") return "fb";
  if (source === "instagram") return "insta";
  return "chat";
}

function reasonLabel(reason: string): string {
  const map: Record<string, string> = {
    keyword: "Keyword Match",
    profanity: "Profanity",
    spam: "Spam Filter",
    negativity: "Negative Sentiment",
  };
  return map[reason] ?? reason;
}

function reasonChip(reason: string): string {
  switch (reason) {
    case "keyword":
    case "profanity":
      return "sops-chip--danger";
    case "spam":
      return "sops-chip--warn";
    case "negativity":
      return "sops-chip--info";
    default:
      return "sops-chip--out";
  }
}

function reasonAccent(reason: string): string {
  switch (reason) {
    case "keyword":
    case "profanity":
      return "var(--sops-danger)";
    case "spam":
      return "var(--sops-warn)";
    case "negativity":
      return "var(--sops-info)";
    default:
      return "var(--sops-pri)";
  }
}

function statusChip(status: string): string {
  switch (status) {
    case "approved":
      return "sops-chip--ok";
    case "hidden":
      return "sops-chip--warn";
    case "replied":
      return "sops-chip--info";
    default:
      return "sops-chip--out";
  }
}

/** Compact relative age (e.g. "2m ago", "3h ago", "5d ago"). */
function relAge(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const s = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}
