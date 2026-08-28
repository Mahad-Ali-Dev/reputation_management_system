import { AppShellServer } from "@/components/app-shell-server";
import { Icon } from "@/components/shell/icon";
import { TopBar } from "@/components/topbar";
import Link from "next/link";

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
      "Every customer conversation reviews, DMs, comments, live chat and meeting requests in one place, with AI-drafted replies.",
    bullets: [
      "One thread per customer across every channel",
      "AI reply suggestions you approve before sending",
      "Moderation rules that hide spam automatically",
    ],
  },
} as const;

export type LockedModuleKey = keyof typeof LOCKED_MODULES;

export function ComingSoonPage({ module: key }: { module: LockedModuleKey }) {
  const m = LOCKED_MODULES[key];

  return (
    <AppShellServer topBar={<TopBar />} crumbs={[...m.crumbs]}>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
          padding: "48px 20px",
        }}
      >
        <div className="ds-card" style={{ maxWidth: 560, width: "100%", padding: "36px 32px" }}>
          <span
            aria-hidden="true"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 52,
              height: 52,
              borderRadius: 14,
              background: "rgba(37,99,235,0.08)",
              color: "var(--rl-primary, #2563eb)",
              marginBottom: 18,
            }}
          >
            <Icon name="sparkle" size={24} />
          </span>

          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "3px 10px",
              borderRadius: 999,
              background: "rgba(37,99,235,0.08)",
              color: "var(--rl-primary, #2563eb)",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              marginLeft: 10,
              verticalAlign: "top",
            }}
          >
            Coming soon
          </div>

          <h1
            style={{
              margin: "14px 0 8px",
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "var(--ink)",
            }}
          >
            {m.title}
          </h1>

          <p
            style={{
              margin: "0 0 20px",
              fontSize: 14.5,
              lineHeight: 1.6,
              color: "var(--rl-muted)",
            }}
          >
            {m.blurb}
          </p>

          <ul
            style={{ margin: "0 0 24px", padding: 0, listStyle: "none", display: "grid", gap: 10 }}
          >
            {m.bullets.map((b) => (
              <li key={b} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span
                  aria-hidden="true"
                  style={{ color: "var(--rl-primary, #2563eb)", flexShrink: 0, marginTop: 1 }}
                >
                  <Icon name="checkCircle" size={15} />
                </span>
                <span
                  style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--rl-ink-2, #334155)" }}
                >
                  {b}
                </span>
              </li>
            ))}
          </ul>

          <div
            style={{
              borderTop: "1px solid var(--rl-border, #eceeea)",
              paddingTop: 18,
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            {/* Deliberately NO upgrade CTA — this is locked on every plan. */}
            <Link
              href="/dashboard"
              className="btn btn--pri btn--sm"
              style={{ display: "inline-flex" }}
            >
              <Icon name="arrowR" size={13} />
              Back to dashboard
            </Link>
            <span style={{ fontSize: 12.5, color: "var(--rl-muted)" }}>
              We&rsquo;ll email you the moment it goes live.
            </span>
          </div>
        </div>
      </div>
    </AppShellServer>
  );
}
