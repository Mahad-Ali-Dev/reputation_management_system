import { AppShellServer } from "@/components/app-shell-server";
import { Icon } from "@/components/shell/icon";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { listEstablishmentsForCards } from "@/lib/establishments/queries";
import Link from "next/link";
import {
  type DeviceSummary,
  deriveCardState,
  reviewTrendPct,
  tintForIndex,
} from "./_components/card-state";
import { BusinessList } from "./_components/business-list";
import { DevicesStrip } from "./_components/devices-strip";
import { SummaryCards, type SummaryCard } from "./_components/summary-cards";
import { SummaryCounters } from "./_components/summary-counters";
import "./establishments.css";

/**
 * My Establishments — rebuilt to the delivered design kit (modules 12 & 13).
 *
 * ACTIVE  (≥1 establishment): hero + 3 business summary cards + dashed add card,
 *          a business list with per-row connect banner / status / Reviews /
 *          Connect / chevron, and an aggregated "Linked devices" strip.
 * EMPTY   (0 establishments): 3 zero counters + dashed add card, a centered
 *          empty block with the magnifier illustration + CTA, and an empty
 *          devices row.
 *
 * All data is live (real establishment rows, their active Google connection,
 * review ratings/timestamps, and linked devices). Add/edit/delete + the
 * /establishments/new flow are preserved; the destructive Disconnect lives on
 * the establishment detail page.
 */

export const dynamic = "force-dynamic";

/** Kit glyph for a business summary tile, tinted by list position. */
const TILE_ICONS = [
  "/assets/repulabs/establishments/tile-store.svg",
  "/assets/repulabs/establishments/tile-restaurant.svg",
  "/assets/repulabs/establishments/tile-it.svg",
  "/assets/repulabs/establishments/tile-add.svg",
];

export default async function EstablishmentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ connect?: string; connect_error?: string }>;
}) {
  const { orgId } = await getOrgContext();
  const sp = (await searchParams) ?? {};
  const rows = await listEstablishmentsForCards(orgId);

  if (rows.length === 0) return <EmptyEstablishments />;

  const cards = rows.map(deriveCardState);

  // Row A — up to 3 business summary cards (mockup shows 3 + the add card).
  const summaryCards: SummaryCard[] = cards.slice(0, 3).map((c, i) => ({
    id: c.id,
    name: c.name,
    type: c.category ?? "Business",
    tint: tintForIndex(i),
    tileIcon: TILE_ICONS[i] ?? TILE_ICONS[0]!,
    avgRating: c.avgRating,
    totalReviews: c.totalReviews,
    trendPct: reviewTrendPct(rows[i]?.reviews ?? []),
  }));

  // Row B — every establishment as a list row.
  const listRows = cards.map((card, i) => ({ card, tint: tintForIndex(i) }));

  // Row C — all linked devices across establishments, in one strip.
  const allDevices: DeviceSummary[] = cards.flatMap((c) => c.devices);

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Workspace", "My Businesses"]}>
      <div className="est">
        <Hero />

        {/* The Google authorize route lands here when it can't resolve which
            location to connect (multi-location org, or a stale link). */}
        {sp.connect === "google" && (
          <div
            className="est-card"
            role="status"
            style={{
              padding: "12px 16px",
              marginBottom: 22,
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "var(--est-indigo-50)",
              borderColor: "#c7d2fe",
            }}
          >
            <Icon name="google" size={14} style={{ color: "var(--est-indigo)", flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: "var(--est-body)" }}>
              {sp.connect_error === "no_location"
                ? "Create your business first, then connect it to Google from its row."
                : "Choose which business to connect — use the Connect button on its row below."}
            </span>
          </div>
        )}

        <SummaryCards cards={summaryCards} />
        <BusinessList rows={listRows} />
        <DevicesStrip devices={allDevices} />
      </div>
    </AppShellServer>
  );
}

/** Shared hero: eyebrow + title + subtitle + laptop/phone illustration, with
    the primary "Add New Business" action top-right. */
function Hero() {
  return (
    <>
      <div className="est-toprow">
        <span className="est-hero__eyebrow">Businesses · Connected</span>
        <Link href="/establishments/new" className="est-btn est-btn--pri">
          <Icon name="plus" size={16} />
          Add New Business
        </Link>
      </div>
      <div className="est-hero">
        <div>
          <h1 className="est-hero__title">My Establishments</h1>
          <p className="est-hero__sub">
            Every business you manage, its live review metrics, and the devices linked to it.
          </p>
        </div>
        {/* biome-ignore lint/performance/noImgElement: static decorative kit SVG */}
        <img
          src="/assets/repulabs/establishments/hero.svg"
          alt=""
          aria-hidden="true"
          className="est-hero__art"
          width={640}
          height={254}
        />
      </div>
    </>
  );
}

/**
 * Empty / zero state (module 13): 3 zero counters + dashed add card, a centered
 * empty block with the magnifier illustration + "No businesses added yet" +
 * CTA, and an empty devices row. Rendered only on a genuine 0-establishment
 * org (a failed fetch would throw before reaching here, so this never masks an
 * error).
 */
function EmptyEstablishments() {
  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Workspace", "My Businesses"]}>
      <div className="est">
        <Hero />
        <SummaryCounters />

        <div className="est-empty">
          {/* biome-ignore lint/performance/noImgElement: static decorative kit SVG */}
          <img
            src="/assets/repulabs/establishments/empty-no-business.svg"
            alt=""
            aria-hidden="true"
            className="est-empty__art"
            width={280}
            height={160}
          />
          <h2 className="est-empty__title">No businesses added yet</h2>
          <p className="est-empty__body">
            Add your first business to start collecting reviews, connect devices, and{" "}
            <strong>unlock powerful insights</strong>.
          </p>
          <Link href="/establishments/new" className="est-btn est-btn--pri est-empty__cta">
            <Icon name="plus" size={16} />
            Add New Business
          </Link>
        </div>

        <DevicesStrip devices={[]} />
      </div>
    </AppShellServer>
  );
}
