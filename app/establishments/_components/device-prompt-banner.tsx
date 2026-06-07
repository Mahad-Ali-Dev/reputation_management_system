import { Icon } from "@/components/shell/icon";
import Link from "next/link";

/**
 * "Next Step: Connect Your Device" banner — full-width blue→indigo gradient
 * card shown under an establishment that has **zero** linked devices. When a
 * device exists, the page renders <LinkedDevicesRow> instead (visibility is
 * decided by the caller via `shouldShowDevicePrompt`).
 *
 * Pure presentational server component. Styling is inline (the project's v3
 * pages style locally; design-system.css is owned by Wave 0 and frozen), but
 * the gradient mirrors the dashboard `.viz-banner`/sidebar upsell recipe:
 * `linear-gradient(135deg, var(--pri) 0%, #4f46e5 100%)`.
 */
export function DevicePromptBanner({ establishmentId }: { establishmentId: string }) {
  return (
    <div
      className="row"
      style={{
        gap: 16,
        padding: "16px 20px",
        borderRadius: "var(--r-md)",
        background: "linear-gradient(135deg, var(--pri) 0%, #4f46e5 100%)",
        color: "#fff",
        boxShadow: "0 10px 28px -12px rgba(37, 99, 235, 0.5)",
        flexWrap: "wrap",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: "rgba(255,255,255,.16)",
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
      >
        <Icon name="qr" size={22} />
      </span>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em" }}>
          Next step: connect your device
        </div>
        <p style={{ margin: "3px 0 0", fontSize: 12.5, lineHeight: 1.5, color: "rgba(255,255,255,.82)" }}>
          Link a QR stand, plaque, or NFC card so in-store customers can leave a review in one tap.
        </p>
      </div>
      <Link
        href={`/hardware?establishment=${establishmentId}`}
        className="btn btn--sm"
        style={{
          background: "#fff",
          color: "var(--pri-700)",
          border: "none",
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        Set Up Device
        <Icon name="arrowR" size={13} />
      </Link>
    </div>
  );
}
