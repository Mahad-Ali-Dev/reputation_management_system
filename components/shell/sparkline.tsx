/**
 * Sparkline — tiny inline line chart with an optional filled area.
 * Ported from project/repu.jsx.
 */

export function Sparkline({
  points = [3, 5, 4, 7, 6, 8, 7, 9, 8, 10],
  color = "var(--pri)",
  width = 110,
  height = 28,
  area = true,
  responsive = false,
}: {
  points?: number[];
  color?: string;
  width?: number;
  height?: number;
  area?: boolean;
  /** Fill the container width (viewBox scales) instead of a fixed pixel size. */
  responsive?: boolean;
}) {
  if (points.length < 2) return null;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const step = width / (points.length - 1);
  const linePath = points
    .map((p, i) => {
      const x = (i * step).toFixed(1);
      const y = (height - ((p - min) / range) * (height - 4) - 2).toFixed(1);
      return `${i ? "L" : "M"} ${x} ${y}`;
    })
    .join(" ");
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;
  const lastValue = points[points.length - 1] ?? 0;
  const lastY = height - ((lastValue - min) / range) * (height - 4) - 2;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={responsive ? undefined : width}
      height={responsive ? undefined : height}
      preserveAspectRatio={responsive ? "none" : undefined}
      style={responsive ? { display: "block", width: "100%", height } : { display: "block" }}
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      <title>sparkline</title>
      {area && <path d={areaPath} fill={color} opacity="0.10" />}
      <path
        d={linePath}
        stroke={color}
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={width} cy={lastY} r="2.5" fill={color} />
    </svg>
  );
}
