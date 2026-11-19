import QRCode from "qrcode";

/**
 * Server-rendered QR code. Generates a deterministic SVG string from `value`,
 * then dangerously sets it as innerHTML. The SVG is static — no scripts,
 * no external refs.
 *
 * The centered logo overlay (the repulabs logo mark on a white plate) is drawn over the QR. We use
 * high error-correction so the QR remains scannable with the overlay.
 */
export async function QrCode({
  value,
  size = 280,
  withLogo = true,
  className,
}: {
  value: string;
  size?: number;
  withLogo?: boolean;
  className?: string;
}) {
  const svg = await QRCode.toString(value, {
    type: "svg",
    errorCorrectionLevel: "H",
    margin: 1,
    color: {
      dark: "#0B0D0E",
      light: "#FFFFFF",
    },
    width: size,
  });
  // QRCode adds width/height attrs; strip them so the SVG fills its container
  const cleaned = svg
    .replace(/width="\d+"/, `width="${size}"`)
    .replace(/height="\d+"/, `height="${size}"`);

  return (
    <div className={className} style={{ position: "relative", width: size, height: size }}>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: server-generated SVG, no user input */}
      <div dangerouslySetInnerHTML={{ __html: cleaned }} />
      {withLogo && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            pointerEvents: "none",
          }}
        >
          {/* The repulabs logo mark on a white rounded plate (replaced the
              old coloured "r" text badge). */}
          <span
            style={{
              width: Math.round(size * 0.22),
              height: Math.round(size * 0.22),
              display: "grid",
              placeItems: "center",
              background: "#fff",
              borderRadius: Math.round(size * 0.06),
              boxShadow: "0 0 0 3px #fff, 0 2px 6px rgba(21, 19, 43, 0.12)",
            }}
          >
            <img
              src="/favicon.png"
              alt=""
              width={Math.round(size * 0.17)}
              height={Math.round(size * 0.17)}
              style={{ borderRadius: Math.round(size * 0.04), display: "block" }}
            />
          </span>
        </div>
      )}
    </div>
  );
}
