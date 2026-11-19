"use client";

import { generateReplyForReview, publishReply } from "@/lib/reviews/actions";
import { Check, CircleCheck, PenLine, RefreshCw, Sparkles } from "lucide-react";
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
      <div className="ri-reply__done">
        <CircleCheck size={16} strokeWidth={2} />
        Reply published
      </div>
    );
  }

  if (!open) {
    return (
      <div className="ri-reply__start">
        <button
          type="button"
          className="ri-pill ri-pill--pri ri-pill--lg"
          onClick={handleGenerate}
          disabled={pending}
        >
          <Sparkles size={16} strokeWidth={1.8} />
          {pending ? "Writing a reply…" : "Write a reply with AI"}
        </button>
        {error && <InlineError message={error} />}
      </div>
    );
  }

  // Expanded draft box — frosted card, editable textarea + actions.
  const infoLine = is5Star
    ? "Written with your Knowledge Base. It posts to Google after a 2–4 hour delay so it reads naturally."
    : "Written with your Knowledge Base. Check it, then approve to post.";

  return (
    <div
      className="ri-reply"
      onClick={stop}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") e.stopPropagation();
      }}
    >
      <div className="ri-reply__label">
        <Sparkles size={14} strokeWidth={1.8} />
        AI draft
      </div>

      <textarea
        value={editing ? draft : (reply?.body ?? draft)}
        onChange={(e) => setDraft(e.target.value)}
        onClick={stop}
        readOnly={!editing}
        placeholder="Write your reply…"
        rows={5}
        aria-label="Reply draft"
        className={`ri-reply__text${editing ? " is-editing" : ""}`}
      />

      <p className="ri-reply__info">{infoLine}</p>

      <div className="ri-reply__actions">
        <button
          type="button"
          onClick={handleApprove}
          disabled={pending}
          className="ri-pill ri-pill--ok"
          title={canReplyDeepLink ? "Approve and post to Google" : "Approve this reply"}
        >
          <Check size={15} strokeWidth={2.2} />
          {pending ? "Working…" : "Approve & post"}
        </button>
        <button type="button" onClick={handleGenerate} disabled={pending} className="ri-pill">
          <RefreshCw size={14} strokeWidth={1.8} />
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
          className="ri-pill"
        >
          <PenLine size={14} strokeWidth={1.8} />
          {editing ? "Done" : "Edit"}
        </button>
      </div>
      {error && <InlineError message={error} />}
    </div>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <p className="ri-reply__error" role="alert">
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
