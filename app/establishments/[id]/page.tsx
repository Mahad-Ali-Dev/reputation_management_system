import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { Avatar } from "@/components/shell/avatar";
import { Icon } from "@/components/shell/icon";
import { Stars } from "@/components/shell/stars";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import { deleteEstablishment } from "@/lib/establishments/actions";
import { getEstablishment } from "@/lib/establishments/queries";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EstablishmentMenu } from "../_components/establishment-menu";
import { PlacePicker } from "../_components/place-picker";
import { DeleteEstablishmentModal } from "./_components/delete-establishment-modal";

/**
 * Establishment detail — repulabs v2 design.
 *
 * Per-location header card (avatar, name, verified status, stats), tabbed
 * sections (Overview / Reviews / Connections / Settings), then content.
 * Real data: getEstablishment(orgId, id) plus a separate review aggregate
 * for the rating histogram.
 */

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Address = {
  line1?: string;
  street?: string;
  city?: string;
  region?: string;
  postal?: string;
  postcode?: string;
  country?: string;
};

const RATING_COLORS: Record<number, string> = {
  5: "var(--ok)",
  4: "#84CC16",
  3: "var(--warn)",
  2: "#F97316",
  1: "var(--bad)",
};

export default async function EstablishmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const { orgId } = await getOrgContext();
  const establishment = await getEstablishment(orgId, id);
  if (!establishment) notFound();

  // Side query: rating aggregates + recent reviews for the overview tab.
  const stats = await withTenant(orgId, async (tx) => {
    const [agg, histogram, recent] = await Promise.all([
      tx.review.aggregate({
        where: { establishmentId: id },
        _avg: { rating: true },
        _count: { _all: true },
      }),
      tx.review.groupBy({
        by: ["rating"],
        where: { establishmentId: id },
        _count: { rating: true },
      }),
      tx.review.findMany({
        where: { establishmentId: id },
        orderBy: { postedAt: "desc" },
        take: 5,
        select: {
          id: true,
          rating: true,
          reviewerName: true,
          body: true,
          postedAt: true,
          reply: { select: { id: true } },
        },
      }),
    ]);
    const buckets: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const h of histogram) buckets[h.rating] = h._count.rating;
    return {
      avg: agg._avg.rating,
      total: agg._count._all,
      buckets,
      recent,
    };
  });

  const googleConn = establishment.connections.find((c) => c.provider === "google_business");
  const addr = establishment.address as Address | null;
  const fullAddress = addressLine(addr);
  // Biases the Maps search — a bare trade name matches nationwide, so the
  // suburb/city is what surfaces THIS owner's listing first.
  const locality = [addr?.city, addr?.region].filter(Boolean).join(" ") || null;
  const isVerified = !!googleConn;
  const maxBucket = Math.max(...Object.values(stats.buckets), 1);

  return (
    <AppShellServer
      topBar={<TopBar />}
      crumbs={["Business Setup", "My Businesses", establishment.name]}
    >
      <PageHeader
        kicker={
          isVerified ? `Verified · ${stats.total.toLocaleString()} reviews` : "Pending verification"
        }
        title={establishment.name}
        description={
          establishment.category ?? "Update category to help the AI personalize replies."
        }
        actions={
          // "Go Back"/"All listings" removed per spec — the breadcrumb already
          // provides back-navigation.
          establishment.googlePlaceId ? (
            <a
              href={`https://www.google.com/maps/place/?q=place_id:${establishment.googlePlaceId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn"
            >
              <Icon name="ext" size={12} />
              Open Google card
            </a>
          ) : undefined
        }
      />

      {/* Header card */}
      <style>{`
        @media (max-width: 640px) {
          .estab-header__info { min-width: 0 !important; }
          .estab-header__actions { width: 100%; align-items: stretch !important; }
          .estab-header__actions a { width: 100%; justify-content: center; }
        }
        @media (max-width: 900px) {
          .estab-overview-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 480px) {
          .estab-tabs { overflow-x: auto; flex-wrap: nowrap; }
        }
      `}</style>
      <div
        className="ds-card"
        style={{ padding: 20, position: "relative", overflow: "hidden", marginBottom: 16 }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            right: -100,
            top: -100,
            width: 260,
            height: 260,
            borderRadius: "50%",
            background: "radial-gradient(circle, var(--pri-50) 0%, transparent 70%)",
          }}
        />
        <div style={{ display: "flex", gap: 16, position: "relative", flexWrap: "wrap" }}>
          <Avatar name={establishment.name} size={64} tone={5} />
          <div className="estab-header__info" style={{ flex: 1, minWidth: 280 }}>
            <div className="row" style={{ gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
              <h2
                style={{
                  fontSize: 22,
                  margin: 0,
                  fontWeight: 600,
                  letterSpacing: "-0.02em",
                }}
              >
                {establishment.name}
              </h2>
              {isVerified ? (
                <span className="chip chip--ok">
                  <Icon name="checkCircle" size={9} stroke={2.4} />
                  Verified
                </span>
              ) : (
                <span className="chip chip--warn">Pending verification</span>
              )}
              {establishment.category && <span className="chip">{establishment.category}</span>}
            </div>
            <div className="dim" style={{ fontSize: 12.5, marginBottom: 14 }}>
              {fullAddress}
            </div>
            <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
              <Stat
                l="Rating"
                v={stats.avg ? stats.avg.toFixed(2) : "—"}
                suf={stats.avg ? "/5" : undefined}
                stars={stats.avg !== null}
                avg={stats.avg}
              />
              <Stat l="Reviews" v={stats.total.toLocaleString()} />
              <Stat
                l="5★ share"
                v={
                  stats.total > 0
                    ? Math.round(((stats.buckets[5] ?? 0) / stats.total) * 100).toString()
                    : "—"
                }
                suf={stats.total > 0 ? "%" : undefined}
              />
              <Stat l="Connections" v={String(establishment.connections.length)} />
            </div>
          </div>
          <div className="estab-header__actions col" style={{ gap: 6, alignItems: "flex-end" }}>
            {!googleConn && (
              <a
                href={`/api/connections/google/authorize?establishmentId=${establishment.id}`}
                className="btn btn--sm btn--pri"
              >
                <Icon name="plug" size={11} />
                Connect Google
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="estab-tabs tabs" style={{ marginBottom: 16 }}>
        <button type="button" className="tabs__t is-active">
          Overview
        </button>
        <Link
          href={`/reviews?establishment=${establishment.id}`}
          className="tabs__t"
          style={{ textDecoration: "none" }}
        >
          Reviews
          <span
            style={{
              fontFamily: "var(--f-mono)",
              fontSize: 10,
              padding: "1px 5px",
              borderRadius: 999,
              background: "var(--surface-3)",
              color: "var(--rl-muted)",
            }}
          >
            {stats.total}
          </span>
        </Link>
        <Link href="/connections" className="tabs__t" style={{ textDecoration: "none" }}>
          Connections
        </Link>
        <Link
          href={`/establishments/${establishment.id}/settings`}
          className="tabs__t"
          style={{ textDecoration: "none" }}
        >
          Settings
        </Link>
      </div>

      {/* Overview grid */}
      <div
        className="estab-overview-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.4fr)",
          gap: 14,
        }}
      >
        {/* Left: rating distribution + address + danger */}
        <div className="col" style={{ gap: 14 }}>
          <div className="ds-card">
            <div className="ds-card__head">
              <h3 className="ds-card__title">Rating distribution</h3>
            </div>
            <div className="ds-card__body">
              {stats.total === 0 ? (
                <div className="dim" style={{ fontSize: 12.5, padding: 16, textAlign: "center" }}>
                  No reviews yet for this location.
                </div>
              ) : (
                [5, 4, 3, 2, 1].map((s) => {
                  const n = stats.buckets[s] ?? 0;
                  const p = Math.round((n / maxBucket) * 100);
                  return (
                    <div key={s} className="row" style={{ marginBottom: 6, fontSize: 12 }}>
                      <span className="row" style={{ gap: 2, width: 38 }}>
                        <span className="mono">{s}</span>
                        <Icon name="star" size={11} style={{ color: "var(--gold)" }} />
                      </span>
                      <div className="gauge" style={{ flex: 1 }}>
                        <i style={{ width: `${p}%`, background: RATING_COLORS[s] }} />
                      </div>
                      <span
                        className="mono dim"
                        style={{ width: 38, textAlign: "right", fontSize: 11 }}
                      >
                        {n}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="ds-card">
            <div className="ds-card__head">
              <h3 className="ds-card__title">Address</h3>
            </div>
            <div className="ds-card__body" style={{ fontSize: 13, lineHeight: 1.6 }}>
              {fullAddress === "—" ? <div className="dim">No address set.</div> : fullAddress}
            </div>
          </div>

          <div className="ds-card" style={{ borderColor: "var(--bad-soft)" }}>
            <div className="ds-card__head">
              <h3 className="ds-card__title" style={{ color: "var(--bad)" }}>
                Danger zone
              </h3>
            </div>
            <div className="ds-card__body">
              <DeleteEstablishmentModal
                establishmentName={establishment.name}
                action={async () => {
                  "use server";
                  await deleteEstablishment(establishment.id);
                }}
              />
              <p className="dim" style={{ fontSize: 11.5, marginTop: 8, lineHeight: 1.5 }}>
                Soft-deletes the record. Reviews remain attached. You have 30 days to undo via
                support.
              </p>
            </div>
          </div>
        </div>

        {/* Right: connection card + recent reviews */}
        <div className="col" style={{ gap: 14 }}>
          <div id="connect" className="ds-card">
            <div className="ds-card__head">
              <div>
                <h3 className="ds-card__title">Google Business Profile</h3>
                <div className="ds-card__sub">
                  Pulls reviews automatically and publishes AI-drafted replies.
                </div>
              </div>
              {googleConn ? (
                <div className="row" style={{ gap: 8 }}>
                  <span className="chip chip--ok">
                    <Icon name="checkCircle" size={9} stroke={2.4} />
                    Connected
                  </span>
                  {/* Disconnect lives behind the "…" menu + confirmation modal
                      — never a bare red button (spec acceptance). */}
                  <EstablishmentMenu
                    establishmentId={establishment.id}
                    googlePlaceId={establishment.googlePlaceId}
                  />
                </div>
              ) : (
                <span className="chip chip--warn">Not connected</span>
              )}
            </div>
            <div className="ds-card__body">
              {googleConn ? (
                <>
                  <div
                    className="row"
                    style={{
                      padding: 12,
                      background: "var(--pri-50)",
                      borderRadius: 10,
                      border: "1px solid var(--pri-100)",
                      marginBottom: 12,
                    }}
                  >
                    <span
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: "var(--pri)",
                        color: "#fff",
                        display: "grid",
                        placeItems: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Icon name="google" size={15} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>
                        {googleConn.accountLabel ?? "Google account"}
                      </div>
                      <div className="dim mono" style={{ fontSize: 10.5 }}>
                        {googleConn.externalId ?? "—"}
                      </div>
                    </div>
                  </div>
                  {establishment.googlePlaceId && (
                    <div
                      style={{
                        padding: 10,
                        background: "var(--surface-2)",
                        borderRadius: 8,
                        fontSize: 12,
                        marginBottom: 12,
                      }}
                    >
                      <div className="lbl-mono" style={{ margin: 0, marginBottom: 4 }}>
                        Linked place
                      </div>
                      <code className="mono" style={{ fontSize: 11.5, wordBreak: "break-all" }}>
                        {establishment.googlePlaceId}
                      </code>
                    </div>
                  )}
                  <PlacePicker
                    establishmentId={establishment.id}
                    near={locality}
                    currentPlaceId={establishment.googlePlaceId}
                    initialQuery={establishment.googlePlaceId ? null : establishment.name}
                  />
                </>
              ) : (
                <div>
                  {/* Reviews sync from the PUBLIC Google listing via the picker
                      below — no OAuth and no Google approval needed. The connect
                      button stays as the secondary path because publishing
                      replies back to Google still requires the GBP API. */}
                  <PlacePicker
                    establishmentId={establishment.id}
                    near={locality}
                    currentPlaceId={establishment.googlePlaceId}
                    initialQuery={establishment.googlePlaceId ? null : establishment.name}
                  />
                  <div
                    style={{
                      marginTop: 16,
                      paddingTop: 14,
                      borderTop: "1px solid var(--border)",
                    }}
                  >
                    <p className="dim" style={{ fontSize: 12.5, lineHeight: 1.6, margin: 0 }}>
                      Want to publish replies back to Google from here? Connect the profile as well.
                    </p>
                    <a
                      href={`/api/connections/google/authorize?establishmentId=${establishment.id}`}
                      className="btn btn--sm"
                      style={{ marginTop: 10 }}
                    >
                      <Icon name="google" size={12} />
                      Connect Google Business Profile
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="ds-card">
            <div className="ds-card__head">
              <h3 className="ds-card__title">Recent reviews</h3>
              <Link href={`/reviews?establishment=${establishment.id}`} className="btn btn--xs">
                View all
              </Link>
            </div>
            <div style={{ padding: 4 }}>
              {stats.recent.length === 0 ? (
                <div className="dim" style={{ padding: 24, textAlign: "center", fontSize: 12.5 }}>
                  <Icon name="star" size={26} style={{ color: "var(--gold)" }} />
                  <p style={{ marginTop: 8 }}>No reviews yet for this location.</p>
                </div>
              ) : (
                stats.recent.map((r, i) => {
                  const tone = ((i % 7) + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
                  return (
                    <Link
                      key={r.id}
                      href={`/reviews/${r.id}`}
                      style={{
                        display: "block",
                        padding: 12,
                        borderTop: i ? "1px solid var(--line)" : "none",
                        textDecoration: "none",
                        color: "inherit",
                      }}
                    >
                      <div className="row" style={{ marginBottom: 4 }}>
                        <Avatar name={r.reviewerName ?? "User"} size={24} tone={tone} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 500 }}>
                            {r.reviewerName ?? "Anonymous"}
                          </div>
                          <div className="dim mono" style={{ fontSize: 10 }}>
                            {r.postedAt ? relativeTime(r.postedAt) : "—"}
                          </div>
                        </div>
                        <Stars value={r.rating} size={11} />
                        {r.reply ? (
                          <span className="chip chip--ok">Replied</span>
                        ) : r.rating <= 2 ? (
                          <span className="chip chip--bad">Open</span>
                        ) : null}
                      </div>
                      {r.body && (
                        <p
                          style={{
                            margin: 0,
                            fontSize: 12,
                            color: "var(--ink-2)",
                            lineHeight: 1.5,
                            overflow: "hidden",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                          }}
                        >
                          {r.body}
                        </p>
                      )}
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShellServer>
  );
}

function Stat({
  l,
  v,
  suf,
  stars,
  avg,
}: {
  l: string;
  v: string;
  suf?: string;
  stars?: boolean;
  avg?: number | null;
}) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--rl-muted)", fontWeight: 500 }}>{l}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 2 }}>
        <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}>{v}</span>
        {suf && <span style={{ fontSize: 12, color: "var(--rl-muted)" }}>{suf}</span>}
      </div>
      {stars && avg !== null && avg !== undefined && <Stars value={Math.round(avg)} size={10} />}
    </div>
  );
}

function addressLine(addr: Address | null | undefined): string {
  if (!addr) return "—";
  const parts = [
    addr.line1 ?? addr.street,
    addr.city,
    addr.region,
    addr.postal ?? addr.postcode,
    addr.country,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "—";
}

function relativeTime(d: Date): string {
  const ms = Date.now() - d.getTime();
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}
