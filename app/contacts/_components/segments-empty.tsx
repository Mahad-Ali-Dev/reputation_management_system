"use client";

import { Icon, type IconName } from "@/components/shell/icon";
import type { SegmentCount } from "@/lib/contacts/segments";
import Link from "next/link";
import { useState } from "react";
import { AddContactDialog } from "./add-contact-dialog";

/**
 * Segments tab — empty state (kit design). Shown when the directory has no
 * contacts: the 7 (all-zero) segment metric cards, then a two-panel onboarding
 * row — a big contact-book panel with Import / Add + alternate import sources,
 * and a "Everything you need, in one place" education card. Client island so the
 * "Add your first contact" CTA opens the real add-contact modal.
 */

type SegMeta = { art?: string; icon?: IconName; tile: string };

const ART = "/assets/repulabs/contact-directory";

const SEG_META: Record<string, SegMeta> = {
  recent: { icon: "users", tile: "cd-kpi__tile--vio" },
  vip: { art: "icon-crown.svg", tile: "cd-kpi__tile--vio" },
  new_this_month: { icon: "plus", tile: "cd-kpi__tile--green" },
  has_phone: { icon: "phone", tile: "cd-kpi__tile--vio" },
  has_email: { icon: "mail", tile: "cd-kpi__tile--vio" },
  no_contact_info: { icon: "alert", tile: "cd-kpi__tile--orange" },
  shopify: { art: "shopify-bag.svg", tile: "cd-kpi__tile--green" },
};

const SOURCES: { icon: IconName; label: string; href: string }[] = [
  { icon: "file", label: "CSV File", href: "/contacts?tab=import" },
  { icon: "google", label: "Google Contacts", href: "/connections#connection-sources" },
  { icon: "mail", label: "Outlook", href: "/connections#connection-sources" },
  { icon: "more", label: "More", href: "/connections#connection-sources" },
];

const CHECKS = [
  "Organize and segment your contacts",
  "Track interactions and activity",
  "Engage across multiple channels",
  "Build stronger customer relationships",
];

export function SegmentsEmpty({
  segments,
  shopifyConnected,
}: {
  segments: SegmentCount[];
  shopifyConnected: boolean;
}) {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div>
      {/* 7 zero-value metric cards */}
      <div className="cd-seg-cards">
        {segments.map((seg) => {
          const meta = SEG_META[seg.key] ?? { icon: "users" as IconName, tile: "cd-kpi__tile--vio" };
          const needsConnect = seg.requiresConnection && !shopifyConnected;
          return (
            <div key={seg.key} className="cd-card cd-seg-card">
              <div className="cd-seg-card__top">
                <span className={`cd-seg-card__tile ${meta.tile}`}>
                  {meta.art ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`${ART}/${meta.art}`} alt="" aria-hidden width={18} height={18} style={{ display: "block" }} />
                  ) : (
                    <Icon name={meta.icon ?? "users"} size={18} />
                  )}
                </span>
                <span className="cd-seg-card__val">0</span>
              </div>
              <h4 className="cd-seg-card__name">{seg.label}</h4>
              <p className="cd-seg-card__desc">{seg.description}</p>
              <div className="cd-seg-card__cta">
                {needsConnect ? (
                  <Link href="/connections#connection-sources" className="cd-btn-out" style={{ color: "var(--cd-green-ink)", borderColor: "#bfe6cd" }}>
                    <Icon name="plug" size={12} />
                    Connect Shopify
                  </Link>
                ) : (
                  <Link href={`/contacts?seg=${seg.key}`} className="cd-btn-out">
                    View contacts
                    <Icon name="arrowR" size={12} />
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Onboarding row */}
      <div className="cd-ie-grid" style={{ marginBottom: 0, alignItems: "stretch" }}>
        {/* Main onboarding panel */}
        <div className="cd-card">
          <div className="cd-empty">
            <div className="cd-empty__art">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${ART}/segments-book.svg`} alt="" aria-hidden className="cd-illus cd-illus--book" />
            </div>
            <div>
              <span className="cd-pill">No contacts yet</span>
              <h2 className="cd-empty__title">Your contact directory is empty</h2>
              <p className="cd-empty__body">
                Bring all your customer connections together. Import your contacts or add new ones to
                start building stronger relationships.
              </p>
              <div className="cd-empty__actions">
                <Link href="/contacts?tab=import" className="btn btn--pri btn--sm">
                  <Icon name="upload" size={14} />
                  Import contacts
                </Link>
                <button type="button" className="cd-btn-out" onClick={() => setAddOpen(true)}>
                  <Icon name="plus" size={14} />
                  Add your first contact
                </button>
              </div>
              <div className="cd-or">OR</div>
              <p style={{ fontSize: 12.5, fontWeight: 600, color: "var(--cd-ink-2)", margin: "0 0 10px" }}>
                Import from other sources
              </p>
              <div className="cd-sources">
                {SOURCES.map((s) => (
                  <Link key={s.label} href={s.href} className="cd-source">
                    <Icon name={s.icon} size={14} />
                    {s.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Education panel */}
        <div className="cd-card cd-card--pad">
          <div style={{ display: "grid", placeItems: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${ART}/segments-connections.svg`} alt="" aria-hidden className="cd-illus cd-illus--edu" />
          </div>
          <h3 className="cd-edu__title" style={{ fontSize: 17 }}>Everything you need, in one place</h3>
          <ul className="cd-check" style={{ marginTop: 6 }}>
            {CHECKS.map((c) => (
              <li key={c}>
                <span className="cd-check__ico">
                  <Icon name="check" size={13} />
                </span>
                {c}
              </li>
            ))}
          </ul>
          <Link href="/contacts?tab=import" className="cd-btn-ghost-vio">
            <Icon name="play" size={14} />
            See how it works
          </Link>
        </div>
      </div>

      <AddContactDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
