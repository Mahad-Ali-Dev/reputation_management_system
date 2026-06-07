import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/shell/icon";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { listEstablishmentsForCards } from "@/lib/establishments/queries";
import Link from "next/link";
import { deriveCardState, shouldShowDevicePrompt } from "./_components/card-state";
import { DevicePromptBanner } from "./_components/device-prompt-banner";
import { EstablishmentCard } from "./_components/establishment-card";
import { LinkedDevicesRow } from "./_components/linked-devices-row";

/**
 * My Establishments — redesigned to the master-plan spec (module 03).
 *
 * Two clean states, both driven by real data:
 *   EMPTY      — Google-style dashed "Connect Your First Business" card.
 *   CONNECTED  — one unified establishment card per establishment, each
 *                followed by the blue→indigo "connect your device" banner
 *                (when it has 0 linked devices) or a linked-devices summary.
 *
 * The old master-detail layout (left LocationList "table" + duplicated
 * header/analytics) is gone; the prominent red Disconnect now lives behind the
 * card's "…" menu + a confirmation modal.
 */

export const dynamic = "force-dynamic";

export default async function EstablishmentsPage() {
  const { orgId } = await getOrgContext();
  const rows = await listEstablishmentsForCards(orgId);

  if (rows.length === 0) return <EmptyEstablishments />;

  const cards = rows.map(deriveCardState);
  const connectedCount = cards.filter((c) => c.connected).length;

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Workspace", "Establishments"]}>
      <PageHeader
        kicker={`${cards.length} business${cards.length === 1 ? "" : "es"} · ${connectedCount} connected`}
        title="My Establishments"
        description="Every business you manage, its live review metrics, and the devices linked to it."
        actions={
          <Link href="/establishments/new" className="btn btn--pri">
            <Icon name="plus" size={12} />
            Add New Business
          </Link>
        }
      />

      <div className="col" style={{ gap: 18 }}>
        {cards.map((card) => (
          <div key={card.id} className="col" style={{ gap: 10 }}>
            <EstablishmentCard est={card} />
            {shouldShowDevicePrompt(card) ? (
              <DevicePromptBanner establishmentId={card.id} />
            ) : (
              <LinkedDevicesRow devices={card.devices} />
            )}
          </div>
        ))}
      </div>
    </AppShellServer>
  );
}

/**
 * Google-style empty state: a dashed card with the storefront illustration,
 * "Connect Your First Business", helper text, and a blue Connect button.
 *
 * Google OAuth needs an establishment to attach to (the authorize route 400s
 * without `establishmentId`), so the primary CTA creates the business first;
 * the per-card Connect CTA then starts OAuth. The "+ Add New Business" header
 * action is rendered faded per the spec (the dashed card is the focal CTA).
 */
function EmptyEstablishments() {
  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Workspace", "Establishments"]}>
      <PageHeader
        kicker="No businesses yet"
        title="My Establishments"
        description="Connect a Google Business Profile to start syncing reviews and drafting AI replies."
        actions={
          <Link
            href="/establishments/new"
            className="btn btn--pri"
            aria-disabled="true"
            style={{ opacity: 0.5 }}
          >
            <Icon name="plus" size={12} />
            Add New Business
          </Link>
        }
      />

      <div
        style={{
          border: "2px dashed var(--line-2)",
          borderRadius: "var(--r-md)",
          background: "var(--surface)",
          padding: "48px 24px",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        {/* biome-ignore lint/performance/noImgElement: static brand SVG illustration */}
        <img
          src="/assets/repulabs/illustrations/listings-empty.svg"
          alt=""
          width={156}
          height={134}
          style={{ marginBottom: 18 }}
        />
        <h3 style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.015em", margin: 0 }}>
          Connect Your First Business
        </h3>
        <p
          className="dim"
          style={{ fontSize: 13, marginTop: 8, maxWidth: 440, lineHeight: 1.6 }}
        >
          We&apos;ll pull every existing review automatically and start drafting AI replies in your
          brand voice within minutes. You&apos;ll sign in with the Google account that manages your
          listing.
        </p>
        <Link
          href="/establishments/new"
          className="btn btn--accent btn--lg"
          style={{ marginTop: 20 }}
        >
          <Icon name="google" size={15} />
          Connect Google Business
        </Link>
      </div>
    </AppShellServer>
  );
}
