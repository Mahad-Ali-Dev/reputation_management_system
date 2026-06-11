"use client";

import { Icon } from "@/components/shell/icon";
import { resendReviewRequest } from "@/lib/outreach/actions";
import { useActionState } from "react";

/**
 * Resend control for the Sent-History rows (client island). Renders the
 * action's `{ok|error}` result inline — the old bare `<form action>` crashed
 * the page when the action threw (e.g. recipient since unsubscribed).
 */
export function ResendButton({ requestId }: { requestId: string }) {
  const [state, formAction, pending] = useActionState(
    async (
      _prev: { error: string | null; done: boolean },
      form: FormData,
    ): Promise<{ error: string | null; done: boolean }> => {
      const res = await resendReviewRequest(form);
      return res.ok ? { error: null, done: true } : { error: res.error, done: false };
    },
    { error: null, done: false },
  );

  return (
    <form action={formAction} style={{ display: "inline" }}>
      <input type="hidden" name="id" value={requestId} />
      <button
        type="submit"
        className="btn"
        style={{ height: 26, padding: "0 10px" }}
        disabled={pending || state.done}
        title={state.error ?? undefined}
      >
        <Icon name={state.error ? "alert" : "refresh"} size={11} />
        {pending ? "Queuing…" : state.done ? "Queued" : state.error ? "Failed — retry" : "Resend"}
      </button>
      {state.error && (
        <span role="alert" className="dim" style={{ display: "block", fontSize: 10.5, color: "var(--bad)", marginTop: 2 }}>
          {state.error}
        </span>
      )}
    </form>
  );
}
