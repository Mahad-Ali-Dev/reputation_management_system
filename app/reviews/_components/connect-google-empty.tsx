import { Icon } from "@/components/shell/icon";
import Image from "next/image";
import Link from "next/link";

/**
 * Connection-aware empty state for the review feed (Module 06).
 *
 * Pure presentation — the `hasGoogle` check is done in the page via
 * `hasActiveGoogleConnection(orgId)`. Two states:
 *   - no Google connection → prompt to connect Google Business (primary CTA
 *     to /connections), using the brand integrations illustration
 *   - connected but no reviews → reassuring "syncing" copy
 *
 * (When Module 01 lands a canonical connection-aware control this refactors to
 * consume it; for now it's page-local.)
 */
export function ConnectGoogleEmpty({ hasGoogle }: { hasGoogle: boolean }) {
  if (!hasGoogle) {
    return (
      <div className="ds-card" style={{ padding: 40, textAlign: "center" }}>
        <Image
          src="/assets/repulabs/illustrations/integrations-empty.svg"
          alt=""
          width={160}
          height={120}
          style={{ display: "inline-block", height: "auto" }}
          priority={false}
        />
        <h3 style={{ fontSize: 16, fontWeight: 600, margin: "14px 0 4px" }}>
          Connect Google Business
        </h3>
        <p
          className="dim"
          style={{ fontSize: 13, margin: "0 auto 18px", maxWidth: 380, lineHeight: 1.55 }}
        >
          Link your Google Business Profile to pull reviews into one queue and let AI draft replies
          you approve. Reviews appear within 15 minutes of connecting.
        </p>
        <Link href="/connections" className="btn btn--pri">
          <Icon name="plug" size={12} />
          Connect Google Business
        </Link>
      </div>
    );
  }

  return (
    <div className="ds-card" style={{ padding: 40, textAlign: "center" }}>
      <Image
        src="/assets/repulabs/illustrations/reviews-empty.svg"
        alt=""
        width={160}
        height={120}
        style={{ display: "inline-block", height: "auto" }}
        priority={false}
      />
      <h3 style={{ fontSize: 15, fontWeight: 600, margin: "14px 0 4px" }}>No reviews yet</h3>
      <p className="dim" style={{ fontSize: 12.5, margin: 0 }}>
        Reviews sync from Google within 15 minutes of being posted.
      </p>
    </div>
  );
}
