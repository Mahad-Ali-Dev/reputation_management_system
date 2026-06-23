import Link from "next/link";
import "../review-feed.css";

/*
 * Illustrations are heavy raster-in-SVG exports from the design kit. We render
 * them with a plain <img> (not next/image) so they bypass the image optimizer —
 * the project's next.config has no `images.dangerouslyAllowSVG`, and these are
 * decorative assets where optimization buys nothing. width/height keep CLS low.
 */

/**
 * Connection-aware empty state for the Review Inbox (Module 06), rebuilt to the
 * "Review Feed" design kit (designs/Review Feed). Pure presentation — the
 * `hasGoogle` check is done in the page via `hasActiveGoogleConnection(orgId)`.
 *
 * Two states:
 *   - no Google connection → the kit's "All caught up!" empty card: gradient
 *     illustration hero, copy, green "~15 minutes" pill, "Connect Google
 *     Business" gradient CTA → the real Google connect flow
 *     (/connections/google_business), and the 3-item benefit strip.
 *   - connected but no reviews → reassuring "syncing" state, same card chrome.
 *
 * The primary CTA points at the live Google connect entry. The kit only
 * specifies the empty state; the populated feed (filters, AI-draft composer,
 * approve/publish, deep links) lives in app/reviews/page.tsx and is unchanged.
 */

/** Live Google Business connect flow (provider detail → OAuth authorize). */
const GOOGLE_CONNECT_HREF = "/connections/google_business";

const BENEFITS = [
  {
    icon: "/assets/repulabs/review-feed/queue.svg",
    tint: "rf-benefit__icon--purple",
    title: "One queue",
    body: "All reviews in one place",
  },
  {
    icon: "/assets/repulabs/review-feed/ai.svg",
    tint: "rf-benefit__icon--blue",
    title: "AI drafts replies",
    body: "Save time with smart suggestions",
  },
  {
    icon: "/assets/repulabs/review-feed/control.svg",
    tint: "rf-benefit__icon--green",
    title: "You stay in control",
    body: "Approve before it goes live",
  },
] as const;

function BenefitStrip() {
  return (
    <div className="rf-benefits">
      {BENEFITS.map((b) => (
        <div key={b.title} className="rf-benefit">
          <span className={`rf-benefit__icon ${b.tint}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={b.icon} alt="" width={38} height={38} />
          </span>
          <h3 className="rf-benefit__title">{b.title}</h3>
          <p className="rf-benefit__body">{b.body}</p>
        </div>
      ))}
    </div>
  );
}

export function ConnectGoogleEmpty({ hasGoogle }: { hasGoogle: boolean }) {
  if (!hasGoogle) {
    return (
      <div className="rf">
        <section className="rf-card">
          <div className="rf-hero">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/assets/repulabs/review-feed/review-inbox.svg"
              alt="An empty review inbox"
              width={420}
              height={420}
              className="rf-hero__art"
            />
          </div>

          <div className="rf-body">
            <h2 className="rf-body__title">
              All caught up!{" "}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/assets/repulabs/review-feed/party-icon.svg"
                alt=""
                width={26}
                height={26}
                style={{ display: "inline-block", verticalAlign: "-4px" }}
              />
            </h2>
            <p className="rf-body__text">
              Link your Google Business Profile to pull reviews into one queue and let AI draft
              replies you approve.
            </p>
            <span className="rf-pill">
              <svg
                width={14}
                height={14}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
              ~15 minutes of connecting
            </span>

            <div>
              <Link href={GOOGLE_CONNECT_HREF} className="rf-cta">
                <svg
                  width={20}
                  height={20}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M9 15 15 9" />
                  <path d="M10.5 6.5 12 5a4 4 0 0 1 5.7 5.7l-1.5 1.5" />
                  <path d="M13.5 17.5 12 19a4 4 0 0 1-5.7-5.7l1.5-1.5" />
                </svg>
                Connect Google Business
                <svg
                  className="rf-cta__arrow"
                  width={20}
                  height={20}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 12h14" />
                  <path d="m13 6 6 6-6 6" />
                </svg>
              </Link>
            </div>
          </div>

          <BenefitStrip />
        </section>
      </div>
    );
  }

  // Connected, but no reviews have synced yet — same card chrome, reassuring copy.
  return (
    <div className="rf">
      <section className="rf-card">
        <div className="rf-syncing">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/repulabs/review-feed/review-inbox.svg"
            alt="An empty review inbox"
            width={264}
            height={264}
            className="rf-syncing__art"
          />
          <h2 className="rf-syncing__title">All caught up!</h2>
          <p className="rf-syncing__text">
            Your Google Business Profile is connected. New reviews sync into this queue within ~15
            minutes of being posted — AI will draft replies for you to approve.
          </p>
        </div>
        <BenefitStrip />
      </section>
    </div>
  );
}
