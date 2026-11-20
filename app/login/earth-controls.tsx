"use client";

/**
 * "Scene controls" for the Earth login background, the same knobs as the
 * Earth Blaze component's own demo: illumination, nebula, Earth detail, stars,
 * aurora (on / preview / tint) and nebula tint. A collapsed glass disclosure in
 * the top-right corner so it never competes with the form.
 *
 * Settings are remembered per browser (localStorage, best-effort only).
 */

export type EarthSettings = {
  illumination: number;
  galaxyBrightness: number;
  surfaceBrightness: number;
  starCount: number;
  auroraEnabled: boolean;
  auroraPreview: boolean;
  auroraTint: boolean;
  auroraColor: string;
  nebulaTint: boolean;
  backgroundColor: string;
};

export const EARTH_DEFAULTS: EarthSettings = {
  illumination: 1,
  galaxyBrightness: 1.4,
  surfaceBrightness: 1,
  starCount: 3600,
  auroraEnabled: true,
  auroraPreview: false,
  auroraTint: false,
  auroraColor: "#118a66",
  nebulaTint: false,
  backgroundColor: "#634369",
};

const STORAGE_KEY = "repulabs.earth-scene.v1";

export function loadEarthSettings(): EarthSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EARTH_DEFAULTS;
    const saved = JSON.parse(raw) as Partial<EarthSettings>;
    const next = { ...EARTH_DEFAULTS };
    for (const key of Object.keys(EARTH_DEFAULTS) as (keyof EarthSettings)[]) {
      if (typeof saved[key] === typeof EARTH_DEFAULTS[key])
        Object.assign(next, { [key]: saved[key] });
    }
    return next;
  } catch {
    return EARTH_DEFAULTS;
  }
}

export function saveEarthSettings(s: EarthSettings) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // private window / blocked storage: settings just won't persist
  }
}

const RANGES = [
  { key: "illumination", label: "Illumination", max: 3, step: 0.05 },
  { key: "galaxyBrightness", label: "Nebula brightness", max: 3, step: 0.05 },
  { key: "surfaceBrightness", label: "Earth detail", max: 3, step: 0.05 },
  { key: "starCount", label: "Stars", max: 5400, step: 100 },
] as const;

export function EarthControls({
  value,
  onChange,
}: {
  value: EarthSettings;
  onChange: (next: EarthSettings) => void;
}) {
  const set = <K extends keyof EarthSettings>(key: K, v: EarthSettings[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <details className="eb-ctl">
      <summary>
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"
          />
          <circle cx="16" cy="6" r="2" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="10" cy="12" r="2" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="18" cy="18" r="2" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
        Scene controls
      </summary>
      <div className="eb-ctl__body">
        {RANGES.map(({ key, label, max, step }) => (
          <label key={key} className="eb-ctl__range">
            <span>
              {label}
              <output>{key === "starCount" ? value[key] : `${value[key].toFixed(2)}×`}</output>
            </span>
            <input
              type="range"
              min={0}
              max={max}
              step={step}
              value={value[key]}
              onChange={(e) => set(key, Number(e.target.value))}
            />
          </label>
        ))}

        <div className="eb-ctl__sep" />

        <label className="eb-ctl__check">
          <input
            type="checkbox"
            checked={value.auroraEnabled}
            onChange={(e) =>
              onChange({ ...value, auroraEnabled: e.target.checked, auroraPreview: false })
            }
          />
          Aurora on hold &amp; release
        </label>
        <button
          type="button"
          className="eb-ctl__btn"
          aria-pressed={value.auroraPreview}
          disabled={!value.auroraEnabled}
          onClick={() => set("auroraPreview", !value.auroraPreview)}
        >
          {value.auroraPreview ? "Hide aurora preview" : "Preview aurora"}
        </button>

        <div className="eb-ctl__color">
          <label className="eb-ctl__check">
            <input
              type="checkbox"
              checked={value.auroraTint}
              onChange={(e) => set("auroraTint", e.target.checked)}
            />
            Aurora tint
          </label>
          <input
            type="color"
            aria-label="Aurora colour"
            value={value.auroraColor}
            disabled={!value.auroraTint}
            onChange={(e) => set("auroraColor", e.target.value)}
          />
        </div>
        <div className="eb-ctl__color">
          <label className="eb-ctl__check">
            <input
              type="checkbox"
              checked={value.nebulaTint}
              onChange={(e) => set("nebulaTint", e.target.checked)}
            />
            Nebula tint
          </label>
          <input
            type="color"
            aria-label="Nebula colour"
            value={value.backgroundColor}
            disabled={!value.nebulaTint}
            onChange={(e) => set("backgroundColor", e.target.value)}
          />
        </div>

        <p className="eb-ctl__help">
          Move the pointer along the horizon to steer the sunlight. Hover the sunrise to reveal the
          map; press, hold, then release for an aurora.
        </p>
        <button type="button" className="eb-ctl__reset" onClick={() => onChange(EARTH_DEFAULTS)}>
          Reset
        </button>
      </div>
    </details>
  );
}
