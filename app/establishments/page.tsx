import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { Avatar } from "@/components/shell/avatar";
import { Icon, type IconName } from "@/components/shell/icon";
import { Sparkline } from "@/components/shell/sparkline";
import { Stars } from "@/components/shell/stars";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/with-tenant";
import Link from "next/link";

/**
 * Establishments — master-detail view, fully data-driven.
 *
 * Real data: list of establishments, rating aggregates per location, team
 * roster (via Membership), recent reviews + replies, operating hours from
 * AiTrainingProfile, top topic mentions from the review.topics array.
 *
 * Empty state: clean hero CTA when no establishments exist.
 */

export const dynamic = "force-dynamic";

type Address = {
  city?: string;
  region?: string;
  street?: string;
  postcode?: string;
  country?: string;
};

const TONES = [3, 4, 5, 2, 6, 7, 1] as const;
const DAY_ORDER = [
  ["monday", "Mon"],
  ["tuesday", "Tue"],
  ["wednesday", "Wed"],
  ["thursday", "Thu"],
  ["friday", "Fri"],
  ["saturday", "Sat"],
  ["sunday", "Sun"],
] as const;
type OperatingHours = Record<string, { open?: string; close?: string }>;

function addressLine(addr: Address | null | undefined): string {
  if (!addr) return "—";
  const parts = [addr.street, addr.city, addr.region, addr.postcode].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "—";
}

function shortAddress(addr: Address | null | undefined): string {
  if (!addr) return "—";
  const city = addr.city ?? "—";
  const region = addr.region ?? "";
  return region ? `${city} ${region}` : city;
}

function relativeTime(d: Date): string {
  const ms = Date.now() - d.getTime();
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)} wk ago`;
  return d.toLocaleDateString();
}

export default async function EstablishmentsPage() {
  const { orgId } = await getOrgContext();

  const data = await withTenant(orgId, async (tx) => {
    const establishments = await tx.establishment.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        category: true,
        timezone: true,
        address: true,
        googlePlaceId: true,
        createdAt: true,
        reviews: { select: { rating: true } },
        _count: {
          select: { connections: { where: { status: "active" } } },
        },
      },
    });
    if (establishments.length === 0) {
      return {
        establishments,
        selected: null,
        selectedReviews: [],
        memberships: [],
        trainingProfile: null,
        ratingHistogram: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<number, number>,
        trend30d: Array<number>(),
        topTopics: Array<[string, number]>(),
      };
    }
    const selected = establishments[0];
    if (!selected) {
      return {
        establishments,
        selected: null,
        selectedReviews: [],
        memberships: [],
        trainingProfile: null,
        ratingHistogram: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<number, number>,
        trend30d: Array<number>(),
        topTopics: Array<[string, number]>(),
      };
    }
    const selectedId = selected.id;
    // Reviews + training profile are tenant-scoped (run inside RLS).
    // Memberships join to User which lives in the auth domain — the tenant
    // role can't read users — so we fetch that with the regular client below.
    const [reviews, trainingProfile] = await Promise.all([
      tx.review.findMany({
        where: { establishmentId: selectedId },
        orderBy: { postedAt: "desc" },
        take: 50,
        select: {
          id: true,
          rating: true,
          reviewerName: true,
          body: true,
          postedAt: true,
          topics: true,
          reply: { select: { id: true, status: true } },
        },
      }),
      tx.aiTrainingProfile.findUnique({ where: { organizationId: orgId } }),
    ]);
    const memberships: Array<{
      id: string;
      role: string;
      user: { name: string | null; email: string | null };
    }> = [];

    const histogram = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<number, number>;
    for (const r of reviews) histogram[r.rating] = (histogram[r.rating] ?? 0) + 1;
    const since30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const trendBuckets = Array<number>(30).fill(0);
    for (const r of reviews) {
      if (!r.postedAt) continue;
      const days = Math.floor((Date.now() - r.postedAt.getTime()) / (24 * 60 * 60 * 1000));
      const idx = 29 - days;
      if (r.postedAt.getTime() >= since30 && idx >= 0 && idx < 30) {
        trendBuckets[idx] = (trendBuckets[idx] ?? 0) + 1;
      }
    }
    const topics = new Map<string, number>();
    for (const r of reviews) {
      for (const t of r.topics ?? []) {
        topics.set(t, (topics.get(t) ?? 0) + 1);
      }
    }
    const topTopics = Array.from(topics.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);

    return {
      establishments,
      selected,
      selectedReviews: reviews,
      memberships,
      trainingProfile,
      ratingHistogram: histogram,
      trend30d: trendBuckets,
      topTopics,
    };
  });

  if (!data.selected) return <EmptyEstablishments />;

  // Fetch team memberships separately — user join is auth-domain, not RLS-scoped.
  // orgId is auth-derived from the session, so the WHERE filter is trusted.
  const memberships = await prisma.membership.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "asc" },
    take: 8,
    include: { user: { select: { name: true, email: true } } },
  });
  data.memberships = memberships;

  const activeCount = data.establishments.filter((e) => e._count.connections > 0).length;
  const totalReviews = data.selected.reviews.length;
  const avgRating =
    totalReviews > 0
      ? data.selected.reviews.reduce((a, b) => a + b.rating, 0) / totalReviews
      : null;
  const hours = (data.trainingProfile?.operatingHours as OperatingHours | null) ?? {};

  return (
    <AppShellServer
      topBar={<TopBar />}
      crumbs={["Workspace", "Establishments", data.selected.name]}
    >
      <PageHeader
        kicker={`${data.establishments.length} location${data.establishments.length === 1 ? "" : "s"} · ${activeCount} active`}
        title="Establishments"
        description="Every location, its review stream and team — rolled up to one composite score."
        actions={
          <>
            <button type="button" className="btn">
              <Icon name="filter" size={12} />
              Filter
            </button>
            <Link href="/establishments/new" className="btn btn--pri">
              <Icon name="plus" size={12} />
              Add establishment
            </Link>
          </>
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "300px minmax(0, 1fr)",
          gap: 18,
        }}
      >
        <LocationList establishments={data.establishments} selectedId={data.selected.id} />

        <div className="col" style={{ gap: 16 }}>
          <HeaderCard
            establishment={data.selected}
            totalReviews={totalReviews}
            avgRating={avgRating}
          />
          <DetailTabs totalReviews={totalReviews} teamCount={data.memberships.length} />
          <div className="grid-3" style={{ gap: 14 }}>
            <RatingDistribution histogram={data.ratingHistogram} total={totalReviews} />
            <TrendCard trend={data.trend30d} />
            <TopTopicsCard topics={data.topTopics} />
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1fr)",
              gap: 14,
            }}
          >
            <RecentReviewsCard reviews={data.selectedReviews.slice(0, 3)} />
            <div className="col" style={{ gap: 14 }}>
              <TeamCard memberships={data.memberships} />
              <HoursCard hours={hours} />
            </div>
          </div>
        </div>
      </div>
    </AppShellServer>
  );
}

function EmptyEstablishments() {
  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Workspace", "Establishments"]}>
      <PageHeader
        kicker="No locations yet"
        title="Add your first establishment"
        description="Locations are the rooted unit of a repulabs account. Each syncs its own reviews and rolls up to your composite score."
        actions={
          <Link href="/establishments/new" className="btn btn--pri">
            <Icon name="plus" size={12} />
            Add establishment
          </Link>
        }
      />
      <div
        className="ds-card"
        style={{ padding: 56, textAlign: "center", maxWidth: 540, marginInline: "auto" }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            margin: "0 auto 18px",
            background: "var(--pri-50)",
            color: "var(--pri)",
            display: "grid",
            placeItems: "center",
          }}
        >
          <Icon name="building" size={26} />
        </div>
        <h3 style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.015em" }}>
          Connect your first Google Business location
        </h3>
        <p className="dim" style={{ fontSize: 13, marginTop: 8, lineHeight: 1.6 }}>
          We'll pull existing reviews automatically and start drafting AI replies in your brand
          voice within 5 minutes.
        </p>
        <Link href="/establishments/new" className="btn btn--pri btn--lg" style={{ marginTop: 18 }}>
          <Icon name="plus" size={14} />
          Add establishment
        </Link>
      </div>
    </AppShellServer>
  );
}

function LocationList({
  establishments,
  selectedId,
}: {
  establishments: Array<{
    id: string;
    name: string;
    category: string | null;
    address: unknown;
    reviews: Array<{ rating: number }>;
    _count: { connections: number };
  }>;
  selectedId: string;
}) {
  return (
    <div className="ds-card" style={{ height: "fit-content" }}>
      <div style={{ padding: 10, borderBottom: "1px solid var(--line)" }}>
        <div
          className="row"
          style={{
            background: "var(--surface-3)",
            borderRadius: 8,
            padding: "6px 10px",
            gap: 6,
            fontSize: 12,
          }}
        >
          <Icon name="search" size={13} style={{ color: "var(--rl-muted)" }} />
          <input
            type="search"
            placeholder="Find a location"
            aria-label="Find a location"
            style={{
              border: 0,
              background: "transparent",
              height: 22,
              padding: 0,
              fontSize: 12.5,
              outline: "none",
              flex: 1,
              width: "100%",
              minWidth: 0,
            }}
          />
        </div>
      </div>
      {establishments.map((b, i) => {
        const isActive = b.id === selectedId;
        const tone = TONES[i % TONES.length] as 1 | 2 | 3 | 4 | 5 | 6 | 7;
        const addr = b.address as Address | null;
        const subLine = b.category ? `${shortAddress(addr)} · ${b.category}` : shortAddress(addr);
        const connected = b._count.connections > 0;
        const ratings = b.reviews.map((r) => r.rating);
        const avg = ratings.length > 0 ? ratings.reduce((a, c) => a + c, 0) / ratings.length : null;
        return (
          <Link
            key={b.id}
            href={`/establishments/${b.id}`}
            className="row"
            style={{
              padding: 12,
              background: isActive ? "var(--pri-50)" : "transparent",
              borderTop: i ? "1px solid var(--line)" : "none",
              position: "relative",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            {isActive && (
              <span
                style={{
                  position: "absolute",
                  left: 0,
                  top: 8,
                  bottom: 8,
                  width: 3,
                  background: "var(--pri)",
                  borderRadius: "0 2px 2px 0",
                }}
              />
            )}
            <Avatar name={b.name} size={32} tone={tone} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 500,
                  color: isActive ? "var(--pri)" : "var(--ink)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {b.name}
              </div>
              <div
                className="dim"
                style={{
                  fontSize: 11,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {subLine}
              </div>
            </div>
            {avg !== null ? (
              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {avg.toFixed(1)}
                </div>
                <div className="mono dim" style={{ fontSize: 9.5 }}>
                  {ratings.length}
                </div>
              </div>
            ) : (
              <span className="chip chip--warn" style={{ fontSize: 9.5 }}>
                {connected ? "No reviews" : "Pending"}
              </span>
            )}
          </Link>
        );
      })}
      <div style={{ padding: 12, borderTop: "1px solid var(--line)" }}>
        <Link
          href="/establishments/new"
          className="btn"
          style={{ width: "100%", justifyContent: "center" }}
        >
          <Icon name="plus" size={12} />
          Add new location
        </Link>
      </div>
    </div>
  );
}

function HeaderCard({
  establishment,
  totalReviews,
  avgRating,
}: {
  establishment: {
    id: string;
    name: string;
    category: string | null;
    address: unknown;
    googlePlaceId: string | null;
    _count: { connections: number };
  };
  totalReviews: number;
  avgRating: number | null;
}) {
  const addr = establishment.address as Address | null;
  const fullAddress = addressLine(addr);
  const isVerified = establishment._count.connections > 0;

  return (
    <div className="ds-card" style={{ padding: 20, position: "relative", overflow: "hidden" }}>
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
        <div style={{ flex: 1, minWidth: 280 }}>
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
              v={avgRating ? avgRating.toFixed(2) : "—"}
              suf={avgRating ? "/5" : undefined}
              stars={avgRating !== null}
            />
            <Stat l="Reviews" v={String(totalReviews)} />
            <Stat l="Verified" v={isVerified ? "Yes" : "No"} />
          </div>
        </div>
        <div className="col" style={{ gap: 6, alignItems: "flex-end" }}>
          {establishment.googlePlaceId && (
            <a
              href={`https://www.google.com/maps/place/?q=place_id:${establishment.googlePlaceId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn--sm"
            >
              <Icon name="ext" size={11} />
              Open Google card
            </a>
          )}
          <Link href={`/establishments/${establishment.id}`} className="btn btn--sm btn--pri">
            <Icon name="edit" size={11} />
            Edit profile
          </Link>
        </div>
      </div>
    </div>
  );
}

function Stat({
  l,
  v,
  suf,
  stars,
}: {
  l: string;
  v: string;
  suf?: string;
  stars?: boolean;
}) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--rl-muted)", fontWeight: 500 }}>{l}</div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 4,
          marginTop: 2,
        }}
      >
        <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}>{v}</span>
        {suf && <span style={{ fontSize: 12, color: "var(--rl-muted)" }}>{suf}</span>}
      </div>
      {stars && v !== "—" && <Stars value={Math.round(Number(v))} size={10} />}
    </div>
  );
}

function DetailTabs({
  totalReviews,
  teamCount,
}: {
  totalReviews: number;
  teamCount: number;
}) {
  const tabs: Array<{ t: string; n?: number; active?: boolean }> = [
    { t: "Overview", active: true },
    { t: "Reviews", n: totalReviews },
    { t: "Team", n: teamCount },
    { t: "Hours" },
    { t: "Settings" },
  ];
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button key={t.t} type="button" className={`tabs__t${t.active ? " is-active" : ""}`}>
          {t.t}
          {t.n !== undefined && (
            <span
              style={{
                fontFamily: "var(--f-mono)",
                fontSize: 10,
                padding: "1px 5px",
                borderRadius: 999,
                background: t.active ? "var(--pri-50)" : "var(--surface-3)",
                color: t.active ? "var(--pri)" : "var(--rl-muted)",
              }}
            >
              {t.n}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function RatingDistribution({
  histogram,
  total,
}: {
  histogram: Record<number, number>;
  total: number;
}) {
  const COLORS: Record<number, string> = {
    5: "var(--ok)",
    4: "#84CC16",
    3: "var(--warn)",
    2: "#F97316",
    1: "var(--bad)",
  };
  return (
    <div className="ds-card">
      <div className="ds-card__head">
        <h3 className="ds-card__title">Rating distribution</h3>
      </div>
      <div className="ds-card__body">
        {total === 0 ? (
          <div className="dim" style={{ fontSize: 12.5, padding: 20, textAlign: "center" }}>
            No reviews yet for this location.
          </div>
        ) : (
          [5, 4, 3, 2, 1].map((s) => {
            const n = histogram[s] ?? 0;
            const p = total > 0 ? Math.round((n / total) * 100) : 0;
            return (
              <div key={s} className="row" style={{ marginBottom: 6, fontSize: 12 }}>
                <span className="row" style={{ gap: 2, width: 38 }}>
                  <span className="mono">{s}</span>
                  <Icon name="star" size={11} style={{ color: "var(--gold)" }} />
                </span>
                <div className="gauge" style={{ flex: 1 }}>
                  <i style={{ width: `${p}%`, background: COLORS[s] }} />
                </div>
                <span className="mono dim" style={{ width: 38, textAlign: "right", fontSize: 11 }}>
                  {n}
                </span>
                <span className="mono" style={{ width: 32, textAlign: "right", fontSize: 11.5 }}>
                  {p}%
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function TrendCard({ trend }: { trend: number[] }) {
  const total = trend.reduce((a, b) => a + b, 0);
  const hasData = trend.some((v) => v > 0);
  return (
    <div className="ds-card">
      <div className="ds-card__head">
        <h3 className="ds-card__title">30-day trend</h3>
        <span className="chip chip--ok">+{total} reviews</span>
      </div>
      <div className="ds-card__body">
        {hasData ? (
          <Sparkline points={trend} width={260} height={56} />
        ) : (
          <div className="dim" style={{ fontSize: 12.5, padding: 20, textAlign: "center" }}>
            Trend builds as new reviews arrive.
          </div>
        )}
      </div>
    </div>
  );
}

function TopTopicsCard({ topics }: { topics: Array<[string, number]> }) {
  const max = Math.max(...topics.map((t) => t[1]), 1);
  return (
    <div className="ds-card">
      <div className="ds-card__head">
        <h3 className="ds-card__title">Words customers use</h3>
      </div>
      <div className="ds-card__body">
        {topics.length === 0 ? (
          <div className="dim" style={{ fontSize: 12.5, padding: 20, textAlign: "center" }}>
            Topics extracted from reviews land here as the AI processes them.
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              alignItems: "center",
              minHeight: 100,
            }}
          >
            {topics.map(([t, n]) => {
              const size = 10 + Math.round((n / max) * 14);
              return (
                <span
                  key={t}
                  style={{
                    padding: "3px 10px",
                    borderRadius: 999,
                    fontSize: `${size}px`,
                    background: "var(--pri-50)",
                    color: "var(--pri)",
                    fontWeight: 500,
                    lineHeight: 1.5,
                  }}
                >
                  {t}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function RecentReviewsCard({
  reviews,
}: {
  reviews: Array<{
    id: string;
    rating: number;
    reviewerName: string | null;
    body: string | null;
    postedAt: Date | null;
    reply: { id: string; status: string } | null;
  }>;
}) {
  return (
    <div className="ds-card">
      <div className="ds-card__head">
        <h3 className="ds-card__title">Recent reviews</h3>
        <Link href="/reviews" className="btn btn--xs">
          View all
        </Link>
      </div>
      <div style={{ padding: 4 }}>
        {reviews.length === 0 ? (
          <div className="dim" style={{ padding: 32, textAlign: "center", fontSize: 12.5 }}>
            <Icon name="star" size={28} style={{ color: "var(--gold)" }} />
            <p style={{ marginTop: 10 }}>No reviews yet for this location.</p>
          </div>
        ) : (
          reviews.map((r, i) => (
            <div
              key={r.id}
              style={{ padding: 14, borderTop: i ? "1px solid var(--line)" : "none" }}
            >
              <div className="row" style={{ marginBottom: 6 }}>
                <Avatar
                  name={r.reviewerName ?? "User"}
                  size={28}
                  tone={((i % 7) + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500 }}>
                    {r.reviewerName ?? "Anonymous"}
                  </div>
                  <div className="dim mono" style={{ fontSize: 10.5 }}>
                    {r.postedAt ? relativeTime(r.postedAt) : "—"}
                  </div>
                </div>
                <Stars value={r.rating} />
                {r.reply ? (
                  <span className="chip chip--ok">Replied</span>
                ) : (
                  <span className="chip chip--bad">Open</span>
                )}
              </div>
              {r.body && (
                <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-2)" }}>"{r.body}"</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function TeamCard({
  memberships,
}: {
  memberships: Array<{
    id: string;
    role: string;
    user: { name: string | null; email: string | null };
  }>;
}) {
  return (
    <div className="ds-card">
      <div className="ds-card__head">
        <h3 className="ds-card__title">Team · {memberships.length}</h3>
        <button type="button" className="btn btn--xs">
          <Icon name="plus" size={10} />
          Invite
        </button>
      </div>
      {memberships.length === 0 ? (
        <div className="dim" style={{ padding: 24, fontSize: 12.5 }}>
          You're the only one here.
        </div>
      ) : (
        <div style={{ padding: 4 }}>
          {memberships.map((m, i) => {
            const tone = ((i % 7) + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
            return (
              <div
                key={m.id}
                className="row"
                style={{
                  padding: "8px 12px",
                  borderTop: i ? "1px solid var(--line)" : "none",
                }}
              >
                <Avatar name={m.user.name ?? m.user.email ?? "User"} size={28} tone={tone} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{m.user.name ?? m.user.email}</div>
                  <div className="dim" style={{ fontSize: 11, textTransform: "capitalize" }}>
                    {m.role}
                  </div>
                </div>
                <Icon name={"chevR" as IconName} size={12} style={{ color: "var(--rl-muted-2)" }} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function HoursCard({ hours }: { hours: OperatingHours }) {
  const hasAny = Object.values(hours).some((h) => h?.open && h?.close);
  const todayIdx = (new Date().getDay() + 6) % 7;

  return (
    <div className="ds-card">
      <div className="ds-card__head">
        <h3 className="ds-card__title">Hours</h3>
        {hasAny && (
          <span className="chip chip--ok">
            <span className="live" />
            Open now
          </span>
        )}
      </div>
      <div style={{ padding: "8px 16px 14px" }}>
        {!hasAny ? (
          <div className="dim" style={{ fontSize: 12.5, padding: 20, textAlign: "center" }}>
            Set business hours in{" "}
            <Link href="/ai/training" style={{ color: "var(--pri)" }}>
              AI training
            </Link>{" "}
            to populate this card.
          </div>
        ) : (
          DAY_ORDER.map(([key, label], i) => {
            const h = hours[key] ?? {};
            const open = !!(h.open && h.close);
            const today = i === todayIdx;
            return (
              <div
                key={key}
                className="row"
                style={{
                  padding: "5px 0",
                  fontSize: 12,
                  color: open ? "var(--ink-2)" : "var(--rl-muted)",
                }}
              >
                <span style={{ width: 32, fontWeight: open ? 500 : 400 }}>{label}</span>
                <span className="mono" style={{ fontSize: 11 }}>
                  {open ? `${h.open} – ${h.close}` : "Closed"}
                </span>
                {open && today && (
                  <span className="chip chip--pri" style={{ marginLeft: "auto", fontSize: 9.5 }}>
                    TODAY
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
