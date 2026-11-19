import { AppShellServer } from "@/components/app-shell-server";
import { TopBar } from "@/components/topbar";
import { LazyFrog } from "@/components/ui/lazy-frog";
import { Check } from "lucide-react";
import Link from "next/link";
import "./coming-soon.css";

/**
 * Full-page "Coming soon" lock for modules that are built but deliberately not
 * released yet.
 *
 * This is NOT an entitlement gate — it locks the module for EVERY plan, Pro
 * included, so it must never render an "Upgrade to Pro" CTA (that would sell
 * something the customer cannot get). See `LOCKED_MODULES` below for the
 * current list and how to release one.
 */

/**
 * Modules locked behind the coming-soon screen.
 *
 * TO RELEASE A MODULE: delete its entry here and remove the `<ComingSoonPage/>`
 * early-return at the top of the matching page component. Everything behind it
 * is intact — the lock is a short-circuit, not a teardown.
 */
export const LOCKED_MODULES = {
  phone: {
    title: "AI Phone Receptionist",
    crumbs: ["AI", "Phone Receptionist"],
    blurb:
      "An AI receptionist that answers your calls, books jobs, and turns happy callers into Google reviews automatically.",
    bullets: [
      "Answers every call in your brand voice, 24/7",
      "Books appointments straight into your calendar",
      "Texts a review link after a great call",
    ],
  },
  inbox: {
    title: "Unified Inbox",
    crumbs: ["Engage", "Unified Inbox"],
    blurb:
      "Every customer conversation in one place: reviews, DMs, comments, live chat and meeting requests, with AI-drafted replies.",
    bullets: [
      "One thread per customer across every channel",
      "AI reply suggestions you approve before sending",
      "Moderation rules that hide spam automatically",
    ],
  },
  bookings: {
    title: "Booking Requests",
    crumbs: ["Inbox & Social", "Booking Requests"],
    blurb:
      "Every meeting request your customers send, in one simple list with the time they asked for.",
    bullets: [
      "All requests in one place, with each customer's preferred time",
      "Accept, reschedule or decline in a tap",
      "Follow each request from new to scheduled",
    ],
  },
} as const;

export type LockedModuleKey = keyof typeof LOCKED_MODULES;

/** Apple-style announcement page: frog at work, big title, a short list. */
export function ComingSoonPage({ module: key }: { module: LockedModuleKey }) {
  const m = LOCKED_MODULES[key];

  return (
    <AppShellServer topBar={<TopBar />} crumbs={[...m.crumbs]}>
      <div className="cs">
        <div className="cs__frog">
          <LazyFrog
            size={132}
            name="Repulabs AI"
            state="working"
            statusLabels={{ working: "Building it" }}
            followPointer
          />
        </div>
        <span className="cs__eyebrow">Coming soon</span>
        <h1 className="cs__title">{m.title}</h1>
        <p className="cs__blurb">{m.blurb}</p>

        <ul className="cs__list">
          {m.bullets.map((b) => (
            <li key={b} className="cs__item">
              <span className="cs__tick" aria-hidden="true">
                <Check size={14} strokeWidth={2.4} />
              </span>
              {b}
            </li>
          ))}
        </ul>

        {/* Deliberately NO upgrade CTA — this is locked on every plan. */}
        <div className="cs__actions">
          <Link href="/dashboard" className="cs__btn">
            Back to Dashboard
          </Link>
        </div>
        <p className="cs__note">We&rsquo;ll email you the moment it goes live.</p>
      </div>
    </AppShellServer>
  );
}
