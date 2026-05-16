/**
 * Star rating display. Renders `total` stars, filled up to `value`.
 * Switches to muted ("bad") color when value <= 2.
 */

function StarSvg({ filled, size }: { filled: boolean; size: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 2.5 14.9 8.7l6.6.6-5 4.6 1.5 6.6L12 17l-6 3.5 1.5-6.6-5-4.6 6.6-.6L12 2.5Z" />
    </svg>
  );
}

export function Stars({
  value = 5,
  size = 12,
  total = 5,
}: {
  value?: number;
  size?: number;
  total?: number;
}) {
  return (
    <span
      className={`stars${value <= 2 ? " stars--bad" : ""}`}
      role="img"
      aria-label={`${value} out of ${total} stars`}
    >
      {Array.from({ length: total }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed list of N stars
        <StarSvg key={i} filled={i < value} size={size} />
      ))}
    </span>
  );
}
