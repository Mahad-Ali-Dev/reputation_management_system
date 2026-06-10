import { Icon, type IconName } from "@/components/shell/icon";
import { getConnectedProviders } from "@/lib/connections/status";
import { recountSegments } from "@/lib/contacts/segments";
import Link from "next/link";

/**
 * Segments rail (server) — the left column of the CRM workspace.
 *
 * Renders the same code-defined, self-counting segments as the Segments tab
 * (`lib/contacts/segments` → `recountSegments`, LIVE counts via withTenant/RLS),
 * as a vertical nav: "All contacts" + one row per segment. Each row deep-links
 * to `?seg=<key>` (preserving the active search/source/tag/contact params), so
 * the table filter reuses the IDENTICAL predicate as the displayed count. The
 * Shopify segment stays connection-gated ("Connect" CTA until linked). RSC-safe.
 */

const SEGMENT_ICONS: Record<string, IconName> = {
  recent: "clock",
  vip: "star",
  new_this_month: "plus",
  has_phone: "phone",
  has_email: "mail",
  no_contact_info: "alert",
  shopify: "plug",
};

export async function SegmentsRail({
  orgId,
  total,
  currentSeg,
  baseParams,
}: {
  orgId: string;
  /** Org-wide contact count (from getContactStats) for the "All contacts" row. */
  total: number;
  currentSeg?: string;
  /** Params to preserve when switching segments (q / source / tag / contact). */
  baseParams: Record<string, string | undefined>;
}) {
  const [segments, connected] = await Promise.all([
    recountSegments(orgId),
    getConnectedProviders(orgId),
  ]);

  function hrefFor(segKey: string | null): string {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(baseParams)) if (v) p.set(k, v);
    if (segKey) p.set("seg", segKey);
    const qs = p.toString();
    return qs ? `/contacts?${qs}` : "/contacts";
  }

  const activeKey = currentSeg && currentSeg !== "all" ? currentSeg : null;

  return (
    <nav className="ds-card" aria-label="Contact segments">
      <div className="ds-card__head">
        <h3 className="ds-card__title">Segments</h3>
        <span className="dim mono" style={{ fontSize: 10.5 }}>
          LIVE
        </span>
      </div>
      <ul className="crm-rail__list">
        <li>
          <Link
            href={hrefFor(null)}
            className={`crm-rail__item${activeKey === null ? " is-active" : ""}`}
            aria-current={activeKey === null ? "true" : undefined}
          >
            <span className="crm-rail__icon">
              <Icon name="users" size={14} />
            </span>
            <span className="crm-rail__label">All contacts</span>
            <span className="crm-rail__count">{total.toLocaleString()}</span>
          </Link>
        </li>
        <li aria-hidden className="crm-rail__divider" />
        {segments.map((seg) => {
          const needsConnect = seg.requiresConnection && !connected.has(seg.requiresConnection);
          const icon = SEGMENT_ICONS[seg.key] ?? "users";
          const isActive = activeKey === seg.key;
          return (
            <li key={seg.key}>
              <Link
                href={needsConnect ? "/connections#connection-sources" : hrefFor(seg.key)}
                className={`crm-rail__item${isActive ? " is-active" : ""}`}
                title={seg.description}
                aria-current={isActive ? "true" : undefined}
              >
                <span className="crm-rail__icon">
                  <Icon name={icon} size={14} />
                </span>
                <span className="crm-rail__label">{seg.label}</span>
                {needsConnect ? (
                  <span className="crm-rail__connect">Connect →</span>
                ) : (
                  <span className="crm-rail__count">{seg.count.toLocaleString()}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
