import Image from "next/image";

/**
 * Brand logo. Single source of truth for the repulabs mark.
 *
 * Modes:
 *   - "mark"  — square favicon only (sidebar collapsed, navbar mobile)
 *   - "full"  — favicon + wordmark text (default for sidebar, navbar, footer)
 *
 * Sizing convention: `size` is the visual height of the mark in px. The
 * wordmark text uses `size * 0.66` for a visually balanced lockup — calibrated
 * so the cap-height of "r" matches the height of the square mark.
 *
 * Asset: /public/favicon.png (1254×1254, square — crops cleanly at any size).
 * Previously this used /repulabs-logo.png (666×375, wide) which letterboxed
 * inside any square container and looked off at small sizes.
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
  const wordmarkSize = Math.round(size * 0.66);
  const gap = Math.round(size * 0.28);

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
        src="/favicon.png"
        alt="Repulabs"
        width={size}
        height={size}
        priority
        style={{
          borderRadius: Math.round(size * 0.22),
          objectFit: "cover",
          filter: monochrome ? "grayscale(1) brightness(1.4)" : undefined,
          flexShrink: 0,
        }}
      />
      {mode === "full" && (
        <span
          style={{
            fontSize: wordmarkSize,
            fontWeight: 600,
            letterSpacing: "-0.025em",
            color: "var(--ink)",
            lineHeight: 1,
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
