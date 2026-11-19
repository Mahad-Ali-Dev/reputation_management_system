import { AppShellServer } from "@/components/app-shell-server";
import { QrCode } from "@/components/shell/qr-code";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import { deleteDevice, updateDeviceRedirectUrl } from "@/lib/hardware/actions";
import { googleReviewUrl } from "@/lib/hardware/codes";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleCheck,
  Download,
  Link2,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import "./configure.css";

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
  // Retired devices stay in the DB for audit history but the user can't
  // re-edit them. Send them back to the list.
  if (device.status === "retired") {
    notFound();
  }

  // Derive a suggested review URL from the establishment's googlePlaceId — if
  // set, this is the "correct" Google review form for the business.
  const suggestedUrl = device.establishment
    ? googleReviewUrl(device.establishment.googlePlaceId, device.establishment.name)
    : null;
  const hasPlaceId =
    !!device.establishment?.googlePlaceId && device.establishment.googlePlaceId.length > 5;

  const scanUrl = publicQrUrl(device.shortSlug);
  const live = !!device.redirectUrl;

  return (
    <AppShellServer
      topBar={<TopBar />}
      crumbs={["Business Setup", "Device Manager", device.shortSlug]}
    >
      <div className="qcfg">
        {/* ---- Header: back link, title, live status ---- */}
        <Link href="/hardware" className="qcfg__back">
          <ArrowLeft size={15} strokeWidth={2} aria-hidden="true" />
          Device Manager
        </Link>
        <header className="qcfg__head">
          <div>
            <h1 className="qcfg__title">Configure this QR code</h1>
            <p className="qcfg__sub">
              {device.establishment
                ? `Choose where scans go. Linked to ${device.establishment.name}.`
                : "Choose where scans go."}
            </p>
          </div>
          <span className={`qcfg__status${live ? " is-live" : ""}`}>
            <span className="qcfg__dot" aria-hidden="true" />
            {live ? "Live" : "Not set up"}
          </span>
        </header>

        {sp.updated && (
          <output className="qcfg__toast">
            <CircleCheck size={16} strokeWidth={2} aria-hidden="true" />
            Saved. Scans now go to the new link straight away.
          </output>
        )}

        <div className="qcfg__grid">
          {/* ---- Left: QR preview ---- */}
          <aside className="qcfg__card qcfg__preview" aria-label="QR preview">
            <div className="qcfg__qr">
              <QrCode value={scanUrl} size={232} />
            </div>
            <div className="qcfg__code">
              <span>Code</span>
              <b className="mono">{device.shortSlug}</b>
            </div>
            <div className="qcfg__dl">
              <a
                href={`/api/devices/${device.id}/qr?format=png`}
                download={`repulabs-${device.shortSlug}.png`}
                className="qcfg__btn qcfg__btn--pri"
              >
                <Download size={15} strokeWidth={2} aria-hidden="true" />
                Download PNG
              </a>
              <a
                href={`/api/devices/${device.id}/qr?format=svg`}
                download={`repulabs-${device.shortSlug}.svg`}
                className="qcfg__btn"
              >
                <Download size={15} strokeWidth={2} aria-hidden="true" />
                SVG
              </a>
            </div>
            <div className="qcfg__scanurl">
              <Link2 size={13} strokeWidth={2} aria-hidden="true" />
              <span className="mono">{scanUrl}</span>
            </div>
          </aside>

          {/* ---- Right: destination, help, trash ---- */}
          <div className="qcfg__main">
            <section className="qcfg__card" aria-label="Where scans go">
              <h2 className="qcfg__h2">Where scans go</h2>
              <p className="qcfg__lead">
                Paste your Google review link. Everyone who scans this QR lands there.
              </p>

              <div className={`qcfg__now${live ? "" : " is-empty"}`}>
                {live ? (
                  <>
                    <CircleCheck size={16} strokeWidth={2} aria-hidden="true" />
                    <span className="mono">{device.redirectUrl}</span>
                  </>
                ) : (
                  <>
                    <TriangleAlert size={16} strokeWidth={2} aria-hidden="true" />
                    <span>
                      Not set yet. Scans show a &ldquo;not activated&rdquo; page until you save a
                      link.
                    </span>
                  </>
                )}
              </div>

              <form action={updateDeviceRedirectUrl} className="qcfg__form">
                <input type="hidden" name="deviceId" value={device.id} />
                <label className="qcfg__label" htmlFor="redirectUrl">
                  Google review link
                </label>
                <div className="qcfg__field">
                  <input
                    id="redirectUrl"
                    type="url"
                    name="redirectUrl"
                    required
                    defaultValue={device.redirectUrl ?? suggestedUrl ?? ""}
                    placeholder="https://g.page/r/…/review"
                    className="qcfg__input mono"
                  />
                  <button type="submit" className="qcfg__btn qcfg__btn--pri">
                    <Check size={15} strokeWidth={2.2} aria-hidden="true" />
                    Save
                  </button>
                </div>
                {hasPlaceId && suggestedUrl ? (
                  <p className="qcfg__hint">
                    Tip: the default uses your business&rsquo;s Google Place ID, so you can leave it
                    as is.
                  </p>
                ) : (
                  <Link
                    href={`/establishments/${device.establishmentId ?? ""}`}
                    className="qcfg__hint qcfg__hint--link"
                  >
                    No Google Place ID yet. Add it on your business page to fill this in for you
                    <ArrowRight size={13} strokeWidth={2} aria-hidden="true" />
                  </Link>
                )}
              </form>
            </section>

            <section className="qcfg__card" aria-label="How to find your Google review link">
              <h2 className="qcfg__h2">Find your Google review link</h2>
              <ol className="qcfg__steps">
                <li>
                  Open{" "}
                  <a href="https://business.google.com/" target="_blank" rel="noopener noreferrer">
                    Google Business Profile
                  </a>{" "}
                  and pick your business.
                </li>
                <li>
                  Go to <b>Customers → Reviews</b>.
                </li>
                <li>
                  Click <b>&ldquo;Share review form&rdquo;</b> (sometimes &ldquo;Get more
                  reviews&rdquo;).
                </li>
                <li>Copy the link, paste it above and save.</li>
              </ol>
              <p className="qcfg__muted">
                Both <code>https://g.page/r/…</code> and{" "}
                <code>https://search.google.com/local/writereview?placeid=…</code> work.
              </p>
            </section>

            <section className="qcfg__card qcfg__danger" aria-label="Move this QR code to Trash">
              <div>
                <h2 className="qcfg__h2">Move to Trash</h2>
                <p className="qcfg__muted">
                  Scans will show the &ldquo;not activated&rdquo; page. You can restore it from
                  Trash within 30 days.
                </p>
              </div>
              <form action={deleteDevice}>
                <input type="hidden" name="deviceId" value={device.id} />
                <button type="submit" className="qcfg__btn qcfg__btn--danger">
                  <Trash2 size={15} strokeWidth={2} aria-hidden="true" />
                  Move to Trash
                </button>
              </form>
            </section>
          </div>
        </div>

        <p className="qcfg__foot">
          Want this on a printed plaque or stand?{" "}
          <a href={SHOPIFY_URL} target="_blank" rel="noopener noreferrer">
            Shop the hardware line
          </a>
        </p>
      </div>
    </AppShellServer>
  );
}
