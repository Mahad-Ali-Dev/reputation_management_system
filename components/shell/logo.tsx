import Image from "next/image";

/**
 * Brand logo. Single source of truth for the repulabs mark.
 *
 * Modes:
 *   - "mark"  — square logo only (sidebar collapsed, favicon-equivalent)
 *   - "full"  — logo + wordmark (sidebar, topbar, login, marketing)
 *
 * Sizing convention: `size` is the visual height of the mark in px. The
 * wordmark text uses `size * 0.62` for visually balanced lockup — calibrated
 * so the cap-height of "r" matches the height of the square mark.
 *
 * The image asset lives at /public/repulabs-logo.png.
 */
export function Logo({
  mode = "full",
  size = 36,
  className,
  monochrome = false,
}: {
  mode?: "mark" | "full";
  size?: number;
  className?: string;
  monochrome?: boolean;
}) {
  // Wordmark sized so cap-height ≈ mark height; gap tightened so the mark
  // and wordmark read as one logotype rather than two separate elements.
  const wordmarkSize = Math.round(size * 0.62);
  const gap = Math.round(size * 0.22);

  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap,
        lineHeight: 1,
      }}
    >
      <Image
        src="/repulabs-logo.png"
        alt="Repulabs"
        width={size}
        height={size}
        priority
        style={{
          borderRadius: Math.round(size * 0.22),
          objectFit: "contain",
          filter: monochrome ? "grayscale(1) brightness(1.4)" : undefined,
          flexShrink: 0,
        }}
      />
      {mode === "full" && (
        <span
          style={{
            fontSize: wordmarkSize,
            fontWeight: 600,
            letterSpacing: "-0.03em",
            color: "var(--ink)",
            lineHeight: 1,
            // Nudge the wordmark down a hair so it optically centers with
            // the mark (text baselines tend to sit a touch high vs squares)
            position: "relative",
            top: 1,
          }}
        >
          repu<span style={{ color: "var(--pri)" }}>labs</span>
        </span>
      )}
    </span>
  );
}
