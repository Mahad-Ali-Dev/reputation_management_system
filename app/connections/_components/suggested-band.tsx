/**
 * Band 1 — "Suggested for you" (presentational, server-safe).
 *
 * Connections the onboarding orchestrator detected from the business website
 * (Google / Yelp / Facebook profile links found while crawling). Rendered as
 * one-click Connect cards that deep-link straight to the provider's connect
 * flow (OAuth authorize route, or the api-key/manage detail page).
 *
 * This component is PURELY presentational — it receives pre-resolved, JSON-safe
 * `SuggestedCard[]` from the server page (which read the latest OnboardingRun
 * fail-soft) and renders links only. No client state, no DB access. The page
 * hides the whole band when there are no suggestions, so this never renders an
 * empty shell.
 */

import { BrandLogo } from "@/components/shell/brand-logo";
import { Icon } from "@/components/shell/icon";
import Link from "next/link";
import { META_APP_UNDER_REVIEW, MetaReviewModal } from "./meta-review-modal";

/** One resolved suggestion the page hands to this band. JSON-safe. */
export type SuggestedCard = {
  /** Catalog provider id used for the logo + connect link (e.g. google_business). */
  providerId: string;
  /** Display name for the card (e.g. "Google Business Profile"). */
  displayName: string;
  /** Where the orchestrator found it ("footer link", "contact page", …). */
  source: string | null;
  /** The detected public URL (shown as a sub-detail, never auto-followed). */
  detectedUrl: string | null;
  /** Resolved connect destination (authorize route or manage detail page). */
  connectHref: string;
  /** OAuth authorize routes must not be prefetched (they redirect). */
  prefetch: boolean;
  /** True once this provider already has an active connection (show "Connected"). */
  alreadyConnected: boolean;
};

export function SuggestedBand({ cards }: { cards: SuggestedCard[] }) {
  // Defensive: the page already hides the band when empty, but never render a
  // bare header with no cards.
  if (cards.length === 0) return null;

  return (
    <section aria-labelledby="band-suggested" className="ds-card" style={{ overflow: "hidden" }}>
      <div className="ds-card__head">
        <div className="row" style={{ gap: 12, minWidth: 0 }}>
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
              flexShrink: 0,
            }}
          >
            <Icon name="sparkle" size={15} />
          </span>
          <div style={{ minWidth: 0 }}>
            <h3 id="band-suggested" className="ds-card__title">
              Suggested for you
            </h3>
            <div className="ds-card__sub">
              We spotted these on your website during setup connect in one click.
            </div>
          </div>
        </div>
        <span className="chip chip--pri" style={{ fontSize: 11 }}>
          {cards.length} found
        </span>
      </div>

      <div className="ds-card__body" style={{ padding: 16 }}>
        <div className="grid-3" style={{ gap: 12 }}>
          {cards.map((card) => (
            <div
              key={card.providerId}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                padding: 16,
                borderRadius: 12,
                border: "1px solid var(--line)",
                background: "var(--surface-2)",
              }}
            >
              <div className="row" style={{ gap: 10 }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: 38,
                    height: 38,
                    flexShrink: 0,
                    borderRadius: 9,
                    background: "var(--surface)",
                    border: "1px solid var(--line)",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <BrandLogo provider={card.providerId} size={21} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--ink)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {card.displayName}
                  </div>
                  {card.source && (
                    <div className="dim-2" style={{ fontSize: 10.5 }}>
                      Found via {card.source}
                    </div>
                  )}
                </div>
              </div>

              {card.detectedUrl && (
                <div
                  className="dim mono"
                  style={{
                    fontSize: 10.5,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={card.detectedUrl}
                >
                  {card.detectedUrl.replace(/^https?:\/\//, "")}
                </div>
              )}

              <div style={{ marginTop: "auto", paddingTop: 4 }}>
                {card.alreadyConnected ? (
                  <span className="chip chip--ok" style={{ fontSize: 11 }}>
                    <span className="dot" />
                    Connected
                  </span>
                ) : card.providerId === "meta" && META_APP_UNDER_REVIEW ? (
                  <MetaReviewModal triggerClassName="btn btn--xs btn--pri" triggerLabel="Connect" />
                ) : (
                  <Link
                    href={card.connectHref}
                    className="btn btn--xs btn--pri"
                    prefetch={card.prefetch ? undefined : false}
                  >
                    Connect
                    <Icon name="arrowR" size={11} />
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
