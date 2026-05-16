import Image from "next/image";

/**
 * Brand logo. Single source of truth for the repulabs mark.
 *
 * Modes:
 *   - "mark"  — square logo only (sidebar collapsed, favicon-equivalent)
 *   - "full"  — logo + wordmark (sidebar, topbar, login, marketing)
 *
 * The image asset lives at /public/repulabs-logo.png.
 */
export function Logo({
  mode = "full",
  size = 32,
  className,
  monochrome = false,
}: {
  mode?: "mark" | "full";
  size?: number;
  className?: string;
  monochrome?: boolean;
}) {
  return (
    <span className={className} style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <Image
        src="/repulabs-logo.png"
        alt="Repulabs"
        width={size}
        height={size}
        priority
        style={{
          borderRadius: Math.round(size * 0.25),
          objectFit: "contain",
          filter: monochrome ? "grayscale(1) brightness(1.4)" : undefined,
        }}
      />
      {mode === "full" && (
        <span
          style={{
            fontSize: Math.round(size * 0.55),
            fontWeight: 600,
            letterSpacing: "-0.025em",
            color: "var(--ink)",
          }}
        >
          repu<span style={{ color: "var(--pri)" }}>labs</span>
        </span>
      )}
    </span>
  );
}
