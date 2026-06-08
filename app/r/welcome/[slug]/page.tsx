import { prisma } from "@/lib/db/client";
import { decrypt } from "@/lib/crypto/envelope";
import { logger } from "@/lib/logger";
import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata = {
  title: "Welcome",
  // Don't index per-listing welcome pages. They contain WiFi credentials —
  // those should never appear in search results.
  robots: { index: false, follow: false },
};

/**
 * Welcome flow — what an Airbnb guest sees on arrival when they tap the
 * NFC card or scan the QR plaque set to this URL.
 *
 * Renders:
 *   1. Listing display name + a warm greeting
 *   2. WiFi credentials (SSID + password, password decrypted server-side
 *      and rendered as plain text — guests need to retype it on their
 *      device's WiFi settings)
 *   3. House rules (free-text the host saved in onboarding)
 *   4. Local recommendations (JSON array the host curated)
 *   5. A small "leave a review" CTA at the bottom (NOT the primary action
 *      — guests just arrived, they're not reviewing yet)
 *
 * Security:
 *   - We DECRYPT the WiFi password server-side per request. Decrypted
 *     plaintext lives in the rendered HTML, so any guest who scans the
 *     QR/NFC sees it. That's the intended behavior — it's their WiFi
 *     password — but it means anyone with the slug can see the WiFi
 *     password. Which is exactly what an Airbnb host shares anyway.
 *   - We do not log the decrypted password.
 *   - The route is force-dynamic so caches never store the password.
 *   - HTTP response sets Cache-Control: no-store via Next's default for
 *     dynamic pages.
 *
 * Mobile-first inline styles (zero CSS deps) — this page is hit by
 * guests on cellular data who haven't loaded our main bundle yet.
 */

type LocalRec = {
  category?: string;
  name?: string;
  note?: string;
  url?: string;
};

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function WelcomePage({ params }: PageProps) {
  const { slug: raw } = await params;
  const slug = raw.toUpperCase().slice(0, 10);

  if (!/^[0-9A-HJKMNP-TV-Z]{10}$/.test(slug)) {
    notFound();
  }

  const device = await prisma.device.findUnique({
    where: { shortSlug: slug },
    select: {
      id: true,
      status: true,
      organizationId: true,
      establishment: {
        select: {
          id: true,
          name: true,
          kind: true,
          houseRules: true,
          wifiSsid: true,
          wifiPasswordCt: true,
          wifiPasswordIv: true,
          localRecommendations: true,
        },
      },
    },
  });

  if (!device || device.status !== "active" || !device.establishment) {
    notFound();
  }

  const e = device.establishment;

  // Decrypt the WiFi password if present. Encryption context must match
  // what onboarding wrote (orgId/provider="wifi"/purpose="general").
  let wifiPassword: string | null = null;
  if (e.wifiPasswordCt && e.wifiPasswordIv && device.organizationId) {
    try {
      wifiPassword = decrypt({
        ciphertext: Buffer.from(e.wifiPasswordCt),
        iv: Buffer.from(e.wifiPasswordIv),
        dekCiphertext: Buffer.alloc(0),
        keyVersion: 1,
        encryptionContext: {
          orgId: device.organizationId,
          provider: "wifi",
          purpose: "general",
        },
      });
    } catch (err) {
      // Decryption failure is non-fatal — the page renders without the
      // password, with a "ask the host" fallback. Common causes: master
      // key rotated, ciphertext truncated. Never expose the error to the
      // guest; log it for ops triage.
      logger.warn(
        {
          slug,
          establishmentId: e.id,
          err: err instanceof Error ? err.message : String(err),
          event: "welcome.wifi_decrypt_failed",
        },
        "WiFi password decrypt failed; rendering without it",
      );
    }
  }

  const recs = Array.isArray(e.localRecommendations)
    ? (e.localRecommendations as unknown as LocalRec[]).filter(
        (r) => r && typeof r === "object" && (r.name || r.note),
      )
    : [];

  return (
    <main style={shellStyle}>
      <div style={panelStyle}>
        <header style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 44, marginBottom: 4 }} aria-hidden>
            👋
          </div>
          <h1 style={titleStyle}>Welcome to {e.name}</h1>
          <p style={subtitleStyle}>Everything you need for your stay.</p>
        </header>

        {(e.wifiSsid || wifiPassword) && (
          <section style={cardStyle} aria-labelledby="wifi-heading">
            <h2 id="wifi-heading" style={cardTitleStyle}>
              <span aria-hidden style={{ marginRight: 6 }}>📶</span>
              Wi-Fi
            </h2>
            {e.wifiSsid && (
              <KvRow label="Network" value={e.wifiSsid} copyable />
            )}
            {wifiPassword ? (
              <KvRow label="Password" value={wifiPassword} copyable mono />
            ) : e.wifiPasswordCt ? (
              <p style={fallbackStyle}>
                The Wi-Fi password is configured but couldn&rsquo;t be displayed.
                Please ask your host.
              </p>
            ) : null}
          </section>
        )}

        {e.houseRules && (
          <section style={cardStyle} aria-labelledby="rules-heading">
            <h2 id="rules-heading" style={cardTitleStyle}>
              <span aria-hidden style={{ marginRight: 6 }}>📋</span>
              House notes
            </h2>
            <p style={bodyTextStyle}>{e.houseRules}</p>
          </section>
        )}

        {recs.length > 0 && (
          <section style={cardStyle} aria-labelledby="recs-heading">
            <h2 id="recs-heading" style={cardTitleStyle}>
              <span aria-hidden style={{ marginRight: 6 }}>🗺️</span>
              The host recommends
            </h2>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {recs.slice(0, 8).map((r, i) => (
                <li
                  // biome-ignore lint/suspicious/noArrayIndexKey: recs is host-curated, stable order
                  key={`rec-${i}`}
                  style={{
                    padding: "10px 0",
                    borderBottom:
                      i < Math.min(recs.length, 8) - 1 ? "1px solid #eef1f6" : "none",
                  }}
                >
                  {r.category && (
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: "#94a3b8",
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                      }}
                    >
                      {r.category}
                    </div>
                  )}
                  <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>
                    {r.url ? (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#0b0d0e", textDecoration: "none" }}
                      >
                        {r.name ?? r.url} ↗
                      </a>
                    ) : (
                      r.name
                    )}
                  </div>
                  {r.note && (
                    <div
                      style={{ fontSize: 13, color: "#475569", marginTop: 2, lineHeight: 1.5 }}
                    >
                      {r.note}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Subtle review-on-checkout CTA. Not the primary action; guests
            just arrived. */}
        {e.kind === "airbnb_listing" && (
          <p style={ctaFooterStyle}>
            Checking out? <Link href={`/r/pick/${slug}`} style={{ color: "#2563eb", fontWeight: 500 }}>Leave a review →</Link>
          </p>
        )}

        <p style={brandFooterStyle}>
          via{" "}
          <Link href="/" style={{ color: "#94a3b8", textDecoration: "none" }}>
            repulabs.com
          </Link>
        </p>
      </div>
    </main>
  );
}

function KvRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  copyable?: boolean; // accepted for prop-shape compatibility; tap-hold suffices on mobile
  mono?: boolean;
}) {
  return (
    <div style={kvRowStyle}>
      <div style={kvLabelStyle}>{label}</div>
      <div
        style={{
          ...kvValueStyle,
          fontFamily: mono
            ? "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
            : "inherit",
          // Make long passwords wrap rather than overflow. iOS Safari +
          // Android both honor tap-and-hold to select; we deliberately
          // don't pull in a client-component boundary for a copy button.
          wordBreak: "break-all",
          userSelect: "all",
          WebkitUserSelect: "all",
        }}
      >
        {value}
      </div>
    </div>
  );
}

// =========================================================================
// Inline styles — kept here so this server-rendered page has zero CSS
// dependencies. The whole page should fit in <8KB of HTML.
// =========================================================================

const shellStyle: React.CSSProperties = {
  minHeight: "100vh",
  background:
    "radial-gradient(at 0% 0%, rgba(37, 99, 235, 0.06) 0%, transparent 40%), " +
    "radial-gradient(at 100% 100%, rgba(79, 70, 229, 0.07) 0%, transparent 50%), " +
    "linear-gradient(180deg, #f7f8fb 0%, #eef1f6 100%)",
  padding: "28px 18px 40px",
  fontFamily:
    "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  color: "#0f172a",
};

const panelStyle: React.CSSProperties = {
  maxWidth: 480,
  width: "100%",
  marginInline: "auto",
};

const titleStyle: React.CSSProperties = {
  fontSize: 26,
  fontWeight: 700,
  letterSpacing: "-0.025em",
  margin: 0,
  lineHeight: 1.15,
};

const subtitleStyle: React.CSSProperties = {
  fontSize: 14,
  color: "#475569",
  marginTop: 8,
};

const cardStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #eef1f6",
  borderRadius: 16,
  padding: 18,
  marginBottom: 14,
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04), 0 0 0 1px rgba(15, 23, 42, 0.04)",
};

const cardTitleStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  margin: "0 0 14px",
  display: "flex",
  alignItems: "center",
};

const kvRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "10px 0",
  borderBottom: "1px solid #f3f5f9",
};

const kvLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#94a3b8",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  fontWeight: 600,
  width: 80,
  flexShrink: 0,
};

const kvValueStyle: React.CSSProperties = {
  fontSize: 14,
  flex: 1,
  minWidth: 0,
  color: "#0b0d0e",
};

const copyButtonStyle: React.CSSProperties = {
  background: "#f1f5f9",
  border: "1px solid #e2e8f0",
  borderRadius: 6,
  padding: "4px 10px",
  fontSize: 11,
  fontWeight: 600,
  color: "#0f172a",
  cursor: "pointer",
};

const fallbackStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#a16207",
  background: "#fef3c7",
  padding: "8px 10px",
  borderRadius: 8,
  margin: 0,
};

const bodyTextStyle: React.CSSProperties = {
  fontSize: 14,
  lineHeight: 1.6,
  color: "#1e2225",
  margin: 0,
  whiteSpace: "pre-wrap",
};

const ctaFooterStyle: React.CSSProperties = {
  textAlign: "center",
  marginTop: 18,
  fontSize: 13,
  color: "#475569",
};

const brandFooterStyle: React.CSSProperties = {
  marginTop: 22,
  textAlign: "center",
  fontSize: 11,
  color: "#94a3b8",
};
