import { Avatar } from "@/components/shell/avatar";
import { Icon } from "@/components/shell/icon";
import { Stars } from "@/components/shell/stars";
import Link from "next/link";
import { type EstablishmentCardState, relativeTime } from "./card-state";
import { EstablishmentMenu } from "./establishment-menu";

/**
 * The unified establishment card (connected OR not-yet-connected state).
 * Replaces the old master-detail layout's duplicated identity (list row +
 * header card) with ONE card per establishment:
 *
 *   left   — business photo (imageUrl, Avatar fallback)
 *   center — name (bold) · address with pin · phone with phone icon
 *   right  — vertical pill stack: Connected/Not connected · [n] Reviews ·
 *            [score] Rating with gold stars · "Last synced … ago"
 *   top-rt — "…" menu (when a Google connection exists) else a Connect CTA
 *
 * Server component: all metrics are precomputed by the page via
 * `deriveCardState`, so this never touches Prisma and the only client island
 * is <EstablishmentMenu>.
 */
export function EstablishmentCard({ est }: { est: EstablishmentCardState }) {
  return (
    <div
      className="ds-card"
      // overflow stays visible so the "…" dropdown popover isn't clipped; the
      // photo zone clips itself (rounded left corners) instead.
      style={{ display: "flex", flexWrap: "wrap" }}
    >
      {/* Left: photo zone */}
      <div
        style={{
          width: 168,
          minWidth: 168,
          alignSelf: "stretch",
          minHeight: 148,
          background: "var(--surface-3)",
          position: "relative",
          display: "grid",
          placeItems: "center",
          overflow: "hidden",
          borderRadius: "var(--r-md) 0 0 var(--r-md)",
        }}
      >
        {est.imageUrl ? (
          // Native <img> — cover-fit the photo into the left zone.
          // biome-ignore lint/performance/noImgElement: arbitrary remote business photos, not a known-size asset
          <img
            src={est.imageUrl}
            alt={est.name}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <Avatar name={est.name} size={56} tone={5} />
        )}
      </div>

      {/* Center: identity */}
      <div
        style={{
          flex: 1,
          minWidth: 240,
          padding: "18px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          justifyContent: "center",
        }}
      >
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <Link
            href={`/establishments/${est.id}`}
            style={{
              fontSize: 17,
              fontWeight: 600,
              letterSpacing: "-0.015em",
              color: "var(--ink)",
              textDecoration: "none",
            }}
          >
            {est.name}
          </Link>
          {est.category && <span className="chip">{est.category}</span>}
        </div>
        <div className="row dim" style={{ gap: 6, fontSize: 12.5 }}>
          <Icon name="pin" size={13} style={{ color: "var(--rl-muted-2)", flexShrink: 0 }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{est.addressLine}</span>
        </div>
        {est.phone && (
          <div className="row dim" style={{ gap: 6, fontSize: 12.5 }}>
            <Icon name="phone" size={13} style={{ color: "var(--rl-muted-2)", flexShrink: 0 }} />
            <span>{est.phone}</span>
          </div>
        )}
      </div>

      {/* Right: pill stack */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 8,
          padding: "14px 16px 18px",
          borderLeft: "1px solid var(--line)",
          minWidth: 200,
        }}
      >
        {/* "…" menu sits at the top of the right zone (top-right of the card).
            Only when connected — the not-connected state has no destructive
            action to gate; it surfaces the Connect CTA below instead. */}
        {est.connected && (
          <div className="row" style={{ justifyContent: "flex-end", width: "100%", height: 22 }}>
            <EstablishmentMenu establishmentId={est.id} googlePlaceId={est.googlePlaceId} />
          </div>
        )}

        {est.connected ? (
          <span className="chip chip--ok">
            <Icon name="checkCircle" size={10} stroke={2.4} />
            Connected
          </span>
        ) : (
          <span className="chip chip--warn">Not connected</span>
        )}

        <span className="chip">
          <span className="mono" style={{ fontWeight: 600 }}>
            {est.totalReviews.toLocaleString()}
          </span>
          {est.totalReviews === 1 ? "Review" : "Reviews"}
        </span>

        {est.avgRating !== null ? (
          <span className="chip" style={{ gap: 6 }}>
            <span className="mono" style={{ fontWeight: 600 }}>
              {est.avgRating.toFixed(1)}
            </span>
            <Stars value={Math.round(est.avgRating)} size={11} />
          </span>
        ) : (
          <span className="chip chip--out">No rating yet</span>
        )}

        {est.connected ? (
          <div className="dim" style={{ fontSize: 11, marginTop: 2 }}>
            Last synced: {relativeTime(est.lastSyncedAt)}
          </div>
        ) : (
          <a
            href={`/api/connections/google/authorize?establishmentId=${est.id}`}
            className="btn btn--sm btn--accent"
            style={{ marginTop: 2 }}
          >
            <Icon name="google" size={12} />
            Connect
          </a>
        )}
      </div>
    </div>
  );
}
