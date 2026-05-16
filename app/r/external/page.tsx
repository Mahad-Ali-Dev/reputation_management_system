import { isAllowedReviewHost, isStorableRedirectUrl } from "@/lib/hardware/codes";
import { logger } from "@/lib/logger";
import Link from "next/link";

/**
 * Interstitial for non-Google review destinations.
 *
 * Why this exists: `/r/{slug}` redirects to user-configured URLs. If we let
 * any URL through unattended, repulabs.com becomes a free first-hop for
 * phishing campaigns ("trust me, the link is on repulabs.com"). Bot-driven
 * phishing breaks the moment a human click is required.
 *
 * For known Google review hosts (`google.com`, `g.page`, `goo.gl`), `/r/{slug}`
 * 302s straight through — no interstitial. Everything else lands here.
 *
 * Security notes:
 *   - We `isStorableRedirectUrl` the `to` param to reject javascript:/data:/IP
 *     literals at render time even though storage-side validation already did.
 *   - `rel="noopener noreferrer"` on the link strips the Referer header so the
 *     destination doesn't learn the scanning user's repulabs slug.
 *   - The link uses `target="_self"` (default) — we want the user to leave
 *     repulabs.com, not have it open in a new tab.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SearchParams = Promise<{ slug?: string; to?: string }>;

export default async function ExternalRedirectInterstitial({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const to = typeof sp.to === "string" ? sp.to : "";
  const slug = typeof sp.slug === "string" ? sp.slug.toUpperCase() : null;

  // If somehow we got here for an allowlisted host (e.g., crawler hand-crafted
  // the URL), bounce straight through. The redirect happens client-side via a
  // meta refresh below — server-side redirect would be cleaner, but server
  // components can't redirect mid-render without throwing. Keep the page
  // honest: only allow this fast path for actual allowlisted destinations.
  const allowlisted = to && isAllowedReviewHost(to);

  // Defensive: render an error if the URL is malformed or blocked.
  const valid = to && isStorableRedirectUrl(to);
  if (!valid) {
    logger.warn({ slug, to: to.slice(0, 200), event: "interstitial.invalid_url" });
    return (
      <main
        style={{
          maxWidth: 520,
          margin: "10vh auto",
          padding: "32px 24px",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>
          That destination isn&rsquo;t valid
        </h1>
        <p style={{ fontSize: 14, lineHeight: 1.55, color: "#475569" }}>
          The QR you scanned points at a URL we can&rsquo;t safely open. If you own this QR, sign in
          to repulabs.com and update its destination.
        </p>
        <p style={{ marginTop: 18 }}>
          <Link href="/" style={{ color: "#2563eb", textDecoration: "none", fontSize: 14 }}>
            Go to repulabs.com →
          </Link>
        </p>
      </main>
    );
  }

  // Parse the host for display. We've already validated isStorableRedirectUrl
  // so `new URL` won't throw, but be defensive anyway.
  let host = "";
  try {
    host = new URL(to).host;
  } catch {
    host = "(unknown)";
  }

  return (
    <main
      style={{
        maxWidth: 520,
        margin: "10vh auto",
        padding: "32px 24px",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      <div
        style={{
          padding: "10px 14px",
          background: "#fef3c7",
          color: "#92400e",
          border: "1px solid #fde68a",
          borderRadius: 8,
          fontSize: 13,
          lineHeight: 1.55,
          marginBottom: 18,
        }}
      >
        <strong>You&rsquo;re leaving repulabs.com.</strong> This QR points at a non-Google
        destination &mdash; verify the URL below before continuing.
      </div>

      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 6px" }}>
        Continue to external site?
      </h1>
      <p style={{ fontSize: 13, color: "#475569", margin: 0 }}>Destination host:</p>
      <p
        style={{
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          fontSize: 15,
          background: "#f1f5f9",
          padding: "8px 12px",
          borderRadius: 6,
          margin: "6px 0 14px",
          wordBreak: "break-all",
        }}
      >
        {host}
      </p>
      <p
        style={{
          fontSize: 11,
          color: "#64748b",
          margin: "0 0 18px",
          wordBreak: "break-all",
        }}
      >
        Full URL: <span style={{ fontFamily: "ui-monospace, monospace" }}>{to}</span>
      </p>

      <div style={{ display: "flex", gap: 10 }}>
        <a
          href={to}
          rel="noopener noreferrer"
          style={{
            flex: 1,
            padding: "12px 16px",
            background: "#2563eb",
            color: "#fff",
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 14,
            textAlign: "center",
            textDecoration: "none",
          }}
        >
          Continue
        </a>
        <Link
          href="/"
          style={{
            flex: 1,
            padding: "12px 16px",
            background: "#f1f5f9",
            color: "#0f172a",
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 14,
            textAlign: "center",
            textDecoration: "none",
          }}
        >
          Cancel
        </Link>
      </div>

      {allowlisted && (
        <p
          style={{
            fontSize: 11,
            color: "#94a3b8",
            marginTop: 16,
            textAlign: "center",
          }}
        >
          (This destination is a known review host &mdash; verification shown for transparency.)
        </p>
      )}

      <p
        style={{
          fontSize: 11,
          color: "#94a3b8",
          marginTop: 28,
          textAlign: "center",
        }}
      >
        repulabs.com only shows this page when a QR points outside the standard Google review
        domains. We never auto-redirect to third-party sites.
      </p>
    </main>
  );
}
