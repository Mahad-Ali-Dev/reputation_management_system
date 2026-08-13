import { Icon } from "@/components/shell/icon";
import type { GbpInsights } from "@/lib/seo/adapters/gbp-insights";
import type { CoreWebVitals } from "@/lib/seo/adapters/pagespeed";
import type { CitationAuditView, Ga4SummaryView, KeywordRankView } from "@/lib/seo/queries";
import Link from "next/link";
import { CitationAuditTable } from "./citation-audit-table";
import { KeywordRankTable } from "./keyword-rank-table";

/**
 * SEO & Visibility tab (Module 13) — Pro-gated at the page level via
 * `<ProGateServer feature="rank_tracking">`; this component assumes entitlement
 * and focuses on the data. Every sub-section that needs a missing integration
 * renders a "Connect →" tile instead of an empty chart. Server-renderable
 * (pure props; the page fetches the data + adapter availability).
 */
export type SeoPanelData = {
  keywordRanks: KeywordRankView[];
  citations: CitationAuditView[];
  ga4: Ga4SummaryView;
  gbp: GbpInsights;
  vitals: CoreWebVitals;
  connected: { ga4: boolean; gbp: boolean; rankTracking: boolean };
};

export function SeoPanel({ data }: { data: SeoPanelData }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Keyword Rankings */}
      <Section title="Keyword rankings" icon="search">
        {data.connected.rankTracking ? (
          <KeywordRankTable ranks={data.keywordRanks} />
        ) : (
          <ConnectPrompt
            what="rank tracking"
            note="Track keyword positions + the Google Maps 3-pack across your service area."
          />
        )}
      </Section>

      {/* GBP Insights */}
      <Section title="Google Business Profile insights" icon="google">
        {data.gbp.available ? (
          <div
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
            }}
          >
            <Metric label="Profile views" value={fmtNum(data.gbp.views)} />
            <Metric label="Searches" value={fmtNum(data.gbp.searches)} />
            <Metric label="Direction requests" value={fmtNum(data.gbp.directions)} />
            <Metric label="Calls" value={fmtNum(data.gbp.calls)} />
          </div>
        ) : (
          <ConnectPrompt
            what="Google Business"
            note="Profile views, searches, direction requests, and calls from your Google listing."
            provider="google_business"
          />
        )}
      </Section>

      {/* GA4 traffic */}
      <Section title="Website traffic (GA4)" icon="bars">
        {data.connected.ga4 && data.ga4.connected ? (
          <div
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
            }}
          >
            <Metric
              label="Sessions"
              value={
                fmtNum(
                  data.gbp.available ? data.gbp.views : undefined,
                ) /* placeholder until ga4 live */
              }
            />
            <Metric label="Property" value={data.ga4.propertyId ?? "—"} small />
            <Metric label="Status" value={data.ga4.status ?? "—"} small />
          </div>
        ) : (
          <ConnectPrompt what="GA4" note="Sessions, bounce rate, and your top landing pages." />
        )}
      </Section>

      {/* Citation / NAP audit */}
      <Section title="Citation audit (NAP consistency)" icon="pin">
        <p style={{ fontSize: 12.5, color: "var(--rl-muted)", margin: "0 0 10px" }}>
          We compare your Name, Address &amp; Phone across the major directories against your
          canonical record. Inconsistencies hurt local ranking.
        </p>
        <CitationAuditTable rows={data.citations} />
      </Section>

      {/* Core Web Vitals */}
      <Section title="Core Web Vitals" icon="bolt">
        {data.vitals.available ? (
          <div
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
            }}
          >
            <Metric
              label="Performance"
              value={
                data.vitals.performanceScore != null ? String(data.vitals.performanceScore) : "—"
              }
            />
            <Metric
              label="LCP"
              value={data.vitals.lcpSeconds != null ? `${data.vitals.lcpSeconds}s` : "—"}
            />
            <Metric label="CLS" value={data.vitals.cls != null ? String(data.vitals.cls) : "—"} />
            <Metric
              label="INP"
              value={data.vitals.inpMs != null ? `${data.vitals.inpMs}ms` : "—"}
            />
          </div>
        ) : (
          <ConnectPrompt
            what="PageSpeed"
            note="Lighthouse performance score + LCP / CLS / INP for your website."
          />
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: { title: string; icon: import("@/components/shell/icon").IconName; children: React.ReactNode }) {
  return (
    <div className="ds-card">
      <div className="ds-card__head" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: "var(--pri)", display: "inline-flex" }}>
          <Icon name={icon} size={15} />
        </span>
        <div className="ds-card__title">{title}</div>
      </div>
      <div className="ds-card__body">{children}</div>
    </div>
  );
}

function Metric({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div style={{ background: "var(--surface-2)", borderRadius: 8, padding: "10px 12px" }}>
      <div style={{ fontSize: 11, color: "var(--rl-muted-2)" }}>{label}</div>
      <div
        style={{
          fontSize: small ? 13 : 22,
          fontWeight: small ? 500 : 700,
          color: "var(--ink)",
          fontVariantNumeric: "tabular-nums",
          marginTop: 3,
          wordBreak: "break-word",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function ConnectPrompt({
  what,
  note,
  provider,
}: { what: string; note: string; provider?: string }) {
  const href = provider ? "/connections#connection-sources" : "/connections";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "14px 16px",
        border: "1px dashed var(--line)",
        borderRadius: 8,
        background: "var(--surface-2)",
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <span style={{ color: "var(--rl-muted-2)", display: "inline-flex" }}>
          <Icon name="plug" size={16} />
        </span>
        <span style={{ fontSize: 13, color: "var(--rl-muted)" }}>{note}</span>
      </div>
      <Link href={href} className="btn btn--sm">
        <Icon name="plug" size={13} /> Connect {what} →
      </Link>
    </div>
  );
}

function fmtNum(n: number | undefined): string {
  return n != null ? n.toLocaleString() : "—";
}
