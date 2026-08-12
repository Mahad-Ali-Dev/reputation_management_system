"use client";

import { Button } from "@/components/ui/button";
import { commitBulkReviewRequests } from "@/lib/outreach/bulk-actions";
import { useActionState } from "react";

/**
 * Bulk Send form (client island). Submits to `commitBulkReviewRequests` and
 * renders its `{ok|error}` result inline — the old bare `<form action>`
 * crashed the whole page when the action threw (e.g. a phone number pasted
 * with the Email channel selected; bug 011 in the June 2026 assessment).
 *
 * SMS is commented out (not removed) for now — email-only send. The channel
 * select below is fixed to "email" via a hidden input rather than a live
 * dropdown, so there's nothing left to pick; the "sms" <option>, the TCPA
 * compliance notice, and the consent checkbox are all still here, just
 * disabled via JSX comments.
 */

type FormState = {
  error: string | null;
  success: string | null;
};

export function BulkSendForm({
  establishments,
}: {
  establishments: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(
    async (_prev: FormState, form: FormData): Promise<FormState> => {
      const res = await commitBulkReviewRequests(form);
      if (!res.ok) return { error: res.error, success: null };
      return {
        error: null,
        success:
          `Queued ${res.inserted.toLocaleString()} request${res.inserted === 1 ? "" : "s"}` +
          (res.skipped > 0
            ? ` — skipped ${res.skipped.toLocaleString()} (unsubscribed or contacted in the last 30 days)`
            : "") +
          ". Delivery runs on the send scheduler.",
      };
    },
    { error: null, success: null },
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="font-medium">Establishment</span>
          <select
            name="establishmentId"
            required
            className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
          >
            {establishments.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium">Channel</span>
          {/* Email-only for now — fixed via hidden input rather than a live
              dropdown, since there's nothing left to pick. The "sms" option
              is commented out (not removed), see the file header note.
          <select
            name="channel"
            required
            className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
          >
            <option value="email">Email</option>
            <option value="sms">SMS</option>
          </select>
          */}
          <input type="hidden" name="channel" value="email" />
          <div className="mt-1 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground">
            Email
          </div>
        </label>
      </div>

      <label className="block text-sm">
        <span className="font-medium">CSV content</span>
        <textarea
          name="csvText"
          required
          rows={10}
          placeholder={"email,name\nalice@example.com,Alice Smith\nbob@example.com,Bob Jones\ncarol@example.com,"}
          className="mt-1 w-full rounded-md border border-input px-3 py-2 font-mono text-xs"
        />
        <span className="mt-1 block text-xs text-muted-foreground">
          One email address (lowercased) per line, with an optional name column.
        </span>
      </label>

      <label className="block text-sm">
        <span className="font-medium">Send delay (hours)</span>
        <input
          type="number"
          name="scheduleHours"
          min={0}
          max={720}
          defaultValue={0}
          className="mt-1 w-32 rounded-md border border-input px-3 py-2 text-sm"
        />
        <span className="mt-1 block text-xs text-muted-foreground">
          0 = send immediately. 24 = wait one day. Max 30 days.
        </span>
      </label>

      {/* TCPA notice + consent checkbox were SMS-specific (commitBulkReviewRequests
          only enforces/records this for channel:"sms") — commented out, not
          removed, alongside the SMS option above.
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <strong>TCPA / CAN-SPAM compliance.</strong> For SMS sends, you must attest that every
        recipient has previously given prior express written consent to receive marketing texts
        from your business. Unsubscribe headers are added automatically.
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="consentAttested" className="mt-1" />
        <span>
          I attest that every recipient in this list has given prior consent to receive marketing
          messages from us (required for SMS, recommended for email).
        </span>
      </label>
      */}
      <p className="text-xs text-muted-foreground">
        CAN-SPAM: every email includes an unsubscribe link automatically.
      </p>

      {state.error && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {state.error}
        </p>
      )}
      {state.success && (
        <p
          role="status"
          className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800"
        >
          {state.success}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Queuing…" : "Queue bulk send"}
      </Button>
    </form>
  );
}
