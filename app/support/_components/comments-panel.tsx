"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { EmptyIllustration } from "@/components/empty-state";
import { Avatar } from "@/components/shell/avatar";
import { Icon } from "@/components/shell/icon";
import {
  deleteComment,
  favoriteComment,
  flagComment,
  hideComment,
  replyToComment,
  suggestCommentReply,
  unhideComment,
} from "@/lib/inbox/comments-actions";

/**
 * CommentsPanel (Module 09 — Inbox, Wave 3c-A) — client island.
 *
 * Lists SOCIAL comments (Facebook / Instagram) with reply / hide / unhide / flag
 * / favorite / delete actions. Google Q&A rows are shown but rendered REPLY-ONLY:
 * the Hide control is never offered for them and the panel labels them so no one
 * could think a Google review/comment is hideable.
 *
 * Receives already-serialized rows + counts from the server panel (RSC-safe:
 * this island owns all interactivity; the page does the DB read).
 */

export type CommentRowView = {
  id: string;
  platform: string;
  isHideable: boolean;
  isSocial: boolean;
  authorName: string | null;
  authorAvatarUrl: string | null;
  body: string;
  status: string;
  aiSuggested: string | null;
  externalPostId: string | null;
  postedAt: string; // ISO
};

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "needs_reply", label: "Needs reply" },
  { key: "replied", label: "Replied" },
  { key: "hidden", label: "Hidden" },
  { key: "starred", label: "Starred" },
] as const;

export function CommentsPanel({
  rows,
  counts,
  activeStatus = "all",
  connected = true,
}: {
  rows: CommentRowView[];
  counts: Record<string, number>;
  activeStatus?: string;
  connected?: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(rows[0]?.id ?? null);
  const selected = rows.find((r) => r.id === selectedId) ?? null;

  return (
    <div>
      {/* Social-vs-review clarifier banner — always visible so the distinction is unmistakable. */}
      <div
        className="row"
        style={{
          gap: 8,
          marginBottom: 12,
          padding: "8px 12px",
          borderRadius: "var(--r-sm)",
          background: "var(--info-bg, #eff6ff)",
          color: "var(--ink-2)",
          fontSize: 12,
          alignItems: "flex-start",
        }}
      >
        <Icon name="info" size={14} style={{ marginTop: 1, flexShrink: 0 }} />
        <span>
          These are <strong>social comments</strong> on your Facebook &amp; Instagram posts — you can
          reply to or hide them. Google reviews are <strong>reply-only</strong> and can never be
          hidden.
        </span>
      </div>

      {/* Filter chips */}
      <div className="row" style={{ marginBottom: 14, gap: 6, flexWrap: "wrap" }}>
        {STATUS_FILTERS.map((f) => {
          const active = activeStatus === f.key;
          const count = counts[f.key] ?? 0;
          return (
            <Link
              key={f.key}
              href={f.key === "all" ? "/support?tab=comments" : `/support?tab=comments&status=${f.key}`}
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

      {rows.length === 0 ? (
        <EmptyComments connected={connected} activeStatus={activeStatus} />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1fr)",
            gap: 14,
            alignItems: "start",
          }}
        >
          {/* List */}
          <div className="ds-card" style={{ padding: 4 }}>
            {rows.map((c, i) => (
              <CommentRowItem
                key={c.id}
                row={c}
                first={i === 0}
                active={c.id === selectedId}
                onSelect={() => setSelectedId(c.id)}
              />
            ))}
          </div>

          {/* Context + reply */}
          <div style={{ position: "sticky", top: 12 }}>
            {selected ? (
              <CommentDetail row={selected} />
            ) : (
              <div className="ds-card">
                <div className="ds-card__body dim" style={{ padding: 32, textAlign: "center" }}>
                  Select a comment to reply.
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CommentRowItem({
  row,
  first,
  active,
  onSelect,
}: {
  row: CommentRowView;
  first: boolean;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="row"
      style={{
        width: "100%",
        textAlign: "left",
        padding: 12,
        gap: 10,
        alignItems: "flex-start",
        border: "none",
        borderTop: first ? "none" : "1px solid var(--line)",
        background: active ? "var(--hover, #f8fafc)" : "transparent",
        cursor: "pointer",
        borderRadius: active ? "var(--r-sm)" : 0,
      }}
    >
      <Avatar name={row.authorName ?? "User"} size={30} tone={((row.id.charCodeAt(0) % 7) + 1) as 1} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row" style={{ gap: 6, marginBottom: 3 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600 }}>{row.authorName ?? "Anonymous"}</span>
          <PlatformBadge platform={row.platform} />
          <span
            className={`chip ${statusChip(row.status)}`}
            style={{ marginLeft: "auto", fontSize: 10 }}
          >
            {row.status.replace("_", " ")}
          </span>
        </div>
        <p
          style={{
            margin: 0,
            fontSize: 12,
            color: "var(--ink-2)",
            lineHeight: 1.5,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {row.body}
        </p>
      </div>
    </button>
  );
}

function CommentDetail({ row }: { row: CommentRowView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState(row.aiSuggested ?? "");
  const [error, setError] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);

  function run(action: (fd: FormData) => Promise<void>, extra?: Record<string, string>) {
    setError(null);
    const fd = new FormData();
    fd.set("id", row.id);
    if (extra) for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    startTransition(async () => {
      try {
        await action(fd);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Action failed");
      }
    });
  }

  function sendReply() {
    if (!draft.trim()) {
      setError("Write a reply first.");
      return;
    }
    run(replyToComment, { body: draft.trim() });
  }

  async function aiSuggest() {
    setError(null);
    setSuggesting(true);
    try {
      const { text } = await suggestCommentReply(row.id);
      if (text) setDraft(text);
      else setError("AI Suggest is unavailable right now.");
    } catch {
      setError("AI Suggest failed.");
    } finally {
      setSuggesting(false);
    }
  }

  return (
    <div className="ds-card">
      <div className="ds-card__head">
        <h3 className="ds-card__title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <PlatformBadge platform={row.platform} />
          {row.isSocial ? "Social comment" : "Google Q&A"}
        </h3>
        <span className="dim mono" style={{ fontSize: 10 }}>
          {relativeTime(row.postedAt)}
        </span>
      </div>
      <div className="ds-card__body" style={{ display: "grid", gap: 12 }}>
        {/* Original comment context */}
        <div
          style={{
            padding: 12,
            borderRadius: "var(--r-sm)",
            background: "var(--surface-2, #f8fafc)",
            border: "1px solid var(--line)",
          }}
        >
          <div className="row" style={{ gap: 8, marginBottom: 6 }}>
            <Avatar name={row.authorName ?? "User"} size={26} />
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>{row.authorName ?? "Anonymous"}</span>
          </div>
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink)", lineHeight: 1.55 }}>{row.body}</p>
        </div>

        {!row.isSocial && (
          <div
            className="row"
            style={{ gap: 6, fontSize: 11.5, color: "var(--ink-2)", alignItems: "flex-start" }}
          >
            <Icon name="info" size={13} style={{ marginTop: 1 }} />
            <span>Google content is reply-only. It can&apos;t be hidden — reply publicly below.</span>
          </div>
        )}

        {/* Reply composer */}
        <div>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ink-2)" }}>
              Public reply
            </label>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={aiSuggest}
              disabled={suggesting || pending}
              style={{ gap: 5 }}
            >
              <Icon name="sparkle" size={12} />
              {suggesting ? "Thinking…" : "AI Suggest"}
            </button>
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder="Write a reply…"
            className="ds-input"
            style={{ width: "100%", resize: "vertical", fontSize: 12.5, lineHeight: 1.5 }}
          />
        </div>

        {error && (
          <div className="chip chip--bad" role="alert" style={{ display: "inline-flex" }}>
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn btn--pri btn--sm" onClick={sendReply} disabled={pending}>
            <Icon name="reply" size={12} />
            Reply
          </button>

          {/* Hide / Unhide — FB/IG ONLY. Never rendered for Google. */}
          {row.isHideable &&
            (row.status === "hidden" ? (
              <button
                type="button"
                className="btn btn--out btn--sm"
                onClick={() => run(unhideComment)}
                disabled={pending}
              >
                <Icon name="eye" size={12} />
                Unhide
              </button>
            ) : (
              <button
                type="button"
                className="btn btn--out btn--sm"
                onClick={() => run(hideComment)}
                disabled={pending}
                title="Hide this comment from your Facebook/Instagram post"
              >
                <Icon name="eyeOff" size={12} />
                Hide
              </button>
            ))}

          <button
            type="button"
            className="btn btn--out btn--sm"
            onClick={() => run(favoriteComment)}
            disabled={pending}
          >
            <Icon name="star" size={12} />
            {row.status === "starred" ? "Unstar" : "Star"}
          </button>

          {row.isSocial && (
            <button
              type="button"
              className="btn btn--out btn--sm"
              onClick={() => run(flagComment)}
              disabled={pending}
              title="Send to the Moderation queue for review"
            >
              <Icon name="flag" size={12} />
              Flag
            </button>
          )}

          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => {
              if (window.confirm("Remove this comment from your inbox queue? (It stays on the platform.)")) {
                run(deleteComment);
              }
            }}
            disabled={pending}
            style={{ marginLeft: "auto", color: "var(--bad, #dc2626)" }}
          >
            <Icon name="trash" size={12} />
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyComments({ connected, activeStatus }: { connected: boolean; activeStatus: string }) {
  return (
    <div className="ds-card">
      <div className="ds-card__body dim" style={{ textAlign: "center", padding: 48 }}>
        <EmptyIllustration name="social-empty" />
        <h3 style={{ fontSize: 15, fontWeight: 600, marginTop: 12, color: "var(--ink)" }}>
          {connected
            ? activeStatus === "all"
              ? "No social comments yet"
              : `No ${activeStatus.replace("_", " ")} comments`
            : "Connect your social pages"}
        </h3>
        <p style={{ fontSize: 13, marginTop: 6 }}>
          {connected
            ? "Comments on your Facebook and Instagram posts will appear here."
            : "Connect Facebook and Instagram to sync and reply to comments in one place."}
        </p>
        <Link href="/connections" className="btn btn--pri" style={{ marginTop: 14 }}>
          <Icon name="plug" size={12} />
          {connected ? "Manage connections" : "Connect social pages"}
        </Link>
      </div>
    </div>
  );
}

function PlatformBadge({ platform }: { platform: string }) {
  const map: Record<string, { icon: "fb" | "insta" | "google"; label: string; cls: string }> = {
    facebook: { icon: "fb", label: "Facebook", cls: "chip--info" },
    instagram: { icon: "insta", label: "Instagram", cls: "chip--pri" },
    google_qa: { icon: "google", label: "Google", cls: "chip--warn" },
  };
  const m = map[platform] ?? { icon: "chat" as never, label: platform, cls: "chip--out" };
  return (
    <span className={`chip ${m.cls}`} style={{ gap: 4, fontSize: 10 }}>
      <Icon name={m.icon} size={11} />
      {m.label}
    </span>
  );
}

function statusChip(status: string): string {
  switch (status) {
    case "needs_reply":
      return "chip--bad";
    case "replied":
      return "chip--ok";
    case "hidden":
      return "chip--warn";
    case "starred":
      return "chip--pri";
    case "live":
      return "chip--info";
    default:
      return "chip--out";
  }
}

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}
