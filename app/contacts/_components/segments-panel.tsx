import { Icon, type IconName } from "@/components/shell/icon";
import { getConnectedProviders } from "@/lib/connections/status";
import { recountSegments, type SegmentCount } from "@/lib/contacts/segments";
import Link from "next/link";
import { SegmentsEmpty } from "./segments-empty";

/**
 * Segments tab (server) — re-skinned to the delivered kit.
 *
 * Renders the code-defined, self-counting segments (`lib/contacts/segments`),
 * each with a LIVE count via `recountSegments` (withTenant/RLS):
 *   1. seven metric cards (kit 7-up row) — value + description + "View contacts"
 *      deep-link to `/contacts?seg=<key>` (Contacts panel reuses the identical
 *      predicate, so the count matches the filtered list). Shopify is
 *      connection-gated ("Connect Shopify" until linked).
 *   2. a "Custom segments" table listing the same segments with a rule summary,
 *      audience size, and a live/paused status derived from the count.
 *   3. a right analytics column (segment performance + top-performing) computed
 *      from the real counts — no fabricated series.
 * When the whole directory is empty, swaps to the kit onboarding empty state.
 * RSC-safe.
 */

/** Kit SVG icon (crown, megaphone, …) or an app Icon name, per segment. */
type SegMeta = { art?: string; icon?: IconName; tile: string; rule?: string };

const ART = "/assets/repulabs/contact-directory";

const SEG_META: Record<string, SegMeta> = {
  recent: { icon: "users", tile: "cd-kpi__tile--vio", rule: "Any activity or interaction in the last 30 days." },
  vip: { art: "icon-crown.svg", tile: "cd-kpi__tile--vio", rule: "Flagged VIPs or contacts tagged “vip”." },
  new_this_month: { icon: "plus", tile: "cd-kpi__tile--green", rule: "Joined since the start of this calendar month." },
  has_phone: { icon: "phone", tile: "cd-kpi__tile--vio", rule: "Has a phone number on file (SMS-reachable)." },
  has_email: { icon: "mail", tile: "cd-kpi__tile--vio", rule: "Has an email address on file." },
  no_contact_info: { icon: "alert", tile: "cd-kpi__tile--orange", rule: "Neither email nor phone — enrich these." },
  shopify: { art: "shopify-bag.svg", tile: "cd-kpi__tile--green", rule: "Synced from a connected Shopify store." },
};

export async function SegmentsPanel({
  orgId,
  isEmptyDirectory,
}: {
  orgId: string;
  isEmptyDirectory: boolean;
}) {
  const [segments, connected] = await Promise.all([
    recountSegments(orgId),
    getConnectedProviders(orgId),
  ]);

  if (isEmptyDirectory) {
    return <SegmentsEmpty segments={segments} shopifyConnected={connected.has("shopify")} />;
  }

  const shopifyConnected = connected.has("shopify");

  // Right-column analytics, derived from the real counts (no invented series).
  const totalAudience = segments.reduce((s, x) => s + x.count, 0);
  const active = segments.filter((s) => s.count > 0);
  const top = [...segments].sort((a, b) => b.count - a.count)[0] ?? null;

  return (
    <div>
      {/* 7 metric cards — full-width row (matches the kit) */}
      <div className="cd-seg-cards">
        {segments.map((seg) => {
          const meta = SEG_META[seg.key] ?? { icon: "users" as IconName, tile: "cd-kpi__tile--vio", rule: seg.description };
          const needsConnect = seg.requiresConnection && !connected.has(seg.requiresConnection);
          return (
            <div key={seg.key} className="cd-card cd-seg-card">
              <div className="cd-seg-card__top">
                <span className={`cd-seg-card__tile ${meta.tile}`}>
                  <SegIcon meta={meta} />
                </span>
                <span className="cd-seg-card__val">{seg.count.toLocaleString()}</span>
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

      <div className="cd-seg-layout">
        <div className="cd-seg-left">
          {/* Custom segments table */}
          <div className="cd-card">
          <div className="cd-sec-head">
            <h3 className="cd-sec-title">Custom segments</h3>
            <span className="cd-badge cd-badge--info" style={{ background: "var(--cd-lav)", color: "var(--cd-vio)" }}>
              {active.length} live
            </span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="tbl cd-seg-tbl">
              <thead>
                <tr>
                  <th>Segment name</th>
                  <th>Rule summary</th>
                  <th style={{ textAlign: "right" }}>Audience</th>
                  <th>Status</th>
                  <th style={{ width: 90, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {segments.map((seg) => {
                  const meta = SEG_META[seg.key] ?? { icon: "users" as IconName, tile: "cd-kpi__tile--vio", rule: seg.description };
                  const needsConnect = seg.requiresConnection && !shopifyConnected;
                  const status = needsConnect
                    ? { cls: "cd-badge--warn", label: "Not connected" }
                    : seg.count > 0
                      ? { cls: "cd-badge--ok", label: "Active" }
                      : { cls: "cd-badge--warn", label: "Empty" };
                  return (
                    <tr key={seg.key}>
                      <td>
                        <div className="row" style={{ gap: 9, alignItems: "center" }}>
                          <span className={`cd-seg-tbl__ico ${meta.tile}`}>
                            <SegIcon meta={meta} size={15} />
                          </span>
                          <span style={{ fontWeight: 600, color: "var(--cd-ink)" }}>{seg.label}</span>
                        </div>
                      </td>
                      <td style={{ maxWidth: 320, color: "var(--cd-ink-2)", fontSize: 12.5 }}>{meta.rule}</td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600, color: "var(--cd-ink)" }}>
                        {needsConnect ? "—" : seg.count.toLocaleString()}
                      </td>
                      <td>
                        <span className={`cd-badge ${status.cls}`}>{status.label}</span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {needsConnect ? (
                          <Link href="/connections#connection-sources" className="cd-link" style={{ justifyContent: "flex-end" }}>
                            Connect
                          </Link>
                        ) : (
                          <Link href={`/contacts?seg=${seg.key}`} className="cd-link" style={{ justifyContent: "flex-end" }}>
                            View
                            <Icon name="arrowR" size={12} />
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="cd-sec-head" style={{ borderBottom: "none", borderTop: "1px solid var(--cd-line-2)", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, color: "var(--cd-muted)" }}>
              Showing {segments.length} of {segments.length} segments
            </span>
          </div>
        </div>
      </div>

      {/* Right analytics column */}
      <div className="cd-seg-right">
        <div className="cd-card cd-card--pad">
          <h3 className="cd-sec-title" style={{ fontSize: 15, marginBottom: 14 }}>Segment performance</h3>
          <div className="cd-perf-grid">
            <div className="cd-perf">
              <div className="cd-perf__l">Active segments</div>
              <div className="cd-perf__v">{active.length}</div>
            </div>
            <div className="cd-perf">
              <div className="cd-perf__l">Total audience</div>
              <div className="cd-perf__v">{totalAudience.toLocaleString()}</div>
            </div>
            <div className="cd-perf">
              <div className="cd-perf__l">Segments defined</div>
              <div className="cd-perf__v">{segments.length}</div>
            </div>
            <div className="cd-perf">
              <div className="cd-perf__l">Largest audience</div>
              <div className="cd-perf__v">{(top?.count ?? 0).toLocaleString()}</div>
            </div>
          </div>
        </div>

        {top && (
          <div className="cd-card cd-card--pad">
            <h3 className="cd-sec-title" style={{ fontSize: 15, marginBottom: 12 }}>Top segment</h3>
            <div className="row" style={{ gap: 12, alignItems: "center" }}>
              <span className="cd-seg-card__tile" style={{ width: 44, height: 44 }}>
                <SegIcon meta={SEG_META[top.key] ?? { icon: "users", tile: "" }} size={20} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: "var(--cd-ink)", fontSize: 14 }}>{top.label}</div>
                <div style={{ fontSize: 12, color: "var(--cd-muted)" }}>Audience size</div>
              </div>
              <span style={{ marginLeft: "auto", fontSize: 22, fontWeight: 700, color: "var(--cd-ink)", fontVariantNumeric: "tabular-nums" }}>
                {top.count.toLocaleString()}
              </span>
            </div>
          </div>
        )}

        <div className="cd-card cd-card--pad">
          <h3 className="cd-sec-title" style={{ fontSize: 15, marginBottom: 4 }}>Suggested actions</h3>
          <p className="cd-sec-sub" style={{ marginBottom: 14 }}>Turn a live segment into an outreach.</p>
          <ul className="cd-sugg">
            {active.slice(0, 3).map((seg) => (
              <li key={seg.key}>
                <div style={{ minWidth: 0 }}>
                  <div className="cd-sugg__t">Engage {seg.count.toLocaleString()} · {seg.label}</div>
                  <div className="cd-sugg__s">Send a targeted review request or message.</div>
                </div>
                <Link href={`/outreach?seg=${seg.key}`} className="cd-btn-out" style={{ flexShrink: 0 }}>
                  Create
                </Link>
              </li>
            ))}
            {active.length === 0 && (
              <li style={{ fontSize: 12.5, color: "var(--cd-muted)" }}>No populated segments yet.</li>
            )}
          </ul>
        </div>
      </div>
      </div>
    </div>
  );
}

/** Render either a kit SVG asset or an app Icon for a segment. */
function SegIcon({ meta, size = 18 }: { meta: SegMeta; size?: number }) {
  if (meta.art) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`${ART}/${meta.art}`} alt="" aria-hidden width={size} height={size} style={{ display: "block" }} />;
  }
  return <Icon name={meta.icon ?? "users"} size={size} />;
}

export type { SegmentCount };
