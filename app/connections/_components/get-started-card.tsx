/**
 * Get-Started empty state (presentational, server-safe) — module 14_connections.
 *
 * Shown when the org has ZERO active connections. Three numbered steps that
 * orient a new user: pick a source, authorize, then watch requests fire. No
 * client state — pure markup + links, so the server page renders it directly.
 */

import { EmptyIllustration } from "@/components/empty-state";
import { Icon, type IconName } from "@/components/shell/icon";
import Link from "next/link";

type Step = {
  n: number;
  icon: IconName;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    n: 1,
    icon: "plug",
    title: "Connect a source",
    body: "Link your CRM, POS, e-commerce, or accounting tool — or just bring a CSV. This is where customer contacts come from.",
  },
  {
    n: 2,
    icon: "lock",
    title: "Authorize securely",
    body: "A one-time OAuth consent (tokens are encrypted at rest). Social platforms like Meta connect Facebook + Instagram in a single step.",
  },
  {
    n: 3,
    icon: "send",
    title: "Requests fire automatically",
    body: "New customers sync every 15 minutes and flow into review requests at the perfect moment — no manual work.",
  },
];

export function GetStartedCard() {
  return (
    <div className="ds-card" style={{ overflow: "hidden" }}>
      <div
        className="welcome"
        style={{ padding: "36px 28px 30px", borderBottom: "1px solid var(--line)" }}
      >
        <EmptyIllustration name="integrations-empty" size={160} style={{ marginBottom: 14 }} />
        <h2
          style={{
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            margin: 0,
            color: "var(--ink)",
          }}
        >
          Connect your first system
        </h2>
        <p
          className="dim"
          style={{ fontSize: 13.5, lineHeight: 1.55, maxWidth: 520, margin: "10px auto 0" }}
        >
          Connections feed the data spine: sync customers from the tools you already use, then let
          repulabs ship review requests automatically at the moment of truth.
        </p>
      </div>

      <div className="ds-card__body" style={{ padding: 20 }}>
        <div className="grid-3" style={{ gap: 14 }}>
          {STEPS.map((step) => (
            <div
              key={step.n}
              style={{
                border: "1px solid var(--line)",
                borderRadius: 12,
                padding: 16,
                background: "var(--surface-2)",
              }}
            >
              <div className="row" style={{ gap: 10, marginBottom: 10 }}>
                <span
                  aria-hidden="true"
                  className="mono"
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 7,
                    background: "var(--ink)",
                    color: "#fff",
                    display: "grid",
                    placeItems: "center",
                    fontSize: 11,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {step.n}
                </span>
                <span
                  aria-hidden="true"
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    background: "var(--pri-50)",
                    color: "var(--pri)",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <Icon name={step.icon} size={15} />
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
                  {step.title}
                </span>
              </div>
              <p className="dim" style={{ fontSize: 12, lineHeight: 1.55, margin: 0 }}>
                {step.body}
              </p>
            </div>
          ))}
        </div>

        <div className="row" style={{ gap: 8, marginTop: 18, flexWrap: "wrap" }}>
          <Link href="/contacts?import=1" className="btn btn--pri">
            <Icon name="upload" size={13} />
            Import a CSV
          </Link>
          <a href="#connection-sources" className="btn">
            <Icon name="grid" size={13} />
            Browse all sources
          </a>
        </div>
      </div>
    </div>
  );
}
