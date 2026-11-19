"use client";

import { setAutoReply5Star } from "@/lib/auto-reply/toggle";
import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

/**
 * "Auto-Reply to 5-Star Reviews" toggle (Module 06).
 *
 * A single org-wide switch backed by the managed 5★ `AutoReplyRule`
 * (`lib/auto-reply/toggle.ts`). Posts an AI reply to clean 5★ reviews after a
 * randomized 2–4h delay so the cadence reads as human. Compliance: the toggle
 * NEVER exposes auto-posting for ≤4★ — those always wait for a human.
 *
 * The form submits the DESIRED next state via a hidden `enable` flag (computed
 * `!enabled`); the server action upserts/flips the managed rule and returns a
 * `{ok}/{ok:false,error}` result rendered inline via `useActionState` — a
 * failure (not entitled, not admin, unmigrated) shows a message instead of
 * crashing the page (bug 004 in the June 2026 assessment). Power users get a
 * "Manage all rules" link to the full rules surface.
 */
export function AutoReplyToggle({ enabled }: { enabled: boolean }) {
  const [error, formAction] = useActionState(
    async (_prev: string | null, form: FormData): Promise<string | null> => {
      const res = await setAutoReply5Star(form);
      return res.ok ? null : res.error;
    },
    null,
  );

  return (
    <section className="ri-card ri-auto" aria-label="Auto-reply to 5-star reviews">
      <div className="ri-auto__top">
        <Sparkles size={18} strokeWidth={1.8} className="ri-auto__icon" aria-hidden />
        <div className="ri-auto__title">Auto-reply to 5★ reviews</div>
        <form action={formAction} className="ri-auto__form">
          <input type="hidden" name="enable" value={(!enabled).toString()} />
          <ToggleSwitch enabled={enabled} />
        </form>
      </div>
      <p className="ri-auto__sub">
        AI replies to 5★ reviews after a random 2–4 hour delay, so it reads as human.{" "}
        <Link href="/reviews/auto-reply" className="ri-auto__link">
          Manage rules
        </Link>
      </p>
      {error && (
        <p role="alert" className="ri-auto__error">
          {error}
        </p>
      )}
    </section>
  );
}

function ToggleSwitch({ enabled }: { enabled: boolean }) {
  const { pending } = useFormStatus();
  // Optimistic: while submitting, paint the switch in its target state.
  const on = pending ? !enabled : enabled;
  return (
    <button
      type="submit"
      role="switch"
      aria-checked={on}
      aria-label="Toggle auto-reply to 5-star reviews"
      disabled={pending}
      title={on ? "Turn off 5★ auto-reply" : "Turn on 5★ auto-reply"}
      className={`ri-switch${on ? " is-on" : ""}`}
    >
      <span aria-hidden className="ri-switch__knob" />
    </button>
  );
}
