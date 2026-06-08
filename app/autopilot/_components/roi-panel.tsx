"use client";

import { Icon, type IconName } from "@/components/shell/icon";
import { saveRoiSettings } from "@/lib/roi/actions";
import { type JSX, useState, useTransition } from "react";
import type { RoiByChannel } from "@/lib/roi/estimate";

/**
 * ROI panel (Module 15) — presentational funnel + a thin settings island.
 *
 * Renders the spec's funnel (scans → reviews → calls → bookings → $) as a stat
 * strip, the attribution split (QR vs review requests vs Voice→Review), the
 * estimated-revenue headline (clearly labeled ESTIMATED, never "booked"), and a
 * small RoiSettings editor that persists via `saveRoiSettings`.
 */

export type RoiPanelData = {
  funnel: {
    scans: number;
    reviews: { total: number; fromQr: number; fromOutreach: number; fromVoice: number; organic: number };
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
};

export function RoiPanel({ data }: { data: RoiPanelData }): JSX.Element {
  const stages: { key: string; label: string; value: number | null; icon: IconName }[] = [
    { key: "scans", label: "QR scans", value: data.funnel.scans, icon: "qr" },
    { key: "reviews", label: "Reviews", value: data.funnel.reviews.total, icon: "star" },
    { key: "gbp", label: "Profile views", value: data.funnel.gbpViews, icon: "eye" },
    { key: "calls", label: "Calls", value: data.funnel.calls, icon: "phone" },
    { key: "bookings", label: "Bookings", value: data.funnel.bookings.total, icon: "cal" },
  ];

  const fmtMoney = (n: number) => `${data.currency} ${n.toLocaleString()}`;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* Headline */}
      <div
        className="ds-card"
        style={{ padding: 20, background: "linear-gradient(135deg, var(--pri-50), var(--surface))" }}
      >
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <div
              className="dim"
              style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}
            >
              Estimated booked revenue · {data.rangeLabel}
            </div>
            <div style={{ fontSize: 34, fontWeight: 700, marginTop: 2 }}>
              {fmtMoney(data.estimatedRevenue)}
            </div>
            <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>
              {data.topDriver !== "—" ? `Top driver: ${data.topDriver} · ` : ""}
              Estimated from your funnel — not booked revenue.
            </div>
          </div>
          <span
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "var(--pri)",
              color: "#fff",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <Icon name="trend" size={22} />
          </span>
        </div>
      </div>

      {/* Funnel strip */}
      <div className="ds-card">
        <div className="ds-card__head">
          <h3 className="ds-card__title">The funnel</h3>
          <span className="dim" style={{ fontSize: 12 }}>
            Reviews → calls → bookings → $
          </span>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))`,
            gap: 0,
            padding: 8,
          }}
        >
          {stages.map((s, i) => (
            <div key={s.key} style={{ position: "relative", padding: "12px 10px", textAlign: "center" }}>
              <span style={{ color: "var(--pri)" }}>
                <Icon name={s.icon} size={16} />
              </span>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>
                {s.value === null ? "—" : s.value.toLocaleString()}
              </div>
              <div className="dim" style={{ fontSize: 11 }}>
                {s.label}
                {s.key === "gbp" && s.value === null && (
                  <span style={{ display: "block", fontSize: 10 }}>connect GBP</span>
                )}
              </div>
              {i < stages.length - 1 && (
                <span
                  style={{
                    position: "absolute",
                    right: -6,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--rl-muted-2)",
                  }}
                >
                  <Icon name="chevR" size={14} />
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Attribution split + revenue by channel */}
      <div
        style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 14 }}
      >
        <div className="ds-card">
          <div className="ds-card__head">
            <h3 className="ds-card__title">Where reviews came from</h3>
          </div>
          <div style={{ padding: 14 }}>
            <AttrRow label="Voice → Review" value={data.funnel.reviews.fromVoice} accent="var(--pri)" icon="phone" />
            <AttrRow label="Review requests" value={data.funnel.reviews.fromOutreach} accent="var(--info)" icon="send" />
            <AttrRow label="QR plaques" value={data.funnel.reviews.fromQr} accent="var(--ok)" icon="qr" />
            <AttrRow label="Organic" value={data.funnel.reviews.organic} accent="var(--rl-muted-2)" icon="star" />
          </div>
        </div>

        <div className="ds-card">
          <div className="ds-card__head">
            <h3 className="ds-card__title">Estimated revenue by source</h3>
          </div>
          <div style={{ padding: 14 }}>
            <AttrRow label="Bookings" value={fmtMoney(data.byChannel.bookings)} accent="var(--pri)" icon="cal" raw />
            <AttrRow label="Voice → Review" value={fmtMoney(data.byChannel.voiceReviews)} accent="var(--pri)" icon="phone" raw />
            <AttrRow label="Review requests" value={fmtMoney(data.byChannel.outreachReviews)} accent="var(--info)" icon="send" raw />
            <AttrRow label="QR plaques" value={fmtMoney(data.byChannel.qrReviews)} accent="var(--ok)" icon="qr" raw />
          </div>
        </div>
      </div>

      {/* Settings editor */}
      <RoiSettingsEditor settings={data.settings} establishments={data.establishments} />
    </div>
  );
}

function AttrRow({
  label,
  value,
  accent,
  icon,
  raw,
}: {
  label: string;
  value: number | string;
  accent: string;
  icon: IconName;
  raw?: boolean;
}): JSX.Element {
  return (
    <div className="row" style={{ gap: 10, padding: "8px 0" }}>
      <span style={{ color: accent, flexShrink: 0 }}>
        <Icon name={icon} size={14} />
      </span>
      <span style={{ flex: 1, fontSize: 13 }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600 }}>
        {raw ? value : typeof value === "number" ? value.toLocaleString() : value}
      </span>
    </div>
  );
}

function RoiSettingsEditor({
  settings,
  establishments,
}: {
  settings: RoiPanelData["settings"];
  establishments: { id: string; name: string }[];
}): JSX.Element {
  const [estId, setEstId] = useState(settings.establishmentId ?? establishments[0]?.id ?? "");
  const [avg, setAvg] = useState(settings.averageJobValue != null ? String(settings.averageJobValue) : "");
  const [rate, setRate] = useState(String(settings.bookingToJobRate ?? 0.6));
  const [currency, setCurrency] = useState(settings.currency || "USD");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("establishmentId", estId);
    if (avg.trim()) fd.set("averageJobValue", avg.trim());
    if (rate.trim()) fd.set("bookingToJobRate", rate.trim());
    fd.set("currency", currency);
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
    <div className="ds-card">
      <div className="ds-card__head">
        <h3 className="ds-card__title">Revenue assumptions</h3>
        <span className="dim" style={{ fontSize: 12 }}>
          {pending ? "Saving…" : saved ? "Saved" : "Tune the estimate"}
        </span>
      </div>
      <form onSubmit={onSubmit} style={{ padding: 16, display: "grid", gap: 12 }}>
        <p className="dim" style={{ fontSize: 12, margin: 0 }}>
          The estimate uses these to turn bookings + attributed reviews into a dollar figure. It is
          always an estimate, never billed revenue.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 12 }}>
          {establishments.length > 1 && (
            <label style={{ fontSize: 12, display: "grid", gap: 4 }}>
              <span className="dim">Location</span>
              <select className="input" value={estId} onChange={(e) => setEstId(e.target.value)}>
                {establishments.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label style={{ fontSize: 12, display: "grid", gap: 4 }}>
            <span className="dim">Average job value</span>
            <input
              className="input"
              type="number"
              min={0}
              step="1"
              placeholder="150"
              value={avg}
              onChange={(e) => setAvg(e.target.value)}
            />
          </label>
          <label style={{ fontSize: 12, display: "grid", gap: 4 }}>
            <span className="dim">Booking → job rate (0–1)</span>
            <input
              className="input"
              type="number"
              min={0}
              max={1}
              step="0.05"
              placeholder="0.6"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </label>
          <label style={{ fontSize: 12, display: "grid", gap: 4 }}>
            <span className="dim">Currency</span>
            <input
              className="input"
              type="text"
              maxLength={8}
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            />
          </label>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button type="submit" className="btn btn--pri" disabled={pending || !estId}>
            {pending ? "Saving…" : "Save assumptions"}
          </button>
          {error && (
            <span className="row" style={{ gap: 6, color: "var(--bad)", fontSize: 12.5 }}>
              <Icon name="alert" size={13} />
              {error}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
