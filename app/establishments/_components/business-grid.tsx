import {
  Building2,
  ChevronRight,
  CreditCard,
  MapPin,
  Nfc,
  Plus,
  QrCode,
  Star,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { AddBusinessModal } from "./add-business-modal";
import {
  type DeviceSummary,
  type EstablishmentCardState,
  initialsFor,
  titleFromKind,
} from "./card-state";

/**
 * My Businesses (Apple look): one frosted card per business, with its logo,
 * Google status, rating / reviews / 30-day trend, linked devices and actions,
 * then an "Add a business" card. Pure server markup; every figure is
 * precomputed by the page from real establishment rows.
 */

export type BusinessCardData = {
  card: EstablishmentCardState;
  trendPct: number | null;
  hue: number;
};

export function BusinessGrid({ items }: { items: BusinessCardData[] }) {
  return (
    <div className="mb-grid">
      {items.map(({ card, trendPct, hue }) => (
        <BusinessCard key={card.id} card={card} trendPct={trendPct} hue={hue} />
      ))}
      <AddBusinessModal triggerClassName="mb-card mb-add">
        <span className="mb-add__plus" aria-hidden="true">
          <Plus size={26} strokeWidth={1.8} />
        </span>
        <span className="mb-add__title">Add a business</span>
        <span className="mb-add__sub">Another location or brand you manage</span>
      </AddBusinessModal>
    </div>
  );
}

function BusinessCard({
  card,
  trendPct,
  hue,
}: {
  card: EstablishmentCardState;
  trendPct: number | null;
  hue: number;
}) {
  const devices = card.devices;
  const first = devices[0];
  return (
    <article id={`est-${card.id}`} className="mb-card est-anchor">
      <header className="mb-card__head">
        <span
          className="mb-logo"
          aria-hidden="true"
          style={{ "--mb-hue": hue } as React.CSSProperties}
        >
          {card.imageUrl ? (
            <img src={card.imageUrl} alt="" className="mb-logo__img" />
          ) : (
            initialsFor(card.name)
          )}
        </span>
        <div className="mb-card__id">
          <Link href={`/establishments/${card.id}`} className="mb-card__name">
            {card.name}
          </Link>
          <div className="mb-card__meta">
            <span>{card.category ?? "Business"}</span>
            <span aria-hidden="true">·</span>
            <span className={`mb-status${card.connected ? " is-on" : ""}`}>
              {card.connected ? "Google connected" : "Not connected"}
            </span>
          </div>
          {card.addressLine !== "—" && (
            <div className="mb-card__addr" title={card.addressLine}>
              <MapPin size={12} strokeWidth={1.8} aria-hidden="true" />
              <span>{card.addressLine}</span>
            </div>
          )}
        </div>
      </header>

      <div className="mb-stats">
        <div className="mb-stat">
          <div className="mb-stat__val">
            {card.avgRating !== null ? (
              <>
                <Star size={16} strokeWidth={0} fill="currentColor" className="mb-star" />
                {card.avgRating.toFixed(1)}
              </>
            ) : (
              <span className="mb-dim">—</span>
            )}
          </div>
          <div className="mb-stat__lbl">Rating</div>
        </div>
        <div className="mb-stat">
          <div className="mb-stat__val">{card.totalReviews.toLocaleString()}</div>
          <div className="mb-stat__lbl">Reviews</div>
        </div>
        <div className="mb-stat">
          <div
            className={`mb-stat__val${trendPct === null ? "" : trendPct >= 0 ? " is-up" : " is-down"}`}
          >
            {trendPct === null ? (
              <span className="mb-dim">—</span>
            ) : (
              <>
                {trendPct >= 0 ? (
                  <TrendingUp size={16} strokeWidth={2} />
                ) : (
                  <TrendingDown size={16} strokeWidth={2} />
                )}
                {Math.abs(trendPct)}%
              </>
            )}
          </div>
          <div className="mb-stat__lbl">30-day trend</div>
        </div>
      </div>

      <Link href="/hardware" className={`mb-devline${devices.length === 0 ? " is-empty" : ""}`}>
        <QrCode size={16} strokeWidth={1.8} aria-hidden="true" />
        {devices.length === 0 ? (
          <span>No device yet · connect a QR stand or NFC card</span>
        ) : (
          <span>
            {devices.length} device{devices.length === 1 ? "" : "s"}
            {first ? ` · ${titleFromKind(first)}` : ""}
            {devices.length > 1 ? ` +${devices.length - 1}` : ""}
          </span>
        )}
        <ChevronRight size={15} strokeWidth={2} className="mb-devline__chev" aria-hidden="true" />
      </Link>

      <footer className="mb-card__foot">
        <Link
          href={`/reviews?establishment=${card.id}`}
          className="mb-pill"
          aria-label={`Reviews for ${card.name}`}
        >
          Reviews
        </Link>
        {card.connected ? (
          <Link href={`/establishments/${card.id}`} className="mb-pill">
            Details
          </Link>
        ) : (
          <a
            href={`/api/connections/google/authorize?establishmentId=${card.id}`}
            className="mb-pill mb-pill--pri"
            aria-label={`Connect ${card.name} to Google`}
          >
            Connect Google
          </a>
        )}
        <Link
          href={`/establishments/${card.id}`}
          className="mb-open"
          aria-label={`Open ${card.name}`}
        >
          <ChevronRight size={18} strokeWidth={2} />
        </Link>
      </footer>
    </article>
  );
}

/** iOS grouped list of every linked device across all businesses. */
export function DeviceList({ devices }: { devices: DeviceSummary[] }) {
  return (
    <section className="mb-devices" aria-labelledby="mb-devices-title">
      <div className="mb-section-head">
        <h2 id="mb-devices-title" className="mb-section-title">
          Devices
        </h2>
        <Link href="/hardware" className="mb-link">
          Manage
        </Link>
      </div>
      {devices.length === 0 ? (
        <div className="mb-devempty">
          <QrCode size={22} strokeWidth={1.6} aria-hidden="true" />
          <span>No devices linked yet.</span>
          <Link href="/hardware" className="mb-link">
            Connect a device
          </Link>
        </div>
      ) : (
        <ul className="mb-devlist">
          {devices.map((d) => {
            const active = d.status === "active" || d.status === "activated";
            const hay = `${d.productKind} ${d.productSku}`.toLowerCase();
            const DevIcon = hay.includes("nfc") ? Nfc : hay.includes("card") ? CreditCard : QrCode;
            return (
              <li key={d.id}>
                <Link href="/hardware" className="mb-dev">
                  <span className="mb-dev__icon" aria-hidden="true">
                    <DevIcon size={18} strokeWidth={1.8} />
                  </span>
                  <span className="mb-dev__name">{titleFromKind(d)}</span>
                  <span className="mb-dev__scans">
                    {d.scanCount.toLocaleString()} scan{d.scanCount === 1 ? "" : "s"}
                  </span>
                  <span className={`mb-dev__status${active ? " is-on" : ""}`}>
                    {active ? "Active" : "Inactive"}
                  </span>
                  <ChevronRight
                    size={16}
                    strokeWidth={2}
                    className="mb-dev__chev"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Empty state: no businesses yet. */
export function BusinessesEmpty() {
  return (
    <div className="mb-empty">
      <span className="mb-empty__badge" aria-hidden="true">
        <Building2 size={30} strokeWidth={1.6} />
      </span>
      <h2 className="mb-empty__title">No businesses yet</h2>
      <p className="mb-empty__sub">
        Add your first business to start collecting reviews, connect devices and see how you&apos;re
        doing.
      </p>
      <AddBusinessModal triggerClassName="mb-pill mb-pill--pri mb-pill--lg">
        <Plus size={16} strokeWidth={2} />
        Add a business
      </AddBusinessModal>
    </div>
  );
}
