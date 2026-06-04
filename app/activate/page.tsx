import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/shell/icon";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import Link from "next/link";
import { ActivateForm } from "./activate-form";

export const dynamic = "force-dynamic";

/**
 * Hardware activation page — paired with a QR review stand.
 *
 * The customer scans the printed code, the stand redirects to /r/{slug}; the
 * operator activates a new stand HERE by entering the 5-char code from the
 * card in the box and picking which establishment it points to.
 */
export default async function ActivatePage({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string }>;
}) {
  const { orgId } = await getOrgContext();
  const sp = await searchParams;

  // Pre-filled slug arrives from /not-activated when the owner scanned an
  // un-redeemed QR — we display it as a context hint so they know which
  // device they're activating, but the activation code is still the secret
  // they need to enter manually.
  const prefilledSlug = /^[0-9A-HJKMNP-TV-Z]{10}$/.test((sp.slug ?? "").toUpperCase())
    ? (sp.slug ?? "").toUpperCase()
    : null;

  const establishments = await withTenant(orgId, (tx) =>
    tx.establishment.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
  );

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Hardware", "Activate"]}>
      <PageHeader
        kicker="Hardware"
        title="Activate a Review Stand"
        description="Enter the 5-character activation code from the card inside your stand's package, then pick which location it lives at."
        actions={
          <Link href="/hardware" className="btn">
            <Icon name="chevL" size={12} />
            Back to hardware
          </Link>
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)",
          gap: 18,
          alignItems: "flex-start",
        }}
      >
        <section className="ds-card">
          <div className="ds-card__head">
            <h3 className="ds-card__title">Activation code</h3>
            <span className="chip">5 characters · Crockford base32</span>
          </div>
          <div className="ds-card__body">
            {establishments.length === 0 ? (
              <div
                style={{
                  padding: 16,
                  borderRadius: 10,
                  background: "var(--warn-soft, #fef3c7)",
                  color: "var(--warn, #92400e)",
                  fontSize: 13,
                  lineHeight: 1.55,
                }}
              >
                <strong>Add a location first.</strong> A stand has to point at one of your
                establishments.{" "}
                <Link
                  href="/establishments/new"
                  style={{ color: "inherit", textDecoration: "underline" }}
                >
                  Create one
                </Link>{" "}
                and come back.
              </div>
            ) : (
              <ActivateForm establishments={establishments} prefilledSlug={prefilledSlug} />
            )}
          </div>
        </section>

        <aside className="ds-card">
          <div className="ds-card__head">
            <h3 className="ds-card__title">How activation works</h3>
          </div>
          <div className="ds-card__body col" style={{ gap: 14, fontSize: 13, lineHeight: 1.55 }}>
            <Step
              n={1}
              t="Verify the product"
              d="The 5-character code printed under the QR proves you own this plaque. We hash it and match it to an unactivated stand on your account."
            />
            <Step
              n={2}
              t="Pick the business"
              d="Choose which establishment this QR represents — scans get attributed to that location for analytics."
            />
            <Step
              n={3}
              t="Set the destination"
              d="Paste your Google review link so scans land on the review form directly. (Optional — we'll derive one if your establishment has a Google Place ID, but pasting your own link is the most reliable option.)"
            />
            <Step
              n={4}
              t="Test the redirect"
              d="Scan the plaque with your phone after activation — it should bounce you straight to Google's review form."
            />
            <div
              style={{
                marginTop: 4,
                padding: 12,
                borderRadius: 10,
                background: "var(--pri-50, #ECFDF7)",
                color: "var(--pri, #2563EB)",
                fontSize: 12,
              }}
            >
              Codes are single-use. After activation, you can change the redirect URL any time via
              the Edit button on the QR card — no re-printing needed.
            </div>
          </div>
        </aside>
      </div>
    </AppShellServer>
  );
}

function Step({ n, t, d }: { n: number; t: string; d: string }) {
  return (
    <div className="row" style={{ alignItems: "flex-start", gap: 12 }}>
      <span
        style={{
          width: 24,
          height: 24,
          borderRadius: 999,
          background: "var(--pri-50, #ECFDF7)",
          color: "var(--pri, #2563EB)",
          display: "grid",
          placeItems: "center",
          fontWeight: 600,
          fontSize: 12,
          flexShrink: 0,
        }}
      >
        {n}
      </span>
      <div>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{t}</div>
        <div className="dim" style={{ fontSize: 12 }}>
          {d}
        </div>
      </div>
    </div>
  );
}
