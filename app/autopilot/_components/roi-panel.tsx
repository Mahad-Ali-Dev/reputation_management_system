"use client";

import { Icon } from "@/components/shell/icon";
import { saveRoiSettings } from "@/lib/roi/actions";
import type { RoiByChannel } from "@/lib/roi/estimate";
import { type JSX, useState, useTransition } from "react";
import "./autopilot-roi.css";

/**
 * Real kit illustrations (designs/autopilot/ROI section/illustrations/*),
 * extracted to /assets/repulabs/autopilot/roi-*. Each is a glyph in a soft
 * rounded tile baked into the asset — so the wrapper just sizes it, no CSS tint.
 */
const ASSETS = "/assets/repulabs/autopilot";

/** Currency codes for the Revenue assumptions form — display is a plain
 *  `${code} ${amount}` string (see fmtMoney below), so any ISO 4217-style
 *  code works; this is just a curated pick list instead of free text. */
const CURRENCY_OPTIONS = [
  { code: "USD", label: "USD US Dollar" },
  { code: "EUR", label: "EUR Euro" },
  { code: "GBP", label: "GBP British Pound" },
  { code: "CAD", label: "CAD Canadian Dollar" },
  { code: "AUD", label: "AUD Australian Dollar" },
  { code: "NZD", label: "NZD New Zealand Dollar" },
  { code: "INR", label: "INR Indian Rupee" },
  { code: "PKR", label: "PKR Pakistani Rupee" },
  { code: "AED", label: "AED UAE Dirham" },
  { code: "SAR", label: "SAR Saudi Riyal" },
  { code: "SGD", label: "SGD Singapore Dollar" },
  { code: "HKD", label: "HKD Hong Kong Dollar" },
  { code: "JPY", label: "JPY Japanese Yen" },
  { code: "CNY", label: "CNY Chinese Yuan" },
  { code: "ZAR", label: "ZAR South African Rand" },
  { code: "BRL", label: "BRL Brazilian Real" },
  { code: "MXN", label: "MXN Mexican Peso" },
  { code: "CHF", label: "CHF Swiss Franc" },
  { code: "SEK", label: "SEK Swedish Krona" },
  { code: "NOK", label: "NOK Norwegian Krone" },
  { code: "DKK", label: "DKK Danish Krone" },
] as const;

/**
 * ROI panel (Module 15) — design-kit rebuild (tasks/autopilot/autopilot/
 * ROI section, active + empty handoffs).
 *
 * Layout per the kit: row 1 = "Estimated booked revenue" (KPI + mini metrics +
 * by-source mini chart) beside "The funnel" (stage metrics + colored flow
 * ribbon); row 2 = "Where reviews came from" + "Estimated revenue by source"
 * stacked on the left, the tall "Revenue assumptions" form on the right.
 *
 * LIVE DATA ONLY: every figure binds to the props the page already computes
 * (funnel attribution, `estimateRevenue` by-channel split, action ledger).
 * Money always formats with the org's RoiSettings currency. The empty state
 * (org has no funnel data) renders the kit's zero-state: illustration in the
 * trend slot, "No bookings yet" / "No reviews yet" badges, blank assumption
 * fields and a "Set your average job value" CTA. Settings still persist via
 * `saveRoiSettings` (manager+ server action) — same contract as before.
 */

export type RoiPanelData = {
  funnel: {
    scans: number;
    reviews: {
      total: number;
      fromQr: number;
      fromOutreach: number;
      fromVoice: number;
      organic: number;
    };
    gbpViews: number | null;
    calls: number;
    bookings: { total: number; confirmed: number };
  };
  estimatedRevenue: number;
  currency: string;
  topDriver: string;
  byChannel: RoiByChannel;
  settings: {
    establishmentId: string | null;
    averageJobValue: number | null;
    bookingToJobRate: number;
    currency: string;
  };
  establishments: { id: string; name: string }[];
  rangeLabel: string;
  /** Real ledger-derived counts (last 30 days). `hoursSaved` is an estimate from action counts × avg handling minutes. */
  automation: {
    actions: number;
    hoursSaved: number;
  };
};

/* ------------------------------------------------------------------ */
/* Formatting helpers (org currency — NEVER hardcoded)                 */
/* ------------------------------------------------------------------ */

function fmtMoney(currency: string, n: number): string {
  return `${currency} ${Math.round(n).toLocaleString()}`;
}

/** Kit's compact money ("PKR 184.5k") for the mini cards + summary rows. */
function fmtMoneyCompact(currency: string, n: number): string {
  if (n >= 1000) {
    return `${currency} ${(n / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k`;
  }
  return fmtMoney(currency, n);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ------------------------------------------------------------------ */
/* Charts (pure SVG, data-driven — codebase chart idiom)               */
/* ------------------------------------------------------------------ */

type Pt = { x: number; y: number };

function curveThrough(pts: Pt[]): string {
  let d = "";
  let prev = pts[0];
  if (!prev) return d;
  for (const b of pts.slice(1)) {
    const dx = (b.x - prev.x) * 0.45;
    d += ` C ${r1(prev.x + dx)},${r1(prev.y)} ${r1(b.x - dx)},${r1(b.y)} ${r1(b.x)},${r1(b.y)}`;
    prev = b;
  }
  return d;
}

function bandPath(top: Pt[], bot: Pt[]): string {
  const t0 = top[0];
  const rev = [...bot].reverse();
  const b0 = rev[0];
  if (!t0 || !b0) return "";
  return `M ${r1(t0.x)},${r1(t0.y)}${curveThrough(top)} L ${r1(b0.x)},${r1(b0.y)}${curveThrough(rev)} Z`;
}

function r1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * The kit's colored funnel flow (indigo / pink / amber ribbons). Ribbon
 * thickness at each stage column scales with the REAL stage value (sqrt-eased
 * so small tails stay visible). With zero data it falls back to the kit's
 * decorative empty-state shape — the handoff requires the colored funnel to
 * stay visible, never a blank rectangle.
 */
function FunnelStream({ stages }: { stages: number[] }): JSX.Element {
  const W = 600;
  const H = 120;
  const xs = [4, 152, 300, 448, 594];
  const max = Math.max(...stages);
  const fallback = [1, 0.66, 0.45, 0.3, 0.2];
  // Band shares shift along x so the ribbons appear to cross (kit visual).
  const cols = xs.map((x, i) => {
    const n = max > 0 ? Math.sqrt(Math.max(stages[i] ?? 0, 0) / max) : (fallback[i] ?? 0.2);
    const h = 26 + 78 * n;
    const fr = i / (xs.length - 1);
    const y0 = 60 - h / 2;
    const y1 = y0 + h * (0.42 - 0.32 * fr);
    const y2 = y1 + h * (0.28 + 0.06 * fr);
    const y3 = y2 + h * (0.2 - 0.02 * fr);
    const y4 = y3 + h * (0.1 + 0.28 * fr);
    return { x, h, y0, y1, y2, y3, y4 };
  });
  const last = cols[cols.length - 1];
  const pts = (top: (c: (typeof cols)[number]) => number) =>
    cols.map((c) => ({ x: c.x, y: top(c) }));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      {[152, 300, 448].map((x) => (
        <line key={x} x1={x} y1={10} x2={x} y2={H - 10} stroke="#E6EDF2" strokeWidth={1} />
      ))}
      <path
        d={bandPath(
          pts((c) => c.y0),
          pts((c) => c.y1),
        )}
        fill="#5B5CFF"
      />
      <path
        d={bandPath(
          pts((c) => c.y1),
          pts((c) => c.y2),
        )}
        fill="#EC5A7E"
      />
      <path
        d={bandPath(
          pts((c) => c.y2),
          pts((c) => c.y3),
        )}
        fill="#FBBF24"
      />
      <path
        d={bandPath(
          pts((c) => c.y3),
          pts((c) => c.y4),
        )}
        fill="#5B5CFF"
      />
      {last && (
        <rect x={W - 6} y={r1(last.y0)} width={5} height={r1(last.h)} rx={2.5} fill="#F59E0B" />
      )}
    </svg>
  );
}

/** Mini chart in the revenue card: pale bars + blue line over the four REAL per-source revenue figures. */
function RevenueMiniChart({ values }: { values: number[] }): JSX.Element {
  const W = 168;
  const H = 92;
  const max = Math.max(...values, 1);
  const slot = W / values.length;
  const items = values.map((v, i) => ({
    x: slot * i + slot / 2,
    y: H - 12 - (H - 36) * (v / max),
    bh: 14 + (H - 40) * (v / max) * 0.8,
  }));
  const line = items.map((p, i) => `${i === 0 ? "M" : "L"} ${r1(p.x)},${r1(p.y)}`).join(" ");
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      {items.map((p) => (
        <rect
          key={`b-${p.x}`}
          x={r1(p.x - 8)}
          y={r1(H - 4 - p.bh)}
          width={16}
          height={r1(p.bh)}
          rx={8}
          fill="#EAF0FF"
        />
      ))}
      <path
        d={line}
        fill="none"
        stroke="#315BFF"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {items.map((p, i) => (
        <circle
          key={`d-${p.x}`}
          cx={r1(p.x)}
          cy={r1(p.y)}
          r={i === items.length - 1 ? 4.5 : 3}
          fill="#315BFF"
        />
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

const DOT = {
  blue: "var(--apr-indigo)",
  orange: "var(--apr-orange)",
  purple: "var(--apr-purple)",
  green: "var(--apr-green)",
  cyan: "var(--apr-cyan)",
} as const;

export function RoiPanel({ data }: { data: RoiPanelData }): JSX.Element {
  const cur = data.currency;
  const f = data.funnel;
  const totalReviews = f.reviews.total;
  const isEmpty =
    f.scans === 0 &&
    totalReviews === 0 &&
    f.calls === 0 &&
    f.bookings.total === 0 &&
    data.estimatedRevenue === 0;

  const reviewedPct =
    f.scans > 0 && totalReviews > 0 ? Math.round((totalReviews / f.scans) * 100) : null;

  // Voice→Review retired (2026-08) — no new rows can be attributed to it.
  // NOTE: the reduce seed below previously used tone "green", which only
  // type-checked because the Voice row contributed that variant to the inferred
  // union. Typed explicitly so removing a row can't break the seed again.
  type SourceTone = "purple" | "blue" | "orange";
  type SourceRow = { key: string; label: string; value: number; tone: SourceTone };
  const sources: SourceRow[] = [
    { key: "outreach", label: "Review requests", value: f.reviews.fromOutreach, tone: "purple" },
    { key: "qr", label: "QR plaques", value: f.reviews.fromQr, tone: "blue" },
    { key: "organic", label: "Organic", value: f.reviews.organic, tone: "orange" },
  ];
  const topSource = sources.reduce<SourceRow>((a, b) => (b.value > a.value ? b : a), {
    key: "none",
    label: "",
    value: 0,
    tone: "purple",
  });

  const stageMetrics = [
    { key: "scans", label: "QR scans", value: f.scans as number | null, dot: DOT.blue },
    { key: "reviews", label: "Reviews", value: totalReviews as number | null, dot: DOT.orange },
    { key: "views", label: "Views", value: f.gbpViews, dot: DOT.purple },
    { key: "calls", label: "Calls", value: f.calls as number | null, dot: DOT.green },
    { key: "bookings", label: "Bookings", value: f.bookings.total as number | null, dot: DOT.cyan },
  ];

  const bySource = [
    {
      key: "bookings",
      label: "Bookings",
      value: data.byChannel.bookings,
      art: `${ASSETS}/roi-by-bookings.png`,
      tone: "green" as const,
    },
    {
      key: "outreach",
      label: "Review requests",
      value: data.byChannel.outreachReviews,
      art: `${ASSETS}/roi-by-reqreview.png`,
      tone: "purple" as const,
    },
    {
      key: "qr",
      label: "QR plaques",
      value: data.byChannel.qrReviews,
      art: `${ASSETS}/roi-by-qr.png`,
      tone: "blue" as const,
    },
  ] as const;
  const maxChannel = Math.max(...bySource.map((c) => c.value), 1);

  function focusAvgJobValue() {
    const el = document.getElementById("apr-input-avg") as HTMLInputElement | null;
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus({ preventScroll: true });
  }

  const rangePill = capitalize(data.rangeLabel);

  return (
    <div className="apr-root">
      {/* ---- Row 1: Estimated booked revenue | The funnel ---- */}
      <div className="apr-row1">
        <section className="apr-card apr-rev" aria-label="Estimated booked revenue">
          <div className="apr-rev__top">
            <div className="apr-head">
              <span className="apr-badge">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="apr-badge__art"
                  src={`${ASSETS}/roi-book-revenue.png`}
                  alt=""
                  width={44}
                  height={44}
                />
              </span>
              <div className="apr-head__text">
                <h3 className="apr-title">Estimated booked revenue</h3>
                <p className="apr-sub">Estimated from your review funnel not booked revenue.</p>
              </div>
            </div>
            <div className="apr-minis">
              <div className="apr-minis__caption">Revenue trend</div>
              <div className="apr-minis__row">
                <div className="apr-mini">
                  <span className="apr-mini__value">
                    <span
                      className="apr-dot"
                      style={{ background: DOT.orange }}
                      aria-hidden="true"
                    />
                    {totalReviews.toLocaleString()}
                  </span>
                  <div className="apr-mini__label">Reviews</div>
                </div>
                <div className="apr-mini">
                  <span className="apr-mini__value">
                    <span
                      className="apr-dot"
                      style={{ background: DOT.green }}
                      aria-hidden="true"
                    />
                    {f.calls.toLocaleString()}
                  </span>
                  <div className="apr-mini__label">Calls</div>
                </div>
                <div className="apr-mini">
                  <span className="apr-mini__value">
                    <span className="apr-dot" style={{ background: DOT.cyan }} aria-hidden="true" />
                    {f.bookings.total.toLocaleString()}
                  </span>
                  <div className="apr-mini__label">Bookings</div>
                </div>
              </div>
            </div>
          </div>

          <div className="apr-rev__body">
            <div className="apr-rev__left">
              <div className="apr-kpi">{fmtMoney(cur, data.estimatedRevenue)}</div>
              <div className="apr-rev__pills">
                <span className="apr-pill apr-pill--mint">
                  {f.bookings.total > 0
                    ? `${f.bookings.total.toLocaleString()} bookings`
                    : "No bookings yet"}
                </span>
                <span className="apr-pill apr-pill--blue">{rangePill}</span>
                {data.topDriver !== "—" && !isEmpty && (
                  <span className="apr-pill apr-pill--amber">Top driver: {data.topDriver}</span>
                )}
              </div>
              {isEmpty && data.settings.averageJobValue == null && (
                <button type="button" className="apr-cta" onClick={focusAvgJobValue}>
                  <Icon name="sliders" size={12} />
                  Set your average job value
                </button>
              )}
            </div>
            <div className="apr-rev__chart">
              {isEmpty ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className="apr-emptyart"
                  src={`${ASSETS}/roi-empty-rev.png`}
                  alt=""
                  width={132}
                  height={132}
                />
              ) : (
                <RevenueMiniChart
                  values={[
                    data.byChannel.qrReviews,
                    data.byChannel.outreachReviews,
                    data.byChannel.voiceReviews,
                    data.byChannel.bookings,
                  ]}
                />
              )}
            </div>
          </div>
        </section>

        <section className="apr-card apr-funnel" aria-label="The funnel">
          <div className="apr-head">
            <span className="apr-badge">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="apr-badge__art"
                src={`${ASSETS}/roi-funnel.png`}
                alt=""
                width={44}
                height={44}
              />
            </span>
            <div className="apr-head__text">
              <h3 className="apr-title">The funnel</h3>
              <p className="apr-sub">Conversion flow by stage</p>
            </div>
            <span className="apr-pill apr-pill--gray">Reviews → $</span>
          </div>

          <div className="apr-funnel__panel">
            <div className="apr-fmetrics">
              {stageMetrics.map((m) => (
                <div key={m.key} className="apr-fmetric">
                  <span className="apr-fmetric__value">
                    <span className="apr-dot" style={{ background: m.dot }} aria-hidden="true" />
                    {m.value === null ? "—" : m.value.toLocaleString()}
                  </span>
                  <div
                    className="apr-fmetric__label"
                    title={
                      m.key === "views" && m.value === null
                        ? "Connect Google Business Profile"
                        : undefined
                    }
                  >
                    {m.label}
                  </div>
                </div>
              ))}
            </div>
            <div className="apr-fstream">
              <FunnelStream
                stages={[f.scans, totalReviews, f.gbpViews ?? 0, f.calls, f.bookings.total]}
              />
            </div>
            <div className="apr-fbadges">
              <span className="apr-pill apr-pill--blue">
                {reviewedPct !== null
                  ? `${reviewedPct}% reviewed`
                  : totalReviews > 0
                    ? `${totalReviews.toLocaleString()} reviews`
                    : "No reviews yet"}
              </span>
              <span className="apr-pill apr-pill--amber">
                {f.bookings.total > 0
                  ? `${f.bookings.total.toLocaleString()} bookings won`
                  : "No bookings yet"}
              </span>
            </div>
          </div>
        </section>
      </div>

      {/* ---- Row 2: sources + revenue-by-source | revenue assumptions ---- */}
      <div className="apr-grid">
        <div className="apr-stack">
          <section className="apr-card" aria-label="Where reviews came from">
            <div className="apr-head">
              <span className="apr-badge">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="apr-badge__art"
                  src={`${ASSETS}/roi-came-reviews.png`}
                  alt=""
                  width={44}
                  height={44}
                />
              </span>
              <div className="apr-head__text">
                <h3 className="apr-title">Where reviews came from</h3>
                <p className="apr-sub">
                  {isEmpty ? "No source activity yet" : "Active source mix"}
                </p>
              </div>
            </div>

            <div className="apr-sources">
              {sources.map((s) => (
                <div key={s.key} className="apr-source">
                  <div className="apr-source__top">
                    <span className="apr-srcicon">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        className="apr-srcicon__art"
                        src={`${ASSETS}/roi-src-${s.key === "outreach" ? "reqreview" : s.key === "organic" ? "organic" : s.key === "qr" ? "qr" : "voice"}.png`}
                        alt=""
                        width={32}
                        height={32}
                      />
                    </span>
                    <span className="apr-source__label">{s.label}</span>
                    <span className="apr-source__value">{s.value.toLocaleString()}</span>
                  </div>
                  <div className="apr-bar" aria-hidden="true">
                    <span
                      className="apr-bar__fill"
                      style={{
                        width: `${totalReviews > 0 ? Math.round((s.value / totalReviews) * 100) : 0}%`,
                        background: DOT[s.tone],
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="apr-sources__foot">
              <span className="apr-pill apr-pill--gray">
                {totalReviews.toLocaleString()} total reviews
              </span>
              {topSource.value > 0 ? (
                <span className="apr-pill apr-pill--mint">
                  {topSource.value.toLocaleString()} from {topSource.label}
                </span>
              ) : (
                <span className="apr-pill apr-pill--gray">No source activity yet</span>
              )}
            </div>
          </section>

          <section className="apr-card" aria-label="Estimated revenue by source">
            <div className="apr-head">
              <span className="apr-badge">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="apr-badge__art"
                  src={`${ASSETS}/roi-bysrc-header.png`}
                  alt=""
                  width={44}
                  height={44}
                />
              </span>
              <div className="apr-head__text">
                <h3 className="apr-title">Estimated revenue by source</h3>
                <p className="apr-sub">Revenue tied to each source</p>
              </div>
            </div>

            <div className="apr-bysrc">
              {bySource.map((c) => (
                <div key={c.key} className="apr-bysrc__cell">
                  <div className="apr-bysrc__top">
                    <span className="apr-srcicon">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img className="apr-srcicon__art" src={c.art} alt="" width={32} height={32} />
                    </span>
                    <span className="apr-bysrc__label">{c.label}</span>
                  </div>
                  <div className="apr-bysrc__value">{fmtMoneyCompact(cur, c.value)}</div>
                  <div className="apr-bysrc__bar" aria-hidden="true">
                    <span
                      className="apr-bar__fill"
                      style={{
                        width: `${Math.round((c.value / maxChannel) * 100)}%`,
                        // "indigo" was the retired Voice→Review row's tone; the
                        // remaining tones map straight to DOT.
                        background: DOT[c.tone],
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="apr-foot apr-foot--blue">
              {isEmpty
                ? "Connect sources to estimate revenue by acquisition"
                : `${cur} model active revenue by acquisition source`}
            </div>
          </section>
        </div>

        <RoiSettingsEditor
          settings={data.settings}
          establishments={data.establishments}
          currency={cur}
          estimatedRevenue={data.estimatedRevenue}
        />
      </div>

      {/* Kit's ROI section ends at the assumptions card ("Model status" row) —
          no extra tiles below. The automation ledger data stays in the props
          contract (page.tsx still computes it) for the weekly digest. */}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Revenue assumptions (kit card; persists via saveRoiSettings)        */
/* ------------------------------------------------------------------ */

function RoiSettingsEditor({
  settings,
  establishments,
  currency,
  estimatedRevenue,
}: {
  settings: RoiPanelData["settings"];
  establishments: { id: string; name: string }[];
  /** Display currency for the summary rows (org RoiSettings currency). */
  currency: string;
  estimatedRevenue: number;
}): JSX.Element {
  // Kit empty state: all four fields blank until the model is configured.
  const configured = settings.averageJobValue != null;
  const [estId, setEstId] = useState(settings.establishmentId ?? establishments[0]?.id ?? "");
  const [avg, setAvg] = useState(configured ? String(settings.averageJobValue) : "");
  const [rate, setRate] = useState(configured ? String(settings.bookingToJobRate ?? 0.6) : "");
  const [cur, setCur] = useState(configured ? settings.currency || "USD" : "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const statusPill = pending
    ? { label: "Saving…", cls: "apr-pill--gray" }
    : saved || configured
      ? { label: "Saved", cls: "apr-pill--mint" }
      : { label: "Empty", cls: "apr-pill--gray" };

  // Saved-model summary (live props, not in-progress keystrokes).
  const valuePerBooking = configured
    ? (settings.averageJobValue ?? 0) * (settings.bookingToJobRate ?? 0.6)
    : 0;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("establishmentId", estId);
    if (avg.trim()) fd.set("averageJobValue", avg.trim());
    if (rate.trim()) fd.set("bookingToJobRate", rate.trim());
    if (cur.trim()) fd.set("currency", cur.trim());
    startTransition(async () => {
      try {
        await saveRoiSettings(fd);
        setSaved(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save settings.");
      }
    });
  }

  return (
    <section className="apr-card apr-assume" aria-label="Revenue assumptions">
      <div className="apr-head">
        <span className="apr-badge">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="apr-badge__art"
            src={`${ASSETS}/roi-assume.png`}
            alt=""
            width={44}
            height={44}
          />
        </span>
        <div className="apr-head__text">
          <h3 className="apr-title">Revenue assumptions</h3>
        </div>
        <span className={`apr-pill ${statusPill.cls}`} aria-live="polite">
          {statusPill.label}
        </span>
      </div>

      <form onSubmit={onSubmit}>
        <div className="apr-form">
          <div className="apr-field">
            <label className="apr-field__label" htmlFor="apr-input-location">
              <span className="apr-glyph" aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="apr-glyph__art"
                  src={`${ASSETS}/roi-loc.png`}
                  alt=""
                  width={26}
                  height={26}
                />
              </span>
              Location
            </label>
            {establishments.length > 0 ? (
              <select
                id="apr-input-location"
                className="apr-input"
                value={estId}
                onChange={(e) => setEstId(e.target.value)}
              >
                {establishments.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="apr-input-location"
                className="apr-input"
                type="text"
                value=""
                disabled
                aria-label="No locations yet"
                readOnly
              />
            )}
          </div>

          <div className="apr-field">
            <label className="apr-field__label" htmlFor="apr-input-avg">
              <span className="apr-glyph" aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="apr-glyph__art"
                  src={`${ASSETS}/roi-avgjob.png`}
                  alt=""
                  width={26}
                  height={26}
                />
              </span>
              Average job value
            </label>
            <input
              id="apr-input-avg"
              className="apr-input"
              type="number"
              min={0}
              step="1"
              value={avg}
              onChange={(e) => setAvg(e.target.value)}
            />
          </div>

          <div className="apr-field">
            <label className="apr-field__label" htmlFor="apr-input-rate">
              <span className="apr-glyph" aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="apr-glyph__art"
                  src={`${ASSETS}/roi-rate.png`}
                  alt=""
                  width={26}
                  height={26}
                />
              </span>
              Booking rate (0–1)
            </label>
            <input
              id="apr-input-rate"
              className="apr-input"
              type="number"
              min={0}
              max={1}
              step="0.05"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </div>

          <div className="apr-field">
            <label className="apr-field__label" htmlFor="apr-input-currency">
              <span className="apr-glyph apr-glyph--yellow" aria-hidden="true">
                $
              </span>
              Currency
            </label>
            <select
              id="apr-input-currency"
              className="apr-input"
              value={cur}
              onChange={(e) => setCur(e.target.value)}
            >
              <option value="">Select a currency…</option>
              {/* The saved/typed value might not be in the curated list (a custom
                  code from before this was a dropdown) — keep it selectable so
                  switching to a select never silently changes the org's setting. */}
              {cur && !CURRENCY_OPTIONS.some((c) => c.code === cur) && (
                <option value={cur}>{cur}</option>
              )}
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="apr-assume__actions">
          <button type="submit" className="apr-savebtn" disabled={pending || !estId}>
            {pending ? "Saving…" : "Save assumptions"}
          </button>
          {error && (
            <span className="apr-assume__error" role="alert">
              <Icon name="alert" size={13} />
              {error}
            </span>
          )}
        </div>
      </form>

      <div className="apr-sum">
        <div className="apr-sumrow">
          <span className="apr-sumrow__label">Estimated value per booking</span>
          <span className="apr-sumrow__value">{fmtMoneyCompact(currency, valuePerBooking)}</span>
        </div>
        <div className="apr-sumrow">
          <span className="apr-sumrow__label">Projected booked revenue</span>
          <span className="apr-sumrow__value">{fmtMoneyCompact(currency, estimatedRevenue)}</span>
        </div>
        <div className={`apr-sumrow${configured ? " apr-sumrow--ok" : ""}`}>
          <span className="apr-sumrow__label">Model status</span>
          <span className="apr-sumrow__value">{configured ? "Active" : "Not ready"}</span>
        </div>
      </div>
    </section>
  );
}
