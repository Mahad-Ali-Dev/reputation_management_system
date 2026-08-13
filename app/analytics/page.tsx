import { AppShellServer } from "@/components/app-shell-server";
import { Icon } from "@/components/shell/icon";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import {
  type BusinessReport,
  type ReportBrand,
  buildBusinessReport,
  getReportBrand,
} from "@/lib/reports/queries";
import { parseReportRange } from "@/lib/reports/range";

import "./business-report.css";
import { AreaTrend, DayBars, Donut, Sparkline, StackedBar } from "./_components/charts";
import { ExportPdfButton } from "./_components/export-pdf-button";
import { ReportRangePicker } from "./_components/report-range-picker";

export const dynamic = "force-dynamic";

type SearchParams = { range?: string; from?: string; to?: string };

/**
 * Business Reports.
 *
 * A deliberately small report: the six things an owner actually asks about —
 * reviews, what Autopilot did, what got posted, disputes, device scans and
 * survey feedback — over a chosen window, printable as a branded PDF.
 *
 * This replaces the previous SEO/competitor/citation hub, which was locked
 * behind a coming-soon screen and error-paged in production. That code is
 * untouched in git history and its panels remain under `_components/` if any of
 * it is ever wanted back; nothing here depends on it.
 *
 * Every section is fail-soft in the data layer, so a missing table or a slow
 * query degrades one card instead of the page.
 */
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { orgId } = await getOrgContext();
  const range = parseReportRange(await searchParams);

  const [report, brand] = await Promise.all([
    buildBusinessReport(orgId, range),
    getReportBrand(orgId),
  ]);

  return (
    <AppShellServer
      topBar={<TopBar title="Business Reports" />}
      crumbs={["Insights", "Business Reports"]}
    >
      <div className="brp" id="business-report">
        <BrandHeader brand={brand} period={range.label} />

        <div className="brp-toolbar no-print">
          <ReportRangePicker
            preset={range.preset}
            fromInput={range.fromInput}
            toInput={range.toInput}
          />
          <ExportPdfButton />
        </div>

        <ReviewsCard data={report.reviews} days={range.days} />

        <div className="brp-grid-3">
          <AutopilotCard data={report.autopilot} />
          <SocialCard data={report.social} />
          <DisputesCard data={report.disputes} />
        </div>

        <div className="brp-grid-2">
          <DevicesLocationCard data={report.devices} />
          <DevicesCard data={report.devices} />
        </div>
        <SurveysCard data={report.surveys} />
      </div>
    </AppShellServer>
  );
}

// ── header ───────────────────────────────────────────────────────

function BrandHeader({ brand, period }: { brand: ReportBrand; period: string }) {
  return (
    <header className="brp-brand">
      {brand.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="brp-brand__logo" src={brand.logoUrl} alt="" aria-hidden="true" />
      ) : (
        <div className="brp-brand__logo brp-brand__fallback" aria-hidden="true">
          {brand.orgName.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="brp-brand__meta">
        <h1 className="brp-brand__name">{brand.orgName}</h1>
        {brand.ownerName && <p className="brp-brand__line">{brand.ownerName}</p>}
        {brand.address && <p className="brp-brand__line">{brand.address}</p>}
        {brand.locationCount > 1 && (
          <p className="brp-brand__line">{brand.locationCount} locations</p>
        )}
      </div>
      <div className="brp-brand__right">
        <p className="brp-brand__title">Business Report</p>
        <p className="brp-brand__period">{period}</p>
      </div>
    </header>
  );
}

// ── shared bits ──────────────────────────────────────────────────

function Card({
  title,
  sub,
  icon,
  children,
  breakBefore,
}: {
  title: string;
  sub?: string;
  icon: Parameters<typeof Icon>[0]["name"];
  children: React.ReactNode;
  breakBefore?: boolean;
}) {
  return (
    <section className={`brp-card${breakBefore ? " brp-section-break" : ""}`}>
      <div className="brp-card__head">
        <span className="brp-card__badge" aria-hidden="true">
          <Icon name={icon} size={16} />
        </span>
        <div>
          <h2 className="brp-card__title">{title}</h2>
          {sub && <p className="brp-card__sub">{sub}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Stat({
  value,
  label,
  delta,
}: {
  value: string | number;
  label: string;
  delta?: number | null;
}) {
  return (
    <div>
      <div className="brp-stat__value">
        {value}
        {typeof delta === "number" && (
          <span className={`brp-delta brp-delta--${delta >= 0 ? "up" : "down"}`}>
            {delta >= 0 ? "+" : ""}
            {delta}%
          </span>
        )}
      </div>
      <div className="brp-stat__label">{label}</div>
    </div>
  );
}

function Bars({ rows }: { rows: Array<{ label: string; count: number }> }) {
  if (rows.length === 0) return <p className="brp-empty">Nothing in this period.</p>;
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <div className="brp-bars">
      {rows.map((r) => (
        <div className="brp-bar" key={r.label}>
          <span>{r.label}</span>
          <span className="brp-bar__track">
            <span className="brp-bar__fill" style={{ width: `${(r.count / max) * 100}%` }} />
          </span>
          <span className="brp-bar__value">{r.count}</span>
        </div>
      ))}
    </div>
  );
}

/** A section whose data source failed. Named plainly so the reader knows the
 *  number is missing rather than zero — those mean very different things. */
function Unavailable() {
  return (
    <p className="brp-empty">
      This section couldn’t be loaded. The rest of the report is unaffected.
    </p>
  );
}

/** snake_case enum → "Snake case" for display. */
function humanize(s: string): string {
  const t = s.replace(/_/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// ── sections ─────────────────────────────────────────────────────

function ReviewsCard({ data, days }: { data: BusinessReport["reviews"]; days: number }) {
  return (
    <Card title="Reviews" sub="New reviews received over the selected period" icon="star">
      {!data.available ? (
        <Unavailable />
      ) : (
        <>
          <div className="brp-stats" style={{ marginBottom: 16 }}>
            <Stat value={data.total} label="New reviews" delta={data.changePct} />
            <Stat value={data.avgRating ?? "—"} label="Average rating" />
            <Stat value={data.previousTotal} label={`Previous ${days} days`} />
            <Stat
              value={data.byStar.find((s) => s.stars === 5)?.count ?? 0}
              label="5-star reviews"
            />
          </div>
          <div className="brp-grid-3">
            <AreaTrend points={data.series} title={`Review trend (last ${days} days)`} />
            <div>
              <p className="brp-chart__title">Rating breakdown</p>
              <Bars rows={data.byStar.map((s) => ({ label: `${s.stars} star`, count: s.count }))} />
              <div className="brp-stack__foot">
                <span>Total reviews</span>
                <span className="brp-num">{data.total}</span>
              </div>
            </div>
            <div>
              <p className="brp-chart__title">Where they came from</p>
              <Donut
                slices={data.bySource.map((s) => ({ label: humanize(s.source), count: s.count }))}
                centerLabel="reviews"
              />
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

function AutopilotCard({ data }: { data: BusinessReport["autopilot"] }) {
  return (
    <Card title="Autopilot" sub="Replies your AI handled automatically" icon="bot">
      {!data.available ? (
        <Unavailable />
      ) : (
        <>
          <div className="brp-stats" style={{ marginBottom: 16 }}>
            <Stat value={data.published} label="Auto-published" />
            <Stat value={data.drafted} label="Drafted for review" />
            <Stat value={data.needsHuman} label="Needed a human" />
          </div>
          <Sparkline points={data.series} label="Autopilot actions" />
          <Bars rows={data.byLoop.map((l) => ({ label: humanize(l.loop), count: l.count }))} />
        </>
      )}
    </Card>
  );
}

function SocialCard({ data }: { data: BusinessReport["social"] }) {
  return (
    <Card title="Posts published" sub="Content published per platform" icon="share">
      {!data.available ? (
        <Unavailable />
      ) : (
        <>
          <div className="brp-stats" style={{ marginBottom: 16 }}>
            <Stat value={data.posted} label="Published" />
            <Stat value={data.scheduled} label="Scheduled" />
            <Stat value={data.failed} label="Failed" />
          </div>
          <DayBars points={data.series} label="Posts published" />
          <Bars
            rows={data.byPlatform.map((p) => ({ label: humanize(p.platform), count: p.count }))}
          />
        </>
      )}
    </Card>
  );
}

function DisputesCard({ data }: { data: BusinessReport["disputes"] }) {
  return (
    <Card title="Dispute centre" sub="Reviews challenged with the platform" icon="flag">
      {!data.available ? (
        <Unavailable />
      ) : (
        <>
          <div className="brp-stats" style={{ marginBottom: 16 }}>
            <Stat value={data.total} label="Filed" />
            <Stat value={data.removed} label="Removed / upheld" />
            <Stat value={data.pending} label="Awaiting decision" />
          </div>
          <StackedBar
            segments={data.byStatus.map((s) => ({ label: s.status, count: s.count }))}
            totalLabel="Total"
          />
        </>
      )}
    </Card>
  );
}

function DevicesLocationCard({ data }: { data: BusinessReport["devices"] }) {
  return (
    <Card title="Scans by location" sub="Where your cards are being tapped" icon="pin">
      {!data.available ? (
        <Unavailable />
      ) : (
        <>
          <div className="brp-stats" style={{ marginBottom: 16 }}>
            <Stat value={data.totalScans} label="Total scans" />
            <Stat value={data.byLocation.length} label="Locations scanning" />
          </div>
          <Bars rows={data.byLocation.map((l) => ({ label: l.location, count: l.scans }))} />
        </>
      )}
    </Card>
  );
}

function DevicesCard({ data }: { data: BusinessReport["devices"] }) {
  return (
    <Card title="Scans by device" sub="Every card, stand and sticker in the field" icon="qr">
      {!data.available ? (
        <Unavailable />
      ) : data.byDevice.length === 0 ? (
        <p className="brp-empty">No scans recorded in this period.</p>
      ) : (
        <table className="brp-table">
          <thead>
            <tr>
              <th>Device</th>
              <th>Serial</th>
              <th>Location</th>
              <th className="brp-num">Scans</th>
            </tr>
          </thead>
          <tbody>
            {data.byDevice.map((d) => (
              <tr key={d.serial + d.label}>
                <td>{d.label}</td>
                <td>{d.serial}</td>
                <td>{d.location}</td>
                <td className="brp-num">{d.scans}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function SurveysCard({ data }: { data: BusinessReport["surveys"] }) {
  return (
    <Card
      title="Customer surveys"
      sub="What customers told you, in their own words"
      icon="survey"
      breakBefore
    >
      {!data.available ? (
        <Unavailable />
      ) : (
        <>
          <div className="brp-stats" style={{ marginBottom: 16 }}>
            <Stat value={data.responses} label="Responses" />
            <Stat value={data.completed} label="Completed" />
            <Stat value={data.avgRating ?? "—"} label="Average score" />
          </div>

          {data.byCampaign.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <p className="brp-card__sub" style={{ marginBottom: 8 }}>
                By survey
              </p>
              <Bars
                rows={data.byCampaign.map((c) => ({ label: c.campaign, count: c.responses }))}
              />
            </div>
          )}

          {data.detail.length === 0 ? (
            <p className="brp-empty">No survey responses in this period.</p>
          ) : (
            <>
              <p className="brp-card__sub" style={{ marginBottom: 8 }}>
                Individual responses
                {data.responses > data.detail.length &&
                  ` — showing the ${data.detail.length} most recent of ${data.responses}`}
              </p>
              {data.detail.map((r) => (
                <article className="brp-response" key={r.id}>
                  <div className="brp-response__head">
                    <span className="brp-response__who">{r.recipient ?? "Anonymous"}</span>
                    <span>
                      {r.campaign}
                      {r.rating !== null && ` · ${r.rating}`}
                      {r.submittedAt &&
                        ` · ${new Date(r.submittedAt).toLocaleDateString("en-AU", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}`}
                    </span>
                  </div>
                  {r.answers.length === 0 ? (
                    <p className="brp-empty">No answers recorded.</p>
                  ) : (
                    r.answers.map((a, i) => (
                      <p className="brp-qa" key={`${r.id}-${i}`}>
                        <span className="brp-qa__q">{a.prompt}</span>
                        <br />
                        <span className="brp-qa__a">{a.value}</span>
                      </p>
                    ))
                  )}
                </article>
              ))}
            </>
          )}
        </>
      )}
    </Card>
  );
}
