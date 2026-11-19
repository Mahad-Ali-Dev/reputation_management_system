import { AppShellServer } from "@/components/app-shell-server";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { listEstablishmentsForCards } from "@/lib/establishments/queries";
import { Info, Plus } from "lucide-react";
import { AddBusinessModal } from "./_components/add-business-modal";
import { BusinessGrid, BusinessesEmpty, DeviceList } from "./_components/business-grid";
import { type DeviceSummary, deriveCardState, reviewTrendPct } from "./_components/card-state";
import "./my-businesses-apple.css";

/**
 * My Businesses (Apple look, 2026-11 redesign).
 *
 * Hero with live totals + "Add a business", one frosted card per business
 * (logo, Google status, rating / reviews / 30-day trend, linked devices,
 * Reviews + Connect/Details actions), an "Add a business" card, and an iOS
 * grouped list of every linked device. Empty orgs get a centred empty state.
 *
 * All data is live (establishment rows, their active Google connection, review
 * ratings/timestamps, linked devices). Add / Connect / detail flows unchanged;
 * the destructive Disconnect still lives on the establishment detail page.
 */

export const dynamic = "force-dynamic";

/** Stable per-business hue for the initials logo (brand-adjacent range). */
const HUES = [248, 268, 222, 290, 200, 330];

export default async function EstablishmentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ connect?: string; connect_error?: string }>;
}) {
  const { orgId } = await getOrgContext();
  const sp = (await searchParams) ?? {};
  const rows = await listEstablishmentsForCards(orgId);
  const cards = rows.map(deriveCardState);

  const allDevices: DeviceSummary[] = cards.flatMap((c) => c.devices);
  const rated = cards.filter((c) => c.avgRating !== null);
  const totalReviews = cards.reduce((n, c) => n + c.totalReviews, 0);
  const avg =
    rated.length > 0
      ? cards.reduce((s, c) => s + (c.avgRating ?? 0) * c.totalReviews, 0) /
        Math.max(
          1,
          rated.reduce((n, c) => n + c.totalReviews, 0),
        )
      : null;

  const items = cards.map((card, i) => ({
    card,
    trendPct: reviewTrendPct(rows[i]?.reviews ?? []),
    hue: HUES[i % HUES.length] ?? 248,
  }));

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Business Setup", "My Businesses"]}>
      <div className="mb">
        <header className="mb-head">
          <div>
            <span className="mb-eyebrow">Business Setup</span>
            <h1 className="mb-title">My Businesses</h1>
            <p className="mb-sub">
              {cards.length === 0
                ? "Every place you manage reviews for, in one spot."
                : `${cards.length} business${cards.length === 1 ? "" : "es"} · ${totalReviews.toLocaleString()} reviews${avg !== null ? ` · ${avg.toFixed(1)} average` : ""} · ${allDevices.length} device${allDevices.length === 1 ? "" : "s"}`}
            </p>
          </div>
          {cards.length > 0 && (
            <AddBusinessModal triggerClassName="mb-pill mb-pill--pri mb-pill--lg">
              <Plus size={16} strokeWidth={2} />
              Add a business
            </AddBusinessModal>
          )}
        </header>

        {/* The Google authorize route lands here when it can't resolve which
            location to connect (multi-location org, or a stale link). */}
        {sp.connect === "google" && (
          <output className="mb-note">
            <Info size={16} strokeWidth={1.8} />
            {sp.connect_error === "no_location"
              ? "Create your business first, then connect it to Google from its card."
              : "Choose which business to connect: use Connect Google on its card below."}
          </output>
        )}

        {cards.length === 0 ? (
          <BusinessesEmpty />
        ) : (
          <>
            <BusinessGrid items={items} />
            <DeviceList devices={allDevices} />
          </>
        )}
      </div>
    </AppShellServer>
  );
}
