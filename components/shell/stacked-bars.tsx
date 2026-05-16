/**
 * StackedBars — categorical bar chart with N stacked segments per bar.
 * Used on the dashboard reviews chart.
 */

export function StackedBars({
  data,
  labels,
  colors,
  width = 620,
  height = 220,
}: {
  data: number[][];
  labels?: string[];
  colors: string[];
  width?: number;
  height?: number;
}) {
  if (data.length === 0) return null;
  const totals = data.map((d) => d.reduce((a, b) => a + b, 0));
  const max = Math.max(...totals) || 1;
  const bw = (width - data.length * 6) / data.length;

  return (
    <svg width={width} height={height} role="img" aria-label="Stacked bar chart" focusable="false">
      {/* y grid */}
      {[0, 0.25, 0.5, 0.75, 1].map((p) => {
        const y = height - 22 - (height - 32) * p;
        return (
          <g key={`grid-${p}`}>
            <line x1="0" x2={width} y1={y} y2={y} stroke="var(--line)" strokeDasharray="2 3" />
            <text
              x="0"
              y={y - 3}
              fontSize="9.5"
              fill="var(--rl-muted-2)"
              fontFamily="var(--f-mono)"
            >
              {Math.round(max * p)}
            </text>
          </g>
        );
      })}
      {data.map((stack, i) => {
        const x = 28 + i * (bw + 6);
        let cumulative = 0;
        const label = labels?.[i];
        return (
          <g key={`bar-${label ?? i}`}>
            {stack.map((v, si) => {
              const h = (v / max) * (height - 32);
              const y = height - 22 - h - cumulative;
              cumulative += h;
              return (
                <rect
                  // biome-ignore lint/suspicious/noArrayIndexKey: fixed stack segments per bar
                  key={`seg-${i}-${si}`}
                  x={x}
                  y={y}
                  width={bw}
                  height={h}
                  rx="1.5"
                  fill={colors[si] ?? "var(--pri)"}
                />
              );
            })}
            {label && (
              <text
                x={x + bw / 2}
                y={height - 6}
                fontSize="9.5"
                textAnchor="middle"
                fill="var(--rl-muted)"
                fontFamily="var(--f-mono)"
              >
                {label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
