"use client";

import { Icon } from "@/components/shell/icon";
import { dismissRecommendation } from "@/lib/seo/actions";
import type { Recommendation } from "@/lib/seo/recommendations";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { GeoGrid, type GeoGridProps } from "./geo-grid";

/**
 * Recommendations tab (Module 13). Prioritized cards (review-gen + geo-posting)
 * each with an expected-impact line and a "Do it" CTA that deep-links to Review
 * Requests (Step 7) or schedules a geo-post (Step 10). A segmented control
 * switches between two sub-views: Geo-Location Strategy (the `<GeoGrid>` +
 * scheduling) and Photo Review Strategy (the photo funnel). Client island
 * (segmented state + dismiss/refresh).
 */

type SubView = "actions" | "geo" | "photo";

export function RecommendationsPanel({
  recommendations,
  geoGrid,
  establishmentId,
  canSchedule,
}: {
  recommendations: Recommendation[];
  geoGrid: GeoGridProps | null;
  establishmentId: string | null;
  canSchedule: boolean;
}) {
  const [view, setView] = useState<SubView>("actions");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Segmented control */}
      <div
        className="tabs"
        role="group"
        aria-label="Recommendation view"
        style={{ display: "inline-flex", alignSelf: "flex-start" }}
      >
        <Seg
          active={view === "actions"}
          onClick={() => setView("actions")}
          icon="bolt"
          label="Top actions"
        />
        <Seg
          active={view === "geo"}
          onClick={() => setView("geo")}
          icon="pin"
          label="Geo-location strategy"
        />
        <Seg
          active={view === "photo"}
          onClick={() => setView("photo")}
          icon="image"
          label="Photo review strategy"
        />
      </div>

      {/* Keep panels mounted; toggle visibility so state survives a switch. */}
      <div hidden={view !== "actions"}>
        <ActionsView
          recommendations={recommendations}
          establishmentId={establishmentId}
          canSchedule={canSchedule}
        />
      </div>
      <div hidden={view !== "geo"}>
        <GeoView geoGrid={geoGrid} />
      </div>
      <div hidden={view !== "photo"}>
        <PhotoView />
      </div>
    </div>
  );
}

function Seg({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: import("@/components/shell/icon").IconName;
  label: string;
}) {
  return (
    <button
      type="button"
      className={active ? "tabs__t is-active" : "tabs__t"}
      onClick={onClick}
      aria-pressed={active}
    >
      <Icon name={icon} size={13} /> {label}
    </button>
  );
}

function ActionsView({
  recommendations,
  establishmentId,
  canSchedule,
}: {
  recommendations: Recommendation[];
  establishmentId: string | null;
  canSchedule: boolean;
}) {
  if (recommendations.length === 0) {
    return (
      <div className="ds-card">
        <div className="ds-card__body" style={{ textAlign: "center", padding: "32px 16px" }}>
          <div style={{ color: "var(--ok)", display: "inline-flex" }}>
            <Icon name="checkCircle" size={28} />
          </div>
          <p style={{ fontSize: 14, color: "var(--ink)", margin: "10px 0 2px", fontWeight: 600 }}>
            You're on track
          </p>
          <p style={{ fontSize: 13, color: "var(--rl-muted)", margin: 0 }}>
            No high-impact actions right now. We'll surface new ones as your data changes.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {recommendations.map((r, i) => (
        <RecommendationCard
          key={`${r.kind}-${i}`}
          rec={r}
          establishmentId={establishmentId}
          canSchedule={canSchedule}
        />
      ))}
    </div>
  );
}

function RecommendationCard({
  rec,
  establishmentId,
  canSchedule,
}: {
  rec: Recommendation;
  establishmentId: string | null;
  canSchedule: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;

  const isReviewGen = rec.kind === "review_gen";
  const cardKey = `${rec.kind}:${rec.headline}`;

  function onDismiss() {
    setHidden(true);
    const fd = new FormData();
    fd.set("key", cardKey);
    startTransition(async () => {
      await dismissRecommendation(fd);
    });
  }

  return (
    <div className="ds-card">
      <div className="ds-card__body" style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <span
          style={{
            display: "inline-flex",
            width: 34,
            height: 34,
            borderRadius: 8,
            alignItems: "center",
            justifyContent: "center",
            background: isReviewGen
              ? "color-mix(in srgb, var(--pri) 12%, transparent)"
              : "color-mix(in srgb, var(--warn) 16%, transparent)",
            color: isReviewGen ? "var(--pri)" : "var(--warn)",
            flexShrink: 0,
          }}
        >
          <Icon name={isReviewGen ? "star" : "pin"} size={17} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{rec.headline}</div>
          <div
            style={{
              fontSize: 12.5,
              color: "var(--ok)",
              marginTop: 3,
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <Icon name="trend" size={12} /> {rec.expectedImpact}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {isReviewGen ? (
            <Link
              href={(rec.payload.href as string) ?? "/outreach"}
              className="btn btn--sm btn--pri"
            >
              Send requests →
            </Link>
          ) : canSchedule ? (
            <GeoDoItButton
              rec={rec}
              establishmentId={establishmentId}
              onDone={() => router.refresh()}
            />
          ) : (
            <Link href="/subscription?feature=competitor_intel" className="btn btn--sm">
              <Icon name="lock" size={12} /> Upgrade
            </Link>
          )}
          <button
            type="button"
            onClick={onDismiss}
            disabled={pending}
            aria-label="Dismiss"
            title="Dismiss"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--rl-muted-2)",
              display: "inline-flex",
              padding: 4,
            }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function GeoDoItButton({
  rec,
  establishmentId,
  onDone,
}: {
  rec: Recommendation;
  establishmentId: string | null;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [drafted, setDrafted] = useState(false);
  // Lazy import to avoid a server-action import cost on every card mount.
  function onClick() {
    startTransition(async () => {
      const { scheduleGeoPost } = await import("@/lib/seo/actions");
      const fd = new FormData();
      fd.set("lat", String(rec.payload.lat ?? 0));
      fd.set("lng", String(rec.payload.lng ?? 0));
      if (rec.payload.keyword) fd.set("keyword", String(rec.payload.keyword));
      if (establishmentId) fd.set("establishmentId", establishmentId);
      const res = await scheduleGeoPost(fd);
      if (res.ok) setDrafted(true);
      onDone();
    });
  }
  if (drafted) {
    // Honest: a draft was saved for review — it is NOT auto-published.
    return (
      <Link href="/social/posts" className="btn btn--sm">
        <Icon name="check" size={12} /> Draft saved — review in Social →
      </Link>
    );
  }
  return (
    <button type="button" className="btn btn--sm btn--pri" onClick={onClick} disabled={pending}>
      {pending ? "Saving draft…" : "Draft post in Social →"}
    </button>
  );
}

function GeoView({ geoGrid }: { geoGrid: GeoGridProps | null }) {
  return (
    <div className="ds-card">
      <div className="ds-card__head">
        <div className="ds-card__title">Geo-location strategy</div>
        <div className="ds-card__sub">
          Your 5-mile ranking heatmap. Click a weak cell to draft a geo-tagged post — it’s saved to
          Social for you to review and publish.
        </div>
      </div>
      <div className="ds-card__body">
        {geoGrid ? (
          <GeoGrid {...geoGrid} />
        ) : (
          <p style={{ fontSize: 13, color: "var(--rl-muted)", margin: 0 }}>
            No geo grid yet. Connect rank tracking and set a keyword + radius to map your local
            visibility.
          </p>
        )}
      </div>
    </div>
  );
}

function PhotoView() {
  const steps = [
    {
      icon: "qr" as const,
      title: "Place a QR plaque on the counter",
      body: "Customers scan it to leave a review with a photo — photos boost listing rank + trust.",
    },
    {
      icon: "image" as const,
      title: "Ask for a photo at the moment of delight",
      body: "A picture of the finished work or happy moment converts far better than a text-only ask.",
    },
    {
      icon: "send" as const,
      title: "Follow up with a photo-review request",
      body: "Post-visit, send a request that nudges for a photo. Wire this through Review Requests.",
    },
  ];
  return (
    <div className="ds-card">
      <div className="ds-card__head">
        <div className="ds-card__title">Photo review strategy</div>
        <div className="ds-card__sub">
          Photo reviews rank higher and convert better. Here's the funnel.
        </div>
      </div>
      <div className="ds-card__body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {steps.map((s, i) => (
          <div key={s.title} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <span
              style={{
                display: "inline-flex",
                width: 30,
                height: 30,
                borderRadius: 8,
                alignItems: "center",
                justifyContent: "center",
                background: "var(--surface-3)",
                color: "var(--pri)",
                flexShrink: 0,
              }}
            >
              <Icon name={s.icon} size={15} />
            </span>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>
                {i + 1}. {s.title}
              </div>
              <p
                style={{
                  fontSize: 12.5,
                  color: "var(--rl-muted)",
                  margin: "2px 0 0",
                  lineHeight: 1.5,
                }}
              >
                {s.body}
              </p>
            </div>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/outreach" className="btn btn--sm btn--pri">
            <Icon name="send" size={13} /> Set up photo-review requests
          </Link>
          <Link href="/hardware" className="btn btn--sm">
            <Icon name="qr" size={13} /> Order a QR plaque
          </Link>
        </div>
      </div>
    </div>
  );
}
