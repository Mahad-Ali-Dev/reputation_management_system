"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  prepareDispute,
  regenerateDisputeArgumentAction,
} from "@/lib/reviews/dispute-actions";

/**
 * Step 3 AI-argument island (the spec's AiAssist surface for Module 08).
 *
 * Renders an editable textarea seeded with the AI draft, a Regenerate button
 * (calls the gated server action, replaces the text), the KB-grounding note,
 * and the primary "Prepare Dispute" submit inside a server-action <form>.
 *
 * Honest microcopy: the primary action is "Prepare Dispute" (never "Submit") —
 * the app does not submit to Google; the user files manually on the next screen.
 */
export function ArgumentEditor({
  reviewId,
  violationType,
  initialArgument,
  initialKbChunksUsed,
}: {
  reviewId: string;
  violationType: string;
  initialArgument: string;
  initialKbChunksUsed: number;
}) {
  const [argument, setArgument] = useState(initialArgument);
  const [kbChunksUsed, setKbChunksUsed] = useState(initialKbChunksUsed);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, startRegen] = useTransition();
  const router = useRouter();

  function handleRegenerate() {
    setError(null);
    startRegen(async () => {
      try {
        const res = await regenerateDisputeArgumentAction({
          reviewId,
          violationType,
          previousText: argument,
        });
        setArgument(res.argument);
        setKbChunksUsed(res.kbChunksUsed);
        router.refresh();
      } catch (err) {
        setError(messageFor(err));
      }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label htmlFor="dispute-argument" style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
        Dispute argument
      </label>

      <form action={prepareDispute} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input type="hidden" name="reviewId" value={reviewId} />
        <input type="hidden" name="violationType" value={violationType} />

        <textarea
          id="dispute-argument"
          name="argument"
          value={argument}
          onChange={(e) => setArgument(e.target.value)}
          rows={12}
          required
          maxLength={8000}
          placeholder="Edit the AI-drafted argument…"
          disabled={regenerating}
          className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          style={{ resize: "vertical", lineHeight: 1.55, opacity: regenerating ? 0.6 : 1 }}
        />

        <p style={{ fontSize: 12, color: "var(--rl-muted)", margin: 0 }}>
          {kbChunksUsed > 0
            ? "AI used your Knowledge Base to ground this argument in facts about your business. Review it carefully you are responsible for what you send to Google."
            : "Your Knowledge Base had no matching facts, so this argument is based only on the policy violation. Add facts to your Knowledge Base for a stronger, business-specific argument."}
        </p>

        {error && (
          <p className="chip chip--bad" style={{ alignSelf: "flex-start" }} role="alert">
            {error}
          </p>
        )}

        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <button type="submit" className="btn btn--pri" disabled={regenerating || argument.trim().length === 0}>
            Prepare Dispute
          </button>
          <button type="button" className="btn btn--ghost" onClick={handleRegenerate} disabled={regenerating}>
            {regenerating ? "Regenerating…" : "Regenerate"}
          </button>
        </div>
      </form>
    </div>
  );
}

function messageFor(err: unknown): string {
  const code = (err as { code?: string } | null)?.code;
  if (code === "ai_budget") return "Daily AI limit reached. Try again tomorrow, edit the text manually, or raise the cap.";
  if (code === "plan_inactive") return "AI drafting needs an active plan. Edit the argument manually, or upgrade to use AI.";
  if (code === "forbidden") return "You need the Manager role to draft an AI argument.";
  return err instanceof Error ? err.message : "Could not regenerate. Edit the text manually or try again.";
}
