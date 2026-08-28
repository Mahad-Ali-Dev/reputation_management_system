"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { EmptyIllustration } from "@/components/empty-state";
import { Avatar } from "@/components/shell/avatar";
import { Icon } from "@/components/shell/icon";
import { ChannelGlyph } from "./channel-glyph";
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
 * CommentsPanel (Unified Inbox — Comments tab) — client island, rebuilt to the
 * delivered "comments / active state" + "empty state" kit.
 *
 * Lists SOCIAL comments (Facebook / Instagram) in a 3-column workspace: the
 * comment list (status + channel filters), the selected comment workflow
 * (reply / hide / star / flag + AI suggested replies + reply & internal-note
 * composers), and a post-preview / context column. Google Q&A rows are rendered
 * REPLY-ONLY (no Hide). Empty state shows the kit illustration + benefits card.
 *
 * Receives already-serialized rows + counts from the server panel (RSC-safe).
 */

export type CommentRowView = {
  id: string;
  platform: string;
  isHideable: boolean;
  isSocial: boolean;
  isAd: boolean;
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

const SOURCE_FILTERS = [
  { key: "all", label: "All sources" },
  { key: "organic", label: "Organic" },
  { key: "ad", label: "Ads" },
] as const;

function commentsHref(status: string, source: string): string {
  const params = new URLSearchParams({ tab: "comments" });
  if (status && status !== "all") params.set("status", status);
  if (source && source !== "all") params.set("source", source);
  return `/support?${params.toString()}`;
}

export function CommentsPanel({
  rows,
  counts,
  activeStatus = "all",
  activeSource = "all",
  connected = true,
}: {
  rows: CommentRowView[];
  counts: Record<string, number>;
  activeStatus?: string;
  activeSource?: string;
  connected?: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(rows[0]?.id ?? null);
  const selected = rows.find((r) => r.id === selectedId) ?? null;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="uik-card">
      {/* Info banner */}
      <div
        style={{
          margin: 13,
          padding: "10px 16px",
          borderRadius: "var(--uik-r-pill)",
          background: "#f3f7ff",
          border: "1px solid #e7eef9",
          display: "flex",
          gap: 10,
          alignItems: "center",
        }}
      >
        <span
          aria-hidden
          style={{ width: 18, height: 18, borderRadius: "50%", background: "var(--uik-pri)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
        >
          <Icon name="info" size={12} />
        </span>
        <span style={{ fontSize: 12, color: "#253550", lineHeight: 1.4 }}>
          These are <strong>social comments</strong> on your Facebook &amp; Instagram posts you can
          reply to or hide them. Google reviews are <strong>reply-only</strong> and can never be hidden.
        </span>
        <div className="row" style={{ gap: 6, marginLeft: "auto", flexShrink: 0 }}>
          {SOURCE_FILTERS.map((f) => {
            const active = activeSource === f.key;
            return (
              <Link
                key={f.key}
                href={commentsHref(activeStatus, f.key)}
                className={`uik-chip${active ? " uik-chip--pri is-active" : ""}`}
                style={{ height: 26, background: active ? undefined : "#fff" }}
              >
                {f.key === "ad" && <Icon name="bolt" size={11} />}
                {f.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Status chips */}
      <div className="row" style={{ gap: 8, flexWrap: "wrap", padding: "0 18px 14px" }}>
        {STATUS_FILTERS.map((f) => {
          const active = activeStatus === f.key;
          const count = f.key === "all" ? total : (counts[f.key] ?? 0);
          return (
            <Link
              key={f.key}
              href={commentsHref(f.key, activeSource)}
              className={`uik-chip${active ? " is-active" : ""}`}
              style={{ height: 24 }}
            >
              {f.label}
              {count > 0 && <span className="uik-chip__count">{count}</span>}
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <EmptyComments connected={connected} activeStatus={activeStatus} activeSource={activeSource} />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(360px, 428px) minmax(0, 1fr) minmax(300px, 348px)",
            borderTop: "1px solid var(--uik-divider)",
            minHeight: 520,
          }}
        >
          {/* Comment list */}
          <div style={{ borderRight: "1px solid var(--uik-divider)", overflowY: "auto", padding: "8px 8px" }}>
            {rows.map((c) => (
              <CommentRowItem key={c.id} row={c} active={c.id === selectedId} onSelect={() => setSelectedId(c.id)} />
            ))}
          </div>

          {/* Selected comment workflow */}
          <div style={{ borderRight: "1px solid var(--uik-divider)", overflowY: "auto", padding: "14px 16px" }}>
            {selected ? (
              <CommentDetail row={selected} />
            ) : (
              <p className="uik-mut" style={{ fontSize: 13, textAlign: "center", padding: 40 }}>
                Select a comment to reply.
              </p>
            )}
          </div>

          {/* Post preview / context */}
          <div style={{ overflowY: "auto", padding: 12 }}>
            {selected ? <PostPreview row={selected} /> : null}
          </div>
        </div>
      )}
    </div>
  );
}

function CommentRowItem({ row, active, onSelect }: { row: CommentRowView; active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        width: "100%",
        textAlign: "left",
        display: "grid",
        gridTemplateColumns: "40px minmax(0, 1fr)",
        gap: 10,
        alignItems: "start",
        padding: 12,
        marginTop: 4,
        cursor: "pointer",
        border: active ? "1.5px solid var(--uik-purple)" : "1px solid transparent",
        background: active ? "#fbfbff" : "transparent",
        borderRadius: "var(--uik-r-lg)",
      }}
    >
      <span className="uik-av">
        <Avatar name={row.authorName ?? "User"} size={40} tone={((row.id.charCodeAt(0) % 7) + 1) as 1} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div className="row" style={{ gap: 6, marginBottom: 3, alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--uik-ink)" }}>{row.authorName ?? "Anonymous"}</span>
          <ChannelGlyph channel={platformToChannel(row.platform)} size={13} />
          <span className={`uik-pill ${statusPill(row.status)}`} style={{ marginLeft: "auto" }}>
            {statusLabel(row.status)}
          </span>
        </div>
        <p
          style={{
            margin: 0,
            fontSize: 12,
            color: "var(--uik-ink-2)",
            lineHeight: 1.5,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {row.body}
        </p>
        <span className="uik-mut" style={{ fontSize: 10.5, marginTop: 3, display: "block" }}>{relativeTime(row.postedAt)}</span>
      </div>
    </button>
  );
}

function CommentDetail({ row }: { row: CommentRowView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState(row.aiSuggested ?? "");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<{ tone: string; text: string }[]>([]);
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
      if (text) {
        // Present one suggestion as the kit's "Use reply" card; primary one fills draft.
        setSuggestions([{ tone: "Suggested", text }]);
      } else {
        setError("AI Suggest is unavailable right now.");
      }
    } catch {
      setError("AI Suggest failed.");
    } finally {
      setSuggesting(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* Selected comment card */}
      <div>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--uik-mut)", textTransform: "uppercase", letterSpacing: 0.4 }}>
            Selected comment
          </span>
          <span className={`uik-pill ${statusPill(row.status)}`}>{statusLabel(row.status)}</span>
        </div>
        <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
          <Avatar name={row.authorName ?? "User"} size={44} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="row" style={{ gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>{row.authorName ?? "Anonymous"}</span>
              <ChannelGlyph channel={platformToChannel(row.platform)} size={14} />
              <span className="uik-mut" style={{ fontSize: 11, marginLeft: "auto" }}>{relativeTime(row.postedAt)}</span>
            </div>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--uik-ink)", lineHeight: 1.55 }}>{row.body}</p>
          </div>
        </div>

        {/* Action row */}
        <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <button type="button" className="uik-btn uik-btn--sm uik-btn--pri" onClick={sendReply} disabled={pending}>
            <Icon name="reply" size={12} />
            Reply
          </button>
          {row.isHideable &&
            (row.status === "hidden" ? (
              <button type="button" className="uik-btn uik-btn--sm" onClick={() => run(unhideComment)} disabled={pending}>
                <Icon name="eye" size={12} />
                Unhide
              </button>
            ) : (
              <button type="button" className="uik-btn uik-btn--sm" onClick={() => run(hideComment)} disabled={pending} title="Hide from your post">
                <Icon name="eyeOff" size={12} />
                Hide
              </button>
            ))}
          <button type="button" className="uik-btn uik-btn--sm" onClick={() => run(favoriteComment)} disabled={pending}>
            <Icon name="star" size={12} />
            {row.status === "starred" ? "Unstar" : "Star"}
          </button>
          {row.isSocial && (
            <button type="button" className="uik-btn uik-btn--sm" onClick={() => run(flagComment)} disabled={pending} title="Send to Moderation">
              <Icon name="flag" size={12} />
              Flag
            </button>
          )}
        </div>
      </div>

      {!row.isSocial && (
        <div className="row" style={{ gap: 6, fontSize: 11.5, color: "var(--uik-mut)", alignItems: "flex-start" }}>
          <Icon name="info" size={13} style={{ marginTop: 1 }} />
          <span>Google content is reply-only. It can&apos;t be hidden reply publicly below.</span>
        </div>
      )}

      {/* AI suggested replies */}
      <div className="uik-ai">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--uik-ink)", display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="sparkle" size={14} style={{ color: "var(--uik-purple)" }} />
            AI Suggested Replies
          </span>
          <button type="button" className="uik-btn uik-btn--xs" onClick={aiSuggest} disabled={suggesting || pending}>
            <Icon name="refresh" size={12} />
            {suggesting ? "Thinking…" : "Generate"}
          </button>
        </div>
        {suggestions.length > 0 ? (
          <div style={{ display: "grid", gap: 8 }}>
            {suggestions.map((s, i) => (
              <div key={i} className="uik-ai__card" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
                <span className="uik-pill uik-pill--needs" style={{ width: "fit-content" }}>{s.tone}</span>
                <span style={{ lineHeight: 1.5 }}>{s.text}</span>
                <button type="button" className="uik-btn uik-btn--xs uik-btn--purple" style={{ width: "fit-content" }} onClick={() => setDraft(s.text)}>
                  Use reply
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="uik-mut" style={{ fontSize: 12, margin: 0 }}>
            Generate on-brand reply ideas from this comment and your knowledge base.
          </p>
        )}
      </div>

      {error && (
        <div className="uik-pill uik-pill--warn" role="alert" style={{ width: "fit-content" }}>{error}</div>
      )}

      {/* Composers: public reply + internal note */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 180px", gap: 12 }}>
        <div>
          <span className="uik-field__label" style={{ marginBottom: 5 }}>Write a public reply</span>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder="Write a public reply…"
            className="uik-textarea"
          />
          <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>
            <span className="uik-mut uik-mono" style={{ fontSize: 11 }}>{draft.length} / 2200</span>
            <button type="button" className="uik-btn uik-btn--xs uik-btn--pri" onClick={sendReply} disabled={pending}>
              <Icon name="send" size={12} />
              Reply
            </button>
          </div>
        </div>
        <div>
          <span className="uik-field__label" style={{ marginBottom: 5 }}>
            <Icon name="lock" size={11} /> Internal note
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Only visible to your team…"
            className="uik-textarea"
          />
          <button
            type="button"
            className="uik-btn uik-btn--xs uik-btn--purple"
            style={{ marginTop: 6, width: "100%" }}
            disabled={!note.trim()}
            title="Internal notes are private to your team"
          >
            Save note
          </button>
        </div>
      </div>

      <button
        type="button"
        className="uik-btn uik-btn--ghost uik-btn--sm"
        onClick={() => {
          if (window.confirm("Remove this comment from your inbox queue? (It stays on the platform.)")) run(deleteComment);
        }}
        disabled={pending}
        style={{ width: "fit-content", color: "var(--uik-bad)" }}
      >
        <Icon name="trash" size={12} />
        Remove from queue
      </button>
    </div>
  );
}

function PostPreview({ row }: { row: CommentRowView }) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ border: "1px solid var(--uik-line)", borderRadius: "var(--uik-r-lg)", overflow: "hidden", background: "#fff" }}>
        <div className="row" style={{ justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid var(--uik-divider)" }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--uik-ink)" }}>Post preview</span>
          <ChannelGlyph channel={platformToChannel(row.platform)} size={15} />
        </div>
        <div style={{ padding: 14 }}>
          {row.externalPostId ? (
            <p className="uik-mut" style={{ fontSize: 12, margin: 0, lineHeight: 1.5 }}>
              Comment on post <span className="uik-mono" style={{ color: "var(--uik-ink-2)" }}>{row.externalPostId.slice(0, 18)}</span>
            </p>
          ) : (
            <p className="uik-mut" style={{ fontSize: 12, margin: 0 }}>Source post details aren&apos;t synced for this comment.</p>
          )}
          {/* Highlighted selected comment */}
          <div style={{ marginTop: 12, background: "#f6f7fb", borderRadius: "var(--uik-r-sm)", padding: 10 }}>
            <div className="row" style={{ gap: 8, marginBottom: 4 }}>
              <Avatar name={row.authorName ?? "User"} size={24} />
              <span style={{ fontSize: 12, fontWeight: 600 }}>{row.authorName ?? "Anonymous"}</span>
              <span className="uik-mut" style={{ fontSize: 10.5, marginLeft: "auto" }}>{relativeTime(row.postedAt)}</span>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: "var(--uik-ink-2)", lineHeight: 1.5 }}>{row.body}</p>
          </div>
        </div>
      </div>

      <div style={{ border: "1px solid var(--uik-line)", borderRadius: "var(--uik-r-lg)", padding: 14, background: "#fff" }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--uik-ink)" }}>This comment</span>
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          <PreviewStat label="Platform" value={platformLabel(row.platform)} />
          <PreviewStat label="Status" value={statusLabel(row.status)} />
          <PreviewStat label="Type" value={row.isAd ? "Ad comment" : row.isSocial ? "Organic" : "Google Q&A"} />
        </div>
      </div>
    </div>
  );
}

function PreviewStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="row" style={{ justifyContent: "space-between" }}>
      <span className="uik-mut" style={{ fontSize: 12 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--uik-ink)" }}>{value}</span>
    </div>
  );
}

function EmptyComments({
  connected,
  activeStatus,
  activeSource = "all",
}: {
  connected: boolean;
  activeStatus: string;
  activeSource?: string;
}) {
  const adView = activeSource === "ad";
  const title = connected
    ? adView
      ? "No ad comments yet"
      : activeStatus === "all"
        ? "No social comments yet"
        : `No ${activeStatus.replace("_", " ")} comments`
    : "Connect your social pages";
  const body = connected
    ? adView
      ? "Comments on your boosted / promoted Facebook & Instagram posts will appear here once your ad account is connected with ads permissions."
      : "Comments on your Facebook and Instagram posts will appear here once you connect your channels."
    : "Connect Facebook and Instagram to sync and reply to comments in one place.";

  return (
    <div className="uik-empty" style={{ borderTop: "1px solid var(--uik-divider)" }}>
      <div>
        <EmptyIllustration name="/assets/repulabs/unified-inbox/comments-empty.svg" size={720} />
      </div>
      <div>
        <h3 className="uik-empty__title">{title}</h3>
        <p className="uik-empty__body">{body}</p>
        <Link href="/connections" className="uik-btn uik-btn--purple">
          <Icon name="plug" size={13} />
          {connected ? "Manage connections" : "Connect social pages"}
        </Link>

        <div className="uik-benefits">
          <Benefit icon="chat" title="Centralize conversations" body="See all comments from Facebook and Instagram in one unified inbox." />
          <Benefit icon="reply" title="Respond with ease" body="Reply, react, or hide comments without leaving this dashboard." />
          <Benefit icon="bell" title="Stay on top" body="Filter, sort, and prioritize comments that need your attention." />
          <Benefit icon="bars" title="Drive engagement" body="Fast replies build trust and turn conversations into loyal customers." />
        </div>
      </div>
    </div>
  );
}

function Benefit({ icon, title, body }: { icon: Parameters<typeof Icon>[0]["name"]; title: string; body: string }) {
  return (
    <div className="uik-benefit">
      <span className="uik-benefit__icon">
        <Icon name={icon} size={15} />
      </span>
      <div>
        <p className="uik-benefit__title">{title}</p>
        <p className="uik-benefit__body">{body}</p>
      </div>
    </div>
  );
}

/* ---- helpers ---- */

function platformToChannel(platform: string): string {
  if (platform.startsWith("facebook")) return "facebook_msg";
  if (platform.startsWith("instagram")) return "instagram_dm";
  if (platform.startsWith("google")) return "gbp_qa";
  return platform;
}

function platformLabel(platform: string): string {
  if (platform.startsWith("facebook")) return "Facebook";
  if (platform.startsWith("instagram")) return "Instagram";
  if (platform.startsWith("google")) return "Google";
  return platform;
}

function statusLabel(status: string): string {
  switch (status) {
    case "needs_reply":
      return "Needs reply";
    case "replied":
      return "Replied";
    case "hidden":
      return "Hidden";
    case "starred":
      return "Starred";
    case "live":
      return "Live";
    default:
      return status.replace("_", " ");
  }
}

function statusPill(status: string): string {
  switch (status) {
    case "needs_reply":
      return "uik-pill--needs";
    case "replied":
      return "uik-pill--replied";
    case "hidden":
      return "uik-pill--hidden";
    case "starred":
      return "uik-pill--starred";
    case "live":
      return "uik-pill--info";
    default:
      return "uik-pill--hidden";
  }
}

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString();
}
