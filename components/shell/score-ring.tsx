/**
 * ScoreRing — circular progress gauge for the Reputation Score + setup progress.
 * Pure SVG (server-renderable). Center number rendered as overlaid text for
 * crisp typography.
 */
export function ScoreRing({
  value,
  max = 100,
  size = 116,
  stroke = 10,
  suffix = "/100",
  hideMax = false,
  color = "var(--pri)",
  weight = 700,
}: {
  value: number;
  max?: number;
  size?: number;
  stroke?: number;
  suffix?: string;
  hideMax?: boolean;
  color?: string;
  /** Centre-number weight (default 700). */
  weight?: number;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / max));
  const dash = c * pct;
  const numFs = Math.round(size * 0.3);

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: "rotate(-90deg)" }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--surface-3)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          lineHeight: 1,
        }}
      >
        <span
          className="score-ring__num"
          style={{
            fontSize: numFs,
            fontWeight: weight,
            letterSpacing: "-0.03em",
            color: "var(--ink)",
          }}
        >
          {value}
          {suffix === "%" && (
            <span style={{ fontSize: numFs * 0.5, fontWeight: Math.min(weight, 600) }}>%</span>
          )}
        </span>
        {!hideMax && suffix !== "%" && (
          <span
            style={{
              fontSize: numFs * 0.34,
              color: "var(--rl-muted)",
              fontWeight: 500,
              marginTop: 2,
            }}
          >
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}
