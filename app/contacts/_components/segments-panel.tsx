import { Icon, type IconName } from "@/components/shell/icon";
import { getConnectedProviders } from "@/lib/connections/status";
import { recountSegments } from "@/lib/contacts/segments";
import Link from "next/link";

/**
 * Segments tab (server). Renders the code-defined, self-counting segments
 * (`lib/contacts/segments`) each with a LIVE count + description + "View
 * Contacts →" deep-link to `/contacts?seg=<key>` (the Contacts panel reuses the
 * identical predicate, so the count matches the filtered list). The Shopify
 * segment is connection-gated: shows "Connect Shopify" until linked. RSC-safe.
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

export async function SegmentsPanel({ orgId }: { orgId: string }) {
  const [segments, connected] = await Promise.all([
    recountSegments(orgId),
    getConnectedProviders(orgId),
  ]);

  return (
    <div>
      <div className="ds-card" style={{ marginBottom: 16, background: "var(--surface-2)" }}>
        <div className="ds-card__body" style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span style={{ color: "var(--pri)", display: "inline-flex", marginTop: 2 }}>
            <Icon name="filter" size={18} />
          </span>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", margin: 0 }}>Smart segments</h3>
            <p style={{ fontSize: 13, color: "var(--rl-muted)", marginTop: 4, marginBottom: 0, maxWidth: 620 }}>
              Auto-updating groups computed live from your directory — no setup, always current. Open
              one to see (and act on) exactly the contacts it counts.
            </p>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 14,
        }}
      >
        {segments.map((seg) => {
          const needsConnect = seg.requiresConnection && !connected.has(seg.requiresConnection);
          const icon = SEGMENT_ICONS[seg.key] ?? "users";
          return (
            <div key={seg.key} className="ds-card ds-card--hover" style={{ display: "flex", flexDirection: "column" }}>
              <div className="ds-card__body" style={{ flex: 1 }}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                  <span
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 9,
                      background: "var(--pri-50)",
                      color: "var(--pri)",
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    <Icon name={icon} size={17} />
                  </span>
                  <span className="stat__value" style={{ fontSize: 28, marginTop: 0 }}>
                    {seg.count.toLocaleString()}
                  </span>
                </div>
                <h4 style={{ fontSize: 14.5, fontWeight: 600, color: "var(--ink)", margin: "12px 0 4px" }}>
                  {seg.label}
                </h4>
                <p style={{ fontSize: 12.5, color: "var(--rl-muted)", margin: 0, lineHeight: 1.5 }}>
                  {seg.description}
                </p>
              </div>
              <div
                className="ds-card__head"
                style={{ borderTop: "1px solid var(--line)", borderBottom: "none", padding: "12px 20px" }}
              >
                {needsConnect ? (
                  <Link href="/connections#connection-sources" className="btn btn--sm" style={{ width: "100%", justifyContent: "center" }}>
                    <Icon name="plug" size={13} />
                    Connect Shopify
                  </Link>
                ) : (
                  <Link
                    href={`/contacts?seg=${seg.key}`}
                    className="btn btn--sm"
                    style={{ width: "100%", justifyContent: "center" }}
                  >
                    View contacts
                    <Icon name="arrowR" size={13} />
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
