import Link from "next/link";
import { Icon } from "@/components/shell/icon";
import {
  type EstablishmentCardState,
  initialsFor,
  type EstTint,
  titleFromKind,
} from "./card-state";

/**
 * Row B — the business list (12-my-establishments-populated §6). One row per
 * establishment, L→R: avatar · name + type badge + address · connect banner
 * (or a compact "device linked" summary once a device exists) · status ·
 * Reviews · Connect · chevron.
 *
 * Pure presentational server component. Real actions are preserved:
 *   - Connect  → Google Business OAuth authorize (per establishment)
 *   - Reviews  → that establishment's detail page (reviews live there)
 *   - chevron / name → establishment detail
 */
export function BusinessList({
  rows,
}: {
  rows: Array<{ card: EstablishmentCardState; tint: EstTint }>;
}) {
  return (
    <div className="est-list">
      {rows.map(({ card, tint }) => {
        const badge = card.category ?? "Business";
        return (
          <div key={card.id} id={`est-${card.id}`} className="est-row est-anchor">
            <div className="est-row__id">
              <span className={`est-avatar est-avatar--${tint}`} aria-hidden="true">
                {initialsFor(card.name)}
              </span>
              <div className="est-row__idtext">
                <div className="est-row__nameline">
                  <Link href={`/establishments/${card.id}`} className="est-row__name">
                    {card.name}
                  </Link>
                  <span className="est-typebadge">{badge}</span>
                </div>
                <div className="est-row__addr">{card.addressLine}</div>
              </div>
            </div>

            {card.devices.length === 0 ? (
              <div className="est-connect">
                <span className="est-connect__icon" aria-hidden="true">
                  <Icon name="qr" size={22} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="est-connect__title">Next step: connect your device</div>
                  <div className="est-connect__body">
                    Link a QR asset, plaque, or NFC card so in-store customers can leave a review
                    in one tap.
                  </div>
                </div>
              </div>
            ) : (
              <Link href="/hardware" className="est-linked" style={{ textDecoration: "none" }}>
                <span className="est-linked__icon" aria-hidden="true">
                  <Icon name="qr" size={18} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="est-linked__title">
                    {card.devices.length} device{card.devices.length === 1 ? "" : "s"} linked
                  </div>
                  <div className="est-linked__sub">
                    {titleFromKind(card.devices[0]!)}
                    {card.devices.length > 1 ? ` +${card.devices.length - 1} more` : ""}
                  </div>
                </div>
              </Link>
            )}

            <div className="est-row__actions">
              {card.connected ? (
                <span className="est-status">
                  <span className="est-status__dot" aria-hidden="true" />
                  Connected
                </span>
              ) : (
                <span className="est-status est-status--warn">
                  <span className="est-status__dot" aria-hidden="true" />
                  Not connected
                </span>
              )}

              <Link
                href={`/establishments/${card.id}`}
                className="est-btn est-btn--out est-btn--sm"
                aria-label={`Reviews for ${card.name}`}
              >
                <Icon name="eye" size={15} />
                Reviews
              </Link>

              {card.connected ? (
                <Link
                  href="/hardware"
                  className="est-btn est-btn--pri est-btn--sm"
                  aria-label={`Manage devices for ${card.name}`}
                >
                  Manage
                </Link>
              ) : (
                <a
                  href={`/api/connections/google/authorize?establishmentId=${card.id}`}
                  className="est-btn est-btn--pri est-btn--sm"
                  aria-label={`Connect ${card.name}`}
                >
                  Connect
                </a>
              )}

              <Link
                href={`/establishments/${card.id}`}
                className="est-chev"
                aria-label={`Open ${card.name}`}
              >
                <Icon name="chevR" size={18} />
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
