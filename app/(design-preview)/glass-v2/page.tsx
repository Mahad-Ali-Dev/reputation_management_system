import "./tokens.css";

/**
 * Glass v2 — colour + typography foundation, for approval before anything
 * touches the real dashboard (AGENTS.md: preview-first, mock data only).
 *
 * Shown here so it can be judged rather than described:
 *   · the material scale over a real backdrop, since glass can only be judged
 *     against what it refracts
 *   · the single-accent palette
 *   · the spec type ramp at true sizes
 */

export const metadata = { title: "Glass v2 · Foundation" };

const MATERIALS = [
  { cls: "gv2-mat--ultrathin", name: "Ultra thin", use: "Hover layers, tooltips, the scrim over a photo" },
  { cls: "gv2-mat--thin", name: "Thin", use: "Sidebar, top bar — chrome that floats over content" },
  { cls: "gv2-mat--regular", name: "Regular", use: "Cards, panels. The workhorse" },
  { cls: "gv2-mat--thick", name: "Thick", use: "Modals, popovers — anything that must stay readable" },
];

const RAMP = [
  { cls: "gv2-display", role: "Display", spec: "44/48 · 700 · -0.03em", sample: "Your reputation" },
  { cls: "gv2-h1", role: "H1", spec: "30/36 · 600 · -0.02em", sample: "Dashboard" },
  { cls: "gv2-h2", role: "H2", spec: "24/30 · 600 · -0.02em", sample: "Recent reviews" },
  { cls: "gv2-h3", role: "H3", spec: "18/26 · 600 · -0.015em", sample: "Rating trend" },
  { cls: "gv2-body-lg", role: "Body lg", spec: "16/24 · 400", sample: "Here's how your reputation is trending." },
  { cls: "gv2-body", role: "Body", spec: "14/21 · 400", sample: "Front desk was incredibly helpful and kind." },
  { cls: "gv2-strong", role: "Body strong", spec: "14/21 · 500", sample: "Needs reply" },
  { cls: "gv2-label", role: "Label", spec: "13/16 · 500", sample: "Request reviews" },
  { cls: "gv2-overline", role: "Overline", spec: "12/16 · 600 · 0.06em", sample: "Reputation" },
  { cls: "gv2-caption", role: "Caption", spec: "12/16 · 400", sample: "3 hours ago · Google" },
];

const SWATCHES = [
  { name: "--pri", hex: "#2457ff", note: "The only saturated hue" },
  { name: "--pri-50", hex: "#eff6ff", note: "Active nav fill, info box" },
  { name: "--pri-700", hex: "#1b3fd1", note: "Hover / pressed" },
  { name: "--text", hex: "#1a1f2e", note: "Headings, metric values" },
  { name: "--text-muted", hex: "#5b6472", note: "Body copy" },
  { name: "--text-subtle", hex: "#8a929e", note: "Meta, captions" },
  { name: "--bg", hex: "#fbfaf6", note: "Canvas — warm off-white" },
  { name: "--surface", hex: "#ffffff", note: "Opaque fallback" },
];

export default function GlassV2Page() {
  return (
    <div className="gv2">
      <div className="gv2__canvas" style={{ padding: "48px 32px 80px" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", display: "grid", gap: 28 }}>
          <header>
            <p className="gv2-overline" style={{ color: "var(--gv2-pri)", margin: 0 }}>
              Foundation
            </p>
            <h1 className="gv2-display" style={{ margin: "8px 0 6px" }}>
              Glass, the Apple way
            </h1>
            <p className="gv2-body-lg" style={{ color: "var(--gv2-text-muted)", margin: 0, maxWidth: "62ch" }}>
              The material is colourless. It borrows whatever sits behind it and
              boosts that with <code>saturate(180%)</code> — which is why one
              accent reads richer here than three ever did.
            </p>
          </header>

          {/* Materials sit DIRECTLY over content, never inside another glass
              panel. Glass on glass refracts a near-opaque white surface and the
              four thicknesses become indistinguishable — which is exactly what
              the first draft of this page did. */}
          <section>
            <h2 className="gv2-h3" style={{ margin: "0 0 4px" }}>Material scale</h2>
            <p className="gv2-caption" style={{ color: "var(--gv2-text-subtle)", margin: "0 0 14px" }}>
              Same white fill at four alphas, over the kind of content they float above.
              Nothing is tinted.
            </p>
            <div className="gv2-stage">
              {/* Stand-in for what sits behind real UI: a chart, an avatar, a photo. */}
              <div className="gv2-stage__content" aria-hidden="true">
                <span className="gv2-stage__bar" style={{ height: "38%" }} />
                <span className="gv2-stage__bar" style={{ height: "62%" }} />
                <span className="gv2-stage__bar" style={{ height: "48%" }} />
                <span className="gv2-stage__bar" style={{ height: "80%" }} />
                <span className="gv2-stage__bar" style={{ height: "56%" }} />
                <span className="gv2-stage__bar" style={{ height: "92%" }} />
                <span className="gv2-stage__orb" />
              </div>
              <div className="gv2-stage__row">
                {MATERIALS.map((m) => (
                  <div key={m.cls} className={`gv2-mat ${m.cls}`} style={{ padding: 16, minHeight: 112 }}>
                    <p className="gv2-label" style={{ margin: "0 0 4px" }}>{m.name}</p>
                    <p className="gv2-caption" style={{ color: "var(--gv2-text-muted)", margin: 0 }}>{m.use}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* A metric row — the single most repeated pattern in the product. */}
          <section className="gv2-mat gv2-mat--regular" style={{ padding: 24 }}>
            <h2 className="gv2-h3" style={{ margin: "0 0 18px" }}>Metrics</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 14 }}>
              {[
                { label: "Average rating", value: "4.7", delta: "+0.2" },
                { label: "Reviews", value: "1,284", delta: "+8.1%" },
                { label: "Response rate", value: "92%", delta: "+3%" },
                { label: "NPS", value: "68", delta: "-1" },
              ].map((s) => (
                <div key={s.label} className="gv2-mat gv2-mat--thin" style={{ padding: "16px 18px" }}>
                  <p className="gv2-caption" style={{ color: "var(--gv2-text-subtle)", margin: "0 0 6px" }}>
                    {s.label}
                  </p>
                  <p className="gv2-h1 gv2-num" style={{ margin: 0 }}>{s.value}</p>
                  <p
                    className="gv2-caption gv2-num"
                    style={{ margin: "4px 0 0", color: s.delta.startsWith("-") ? "#dc2626" : "#16a34a" }}
                  >
                    {s.delta}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Type ramp at true size — a table of numbers proves nothing. */}
          <section className="gv2-mat gv2-mat--regular" style={{ padding: 24 }}>
            <h2 className="gv2-h3" style={{ margin: "0 0 4px" }}>Type ramp</h2>
            <p className="gv2-caption" style={{ color: "var(--gv2-text-subtle)", margin: "0 0 18px" }}>
              Inter · 400–700 · spec §4. Hierarchy from size, weight and colour only.
            </p>
            <div style={{ display: "grid", gap: 16 }}>
              {RAMP.map((r) => (
                <div
                  key={r.role}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0,1fr) 190px",
                    gap: 16,
                    alignItems: "baseline",
                    borderBottom: "1px solid var(--gv2-border)",
                    paddingBottom: 12,
                  }}
                >
                  <span className={r.cls}>{r.sample}</span>
                  <span className="gv2-caption gv2-num" style={{ color: "var(--gv2-text-subtle)", textAlign: "right" }}>
                    {r.role} · {r.spec}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Palette. */}
          <section className="gv2-mat gv2-mat--regular" style={{ padding: 24 }}>
            <h2 className="gv2-h3" style={{ margin: "0 0 18px" }}>Palette</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12 }}>
              {SWATCHES.map((s) => (
                <div key={s.name} style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <span
                    aria-hidden="true"
                    style={{
                      width: 40, height: 40, borderRadius: 10,
                      background: s.hex, border: "1px solid var(--gv2-border-strong)", flexShrink: 0,
                    }}
                  />
                  <span style={{ minWidth: 0 }}>
                    <span className="gv2-label" style={{ display: "block" }}>{s.name}</span>
                    <span className="gv2-caption gv2-num" style={{ color: "var(--gv2-text-subtle)" }}>
                      {s.hex} · {s.note}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
