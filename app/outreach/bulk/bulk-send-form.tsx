"use client";

import { Button } from "@/components/ui/button";
import { commitBulkReviewRequests } from "@/lib/outreach/bulk-actions";
import { useActionState } from "react";

/**
 * Bulk Send form (client island). Submits to `commitBulkReviewRequests` and
 * renders its `{ok|error}` result inline — the old bare `<form action>`
 * crashed the whole page when the action threw (e.g. a phone number pasted
 * with the Email channel selected; bug 011 in the June 2026 assessment).
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
          <select
            name="channel"
            required
            className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
          >
            <option value="email">Email</option>
            <option value="sms">SMS</option>
          </select>
        </label>
      </div>

      <label className="block text-sm">
        <span className="font-medium">CSV content</span>
        <textarea
          name="csvText"
          required
          rows={10}
          placeholder={`phone,name\n+15551234567,Alice Smith\n+15559876543,Bob Jones\n+15550001111,`}
          className="mt-1 w-full rounded-md border border-input px-3 py-2 font-mono text-xs"
        />
        <span className="mt-1 block text-xs text-muted-foreground">
          Phone numbers must be E.164 format (e.g. +15551234567) with the SMS channel; email
          addresses (lowercased) with the Email channel.
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
