/**
 * SentimentDonut — 3-segment donut chart (positive / neutral / negative).
 * Values are percentages 0–100.
 */

export function SentimentDonut({
  pos = 91,
  neu = 5,
  neg = 4,
  size = 80,
}: {
  pos?: number;
  neu?: number;
  neg?: number;
  size?: number;
}) {
  const r = size / 2 - 8;
  const c = 2 * Math.PI * r;
  const segs = [
    { v: pos, color: "var(--ok)", label: "positive" },
    { v: neu, color: "var(--rl-muted-2)", label: "neutral" },
    { v: neg, color: "var(--bad)", label: "negative" },
  ];
  let offset = 0;
  return (
    <svg
      width={size}
      height={size}
      style={{ transform: "rotate(-90deg)" }}
      role="img"
      aria-label={`Sentiment: ${pos}% positive, ${neu}% neutral, ${neg}% negative`}
      focusable="false"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--surface-3)"
        strokeWidth="10"
      />
      {segs.map((s) => {
        const len = (s.v / 100) * c;
        const dash = `${len} ${c - len}`;
        const offsetVal = -offset;
        offset += len;
        return (
          <circle
            key={s.label}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth="10"
            strokeDasharray={dash}
            strokeDashoffset={offsetVal}
          />
        );
      })}
    </svg>
  );
}
