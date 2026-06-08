"use client";

import { Icon } from "@/components/shell/icon";
import { generateReplyForReview, publishReply } from "@/lib/reviews/actions";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * Inline AI-draft expander on a feed card (Module 06 — the spec's agentic
 * draft flow lifted onto the list). Reuses the EXISTING server actions
 * (`generateReplyForReview` / `publishReply`) verbatim — no new server action.
 *
 * States:
 *   - no reply        → collapsed "Generate Reply with AI" button
 *   - reply staged    → light-blue draft box with an editable textarea, the
 *                       provenance/delay info line, and Approve & Post /
 *                       Regenerate / Edit
 *   - reply published → quiet "Published" line (the card already shows the
 *                       Replied badge; nothing to act on)
 *
 * Compliance copy: 5★ mentions the auto 2–4h delay; ≤4★ drops the "auto"
 * framing and reminds the host to review before it posts (human-in-the-loop).
 *
 * The whole card is a <Link>, so every control here stops event propagation /
 * prevents default so clicking Generate/Approve/Edit never navigates away.
 */

type ReplyState = {
  id: string;
  body: string;
  status: string;
  scheduledPublishAt: string | null;
} | null;

export function ReplyDraftBox({
  reviewId,
  rating,
  reply,
  canReplyDeepLink,
}: {
  reviewId: string;
  rating: number;
  reply: ReplyState;
  /** Whether this source can be auto-published (Google). Drives Approve label. */
  canReplyDeepLink: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Local draft edits + edit-mode. Seeded from the server reply.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(reply?.body ?? "");
  // Expand a freshly-generated reply even before the router refresh lands.
  const [forceOpen, setForceOpen] = useState(false);

  const is5Star = rating === 5;
  const published = reply?.status === "published";
  const hasDraft = !!reply && !published;
  const open = hasDraft || forceOpen;

  function stop(e: React.SyntheticEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleGenerate(e: React.SyntheticEvent) {
    stop(e);
    setError(null);
    startTransition(async () => {
      try {
        await generateReplyForReview(reviewId);
        setForceOpen(true);
        router.refresh();
      } catch (err) {
        setError(toMessage(err));
      }
    });
  }

  function handleApprove(e: React.SyntheticEvent) {
    stop(e);
    setError(null);
    startTransition(async () => {
      try {
        // postNow=true: the host explicitly approved from the feed, so post
        // immediately (clears any pending schedule).
        await publishReply(reviewId, draft || reply?.body, true);
        setEditing(false);
        router.refresh();
      } catch (err) {
        setError(toMessage(err));
      }
    });
  }

  if (published) {
    return (
      <div
        style={{
          marginTop: 10,
          paddingTop: 10,
          borderTop: "1px solid var(--line)",
          fontSize: 11.5,
          color: "var(--ok, #16a34a)",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <Icon name="check" size={12} />
        Reply published
      </div>
    );
  }

  if (!open) {
    return (
      <div style={{ marginTop: 10 }}>
        <button
          type="button"
          className="btn btn--pri"
          onClick={handleGenerate}
          disabled={pending}
          style={{ fontSize: 11.5 }}
        >
          <Icon name="sparkle" size={12} />
          {pending ? "Generating…" : "Generate Reply with AI"}
        </button>
        {error && <InlineError message={error} />}
      </div>
    );
  }

  // Expanded draft box — light-blue surface, editable textarea + actions.
  const infoLine = is5Star
    ? "AI used your Knowledge Base to personalize this reply. It will post to Google after a 2–4 hour delay to appear natural."
    : "AI used your Knowledge Base to personalize this reply. Review and approve before it posts.";

  return (
    <div
      onClick={stop}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") e.stopPropagation();
      }}
      style={{
        marginTop: 12,
        padding: 14,
        borderRadius: "var(--r, 10px)",
        background: "var(--pri-50, #eff6ff)",
        border: "1px solid var(--pri-100, #dbeafe)",
      }}
    >
      <div
        className="row"
        style={{ gap: 6, marginBottom: 8, fontSize: 11, color: "var(--pri, #2563eb)", fontWeight: 600 }}
      >
        <Icon name="sparkle" size={12} />
        AI draft
      </div>

      <textarea
        value={editing ? draft : (reply?.body ?? draft)}
        onChange={(e) => setDraft(e.target.value)}
        onClick={stop}
        readOnly={!editing}
        placeholder="Write your reply…"
        rows={4}
        aria-label="Reply draft"
        style={{
          width: "100%",
          resize: "vertical",
          padding: "10px 12px",
          borderRadius: 8,
          border: "1px solid var(--pri-100, #dbeafe)",
          background: editing ? "#fff" : "rgba(255,255,255,0.6)",
          fontFamily: "var(--f-ui)",
          fontSize: 12.5,
          lineHeight: 1.55,
          color: "var(--ink, #0f172a)",
          outline: "none",
        }}
      />

      <p
        className="dim"
        style={{ fontSize: 11, margin: "8px 0 10px", lineHeight: 1.5, color: "var(--ink-2, #475569)" }}
      >
        {infoLine}
      </p>

      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={handleApprove}
          disabled={pending}
          className="btn"
          style={{
            fontSize: 11.5,
            background: "var(--ok, #16a34a)",
            borderColor: "var(--ok, #16a34a)",
            color: "#fff",
          }}
          title={canReplyDeepLink ? "Approve and post to Google" : "Approve this reply"}
        >
          <Icon name="check" size={12} />
          {pending ? "Working…" : "Approve & Post"}
        </button>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={pending}
          className="btn"
          style={{ fontSize: 11.5, color: "var(--pri, #2563eb)" }}
        >
          <Icon name="refresh" size={12} />
          Regenerate
        </button>
        <button
          type="button"
          onClick={(e) => {
            stop(e);
            if (!editing) setDraft(reply?.body ?? draft);
            setEditing((v) => !v);
          }}
          disabled={pending}
          className="btn btn--ghost"
          style={{ fontSize: 11.5 }}
        >
          <Icon name="edit" size={12} />
          {editing ? "Done" : "Edit"}
        </button>
      </div>
      {error && <InlineError message={error} />}
    </div>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <p style={{ fontSize: 11, color: "var(--bad, #dc2626)", margin: "8px 0 0" }} role="alert">
      {message}
    </p>
  );
}

function toMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw === "plan_inactive") return "Your plan doesn't include AI replies. Upgrade to continue.";
  if (raw === "ai_budget") return "Daily AI limit reached. Try again tomorrow.";
  if (raw.startsWith("publish_unsupported")) return "This platform can't be replied to from here.";
  return "Something went wrong. Please try again.";
}
