import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/shell/icon";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import {
  latestRanksByEstablishment,
  listEstablishmentsForCards,
} from "@/lib/establishments/queries";
import Link from "next/link";
import { deriveCardState, shouldShowDevicePrompt } from "./_components/card-state";
import { DevicePromptBanner } from "./_components/device-prompt-banner";
import { EstablishmentCard } from "./_components/establishment-card";
import { LinkedDevicesRow } from "./_components/linked-devices-row";
import { deriveSummaryTile } from "./_components/summary-state";
import { SummaryStrip } from "./_components/summary-strip";
import "./establishments.css";

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

export default async function EstablishmentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ connect?: string; connect_error?: string }>;
}) {
  const { orgId } = await getOrgContext();
  const sp = (await searchParams) ?? {};
  // Ranks read fail-soft (empty map when keyword_ranks is missing/empty).
  const [rows, ranks] = await Promise.all([
    listEstablishmentsForCards(orgId),
    latestRanksByEstablishment(orgId),
  ]);

  if (rows.length === 0) return <EmptyEstablishments />;

  const cards = rows.map(deriveCardState);
  const connectedCount = cards.filter((c) => c.connected).length;
  const tiles = rows.map((row) => deriveSummaryTile(row, ranks.get(row.id) ?? null));

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

      {/* The Google authorize route lands here when it can't resolve which
          location to connect (multi-location org, or a stale link). */}
      {sp.connect === "google" && (
        <div
          className="ds-card row"
          role="status"
          style={{
            padding: "12px 16px",
            marginBottom: 16,
            gap: 10,
            background: "var(--pri-50)",
            borderColor: "var(--pri-100)",
          }}
        >
          <Icon name="google" size={14} style={{ color: "var(--pri)", flexShrink: 0 }} />
          <span style={{ fontSize: 13 }}>
            {sp.connect_error === "no_location"
              ? "Create your business first, then connect it to Google from its card."
              : "Choose which business to connect — use the Connect Google button on its card below."}
          </span>
        </div>
      )}

      {/* At-a-glance tile per location (rating · completeness · 30d sparkline);
          clicking a tile jumps to that establishment's full card below. */}
      <SummaryStrip tiles={tiles} />

      <div className="col" style={{ gap: 18 }}>
        {cards.map((card) => (
          <div key={card.id} id={`est-${card.id}`} className="col est-anchor" style={{ gap: 10 }}>
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
          // De-emphasized on purpose — the dashed card below is the focal CTA.
          // It still navigates, so no aria-disabled (that would lie to AT).
          <Link
            href="/establishments/new"
            className="btn btn--pri"
            style={{ opacity: 0.6 }}
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
