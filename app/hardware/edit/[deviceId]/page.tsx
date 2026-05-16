import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/shell/icon";
import { QrCode } from "@/components/shell/qr-code";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import {
  deleteDevice,
  updateDeviceRedirectUrl,
} from "@/lib/hardware/actions";
import { googleReviewUrl } from "@/lib/hardware/codes";
import Link from "next/link";
import { notFound } from "next/navigation";

/**
 * Per-device edit page.
 *
 * Lets the user:
 *   - See the current redirect URL (where the QR sends scanners)
 *   - Update it (e.g., paste their Google review form URL)
 *   - Auto-fill from the establishment's Google Place ID (if set)
 *   - Soft-delete the QR
 *
 * Re-signs the slug signature on update so the HMAC check in /r/[slug] passes.
 */

export const dynamic = "force-dynamic";

const SHOPIFY_URL = process.env.NEXT_PUBLIC_SHOPIFY_STORE_URL ?? "https://repulabs.com.au";

function publicQrUrl(slug: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://repulabs.com";
  return `${base}/r/${slug}`;
}

export default async function EditDevicePage({
  params,
  searchParams,
}: {
  params: Promise<{ deviceId: string }>;
  searchParams: Promise<{ updated?: string }>;
}) {
  const { deviceId } = await params;
  const sp = await searchParams;
  const { orgId } = await getOrgContext();

  // Validate UUID shape upfront so a bad URL doesn't pollute the SQL.
  if (!/^[0-9a-f-]{36}$/i.test(deviceId)) notFound();

  const device = await withTenant(orgId, async (tx) =>
    tx.device.findFirst({
      where: { id: deviceId },
      include: { establishment: true },
    }),
  );
  if (!device) notFound();

  // Derive a suggested review URL from the establishment's googlePlaceId — if
  // set, this is the "correct" Google review form for the business.
  const suggestedUrl = device.establishment
    ? googleReviewUrl(device.establishment.googlePlaceId, device.establishment.name)
    : null;
  const hasPlaceId =
    !!device.establishment?.googlePlaceId &&
    device.establishment.googlePlaceId.length > 5;

  return (
    <AppShellServer
      topBar={<TopBar />}
      crumbs={["Workspace", "QR Codes", device.shortSlug]}
    >
      <PageHeader
        kicker={`QR code · ${device.shortSlug}`}
        title="Configure this QR code"
        description={
          device.establishment
            ? `Set where this QR sends scanners. Bound to ${device.establishment.name}.`
            : "Set where this QR sends scanners."
        }
        actions={
          <Link href="/hardware" className="btn">
            <Icon name="chevL" size={12} />
            Back to QR codes
          </Link>
        }
      />

      {sp.updated && (
        <div
          className="ds-card ds-card--pri"
          style={{ padding: "10px 14px", marginBottom: 16, fontSize: 12.5 }}
        >
          <span style={{ color: "var(--ok)", marginRight: 8 }}>✓</span>
          Redirect updated. Scans now route to the new URL immediately.
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "320px minmax(0, 1fr)",
          gap: 16,
        }}
      >
        {/* Left: QR preview */}
        <div className="ds-card" style={{ padding: 18 }}>
          <h3 className="ds-card__title">Preview</h3>
          <div className="ds-card__sub" style={{ marginBottom: 14 }}>
            Code <span className="mono">{device.shortSlug}</span>
          </div>

          <div
            style={{
              aspectRatio: 1,
              background: "#fff",
              border: "1px solid var(--line)",
              borderRadius: 12,
              padding: 20,
              display: "grid",
              placeItems: "center",
            }}
          >
            <QrCode value={publicQrUrl(device.shortSlug)} size={250} />
          </div>

          <div className="row" style={{ marginTop: 12, gap: 6 }}>
            <a
              href={`/api/devices/${device.id}/qr?format=png`}
              download={`repulabs-${device.shortSlug}.png`}
              className="btn btn--sm btn--pri"
              style={{ flex: 1, justifyContent: "center", textDecoration: "none" }}
            >
              <Icon name="download" size={11} />
              PNG
            </a>
            <a
              href={`/api/devices/${device.id}/qr?format=svg`}
              download={`repulabs-${device.shortSlug}.svg`}
              className="btn btn--sm"
              style={{ flex: 1, justifyContent: "center", textDecoration: "none" }}
            >
              <Icon name="download" size={11} />
              SVG
            </a>
          </div>

          <div
            className="mono dim"
            style={{
              fontSize: 10,
              marginTop: 12,
              textAlign: "center",
              wordBreak: "break-all",
            }}
          >
            {publicQrUrl(device.shortSlug)}
          </div>
        </div>

        {/* Right: edit form */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Current redirect status */}
          <div className="ds-card" style={{ padding: 18 }}>
            <h3 className="ds-card__title">Where scans go now</h3>
            <div
              style={{
                marginTop: 10,
                padding: "10px 12px",
                background: "var(--surface-2, #fafbf8)",
                border: "1px solid var(--line)",
                borderRadius: 9,
                fontFamily: "var(--f-mono)",
                fontSize: 11.5,
                color: "var(--ink-2)",
                wordBreak: "break-all",
              }}
            >
              {device.redirectUrl ?? (
                <span style={{ color: "var(--warn, #a16207)" }}>
                  ⚠ Not configured yet — scans go to a generic "not activated" page until you set a URL below.
                </span>
              )}
            </div>
          </div>

          {/* Update form */}
          <div className="ds-card" style={{ padding: 18 }}>
            <h3 className="ds-card__title">Change the redirect URL</h3>
            <p
              style={{
                fontSize: 13,
                color: "var(--rl-muted)",
                marginTop: 6,
                marginBottom: 14,
                lineHeight: 1.55,
              }}
            >
              Paste your Google review link below. To get yours: open Google Business
              Profile → Customers → Reviews → "Share review form" → copy the link.
            </p>

            <form
              action={updateDeviceRedirectUrl}
              style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
              <input type="hidden" name="deviceId" value={device.id} />
              <label
                style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-2)" }}
              >
                Google review URL
                <input
                  type="url"
                  name="redirectUrl"
                  required
                  defaultValue={device.redirectUrl ?? suggestedUrl ?? ""}
                  placeholder="https://search.google.com/local/writereview?placeid=..."
                  style={{
                    marginTop: 6,
                    width: "100%",
                    padding: "10px 12px",
                    border: "1px solid var(--line)",
                    borderRadius: 9,
                    fontSize: 13,
                    background: "var(--surface)",
                    fontFamily: "var(--f-mono)",
                  }}
                />
              </label>

              <div className="row" style={{ gap: 8, marginTop: 4 }}>
                <button type="submit" className="btn btn--pri">
                  <Icon name="check" size={12} />
                  Save redirect URL
                </button>
                {hasPlaceId && suggestedUrl ? (
                  <span
                    style={{
                      fontSize: 11.5,
                      color: "var(--rl-muted)",
                      alignSelf: "center",
                    }}
                  >
                    Tip: leave default to use your{" "}
                    <strong style={{ color: "var(--ink-2)" }}>Google Place ID</strong> link.
                  </span>
                ) : (
                  <Link
                    href={`/establishments/${device.establishmentId ?? ""}`}
                    style={{
                      fontSize: 11.5,
                      color: "var(--pri, #2563eb)",
                      alignSelf: "center",
                      textDecoration: "none",
                    }}
                  >
                    No Place ID set — add it on your establishment page →
                  </Link>
                )}
              </div>
            </form>
          </div>

          {/* Where to find your Google review URL */}
          <div className="ds-card" style={{ padding: 18 }}>
            <h3 className="ds-card__title">How to find your Google review link</h3>
            <ol
              style={{
                marginTop: 10,
                paddingLeft: 22,
                fontSize: 13,
                color: "var(--ink-2)",
                lineHeight: 1.7,
              }}
            >
              <li>
                Open{" "}
                <a
                  href="https://business.google.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--pri)" }}
                >
                  Google Business Profile
                </a>{" "}
                and pick your business.
              </li>
              <li>
                Go to <strong>Customers → Reviews</strong>.
              </li>
              <li>
                Click <strong>"Share review form"</strong> (sometimes labelled "Get more
                reviews").
              </li>
              <li>Copy the link Google gives you. Paste it above. Save.</li>
            </ol>
            <p
              style={{
                marginTop: 12,
                fontSize: 12.5,
                color: "var(--rl-muted)",
                lineHeight: 1.55,
              }}
            >
              The link looks like{" "}
              <code
                className="mono"
                style={{
                  background: "var(--surface-2)",
                  padding: "1px 6px",
                  borderRadius: 4,
                  fontSize: 11,
                }}
              >
                https://g.page/r/...
              </code>{" "}
              or{" "}
              <code
                className="mono"
                style={{
                  background: "var(--surface-2)",
                  padding: "1px 6px",
                  borderRadius: 4,
                  fontSize: 11,
                }}
              >
                https://search.google.com/local/writereview?placeid=...
              </code>
              — both work.
            </p>
          </div>

          {/* Delete */}
          <div
            className="ds-card"
            style={{
              padding: 18,
              border: "1px solid #fecaca",
              background: "#fef2f2",
            }}
          >
            <h3
              className="ds-card__title"
              style={{ color: "#7f1d1d", marginBottom: 4 }}
            >
              Delete this QR code
            </h3>
            <p
              style={{
                fontSize: 12.5,
                color: "#991b1b",
                marginTop: 6,
                marginBottom: 14,
                lineHeight: 1.55,
              }}
            >
              Soft-delete. After deletion, any future scans of this QR will show the
              "not activated" page. The audit log keeps a record. If you've printed
              this QR on a plaque, scans will no longer route reviewers anywhere
              useful — recreate it under a new code or restore via support.
            </p>
            <form action={deleteDevice}>
              <input type="hidden" name="deviceId" value={device.id} />
              <button
                type="submit"
                className="btn"
                style={{
                  background: "#b91c1c",
                  color: "#fff",
                  borderColor: "#7f1d1d",
                }}
              >
                <Icon name="trash" size={12} />
                Delete QR code permanently
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Footer help link to shopify */}
      <div
        style={{
          marginTop: 24,
          padding: 14,
          textAlign: "center",
          color: "var(--rl-muted)",
          fontSize: 12,
        }}
      >
        Want to print this on a physical plaque or stand?{" "}
        <a
          href={SHOPIFY_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--pri)", textDecoration: "none" }}
        >
          Shop the hardware line →
        </a>
      </div>
    </AppShellServer>
  );
}
