/**
 * IntegrationDock — a compact dock of integration logos with a hover tile,
 * underline and name tooltip.
 *
 * Adapted from a community "social icons" dock, restyled for repulabs:
 *   - no dock box: logos sit straight on the page background (the original
 *     was a black social-profile dock)
 *   - brand-blue hover tile and underline, dark-ink tooltip (matches the
 *     floating nav pill); text inherits the landing's --f-ui
 *   - full-colour integration logos that rest greyscale/muted and light up on
 *     hover, instead of monochrome social glyphs
 *   - pure CSS group-hover (no client state), and no outbound links — these
 *     are integrations, not profiles. The tooltip sits below the logos so it
 *     never covers the "Connects with" label above the dock.
 */

const INTEGRATIONS = [
  { name: "Google", file: "google" },
  { name: "Meta", file: "meta" },
  { name: "Instagram", file: "instagram" },
  { name: "WhatsApp", file: "whatsapp" },
  { name: "Square", file: "square" },
  { name: "Shopify", file: "shopify" },
  { name: "HubSpot", file: "hubspot" },
  { name: "Slack", file: "slack" },
] as const;

const INK = "#0b1220";
const PRI = "#2563eb";

export function IntegrationDock() {
  return (
    <ul aria-label="Integrations" className="relative flex items-center gap-0.5 p-1.5">
      {INTEGRATIONS.map((item) => (
        <li key={item.file} className="group relative flex size-9 items-center justify-center rounded-xl sm:size-10">
          {/* hover tile */}
          <span
            aria-hidden
            className="absolute inset-1 scale-90 rounded-lg opacity-0 transition-all duration-300 ease-out group-hover:scale-100 group-hover:opacity-100"
            style={{ background: "rgba(37,99,235,.08)" }}
          />

          {/* logo — muted at rest, full colour on hover */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/assets/repulabs/landing/integrations/${item.file}.svg`}
            alt={item.name}
            width={20}
            height={20}
            loading="lazy"
            className="relative z-10 size-5 object-contain opacity-55 grayscale transition-all duration-300 ease-out group-hover:scale-110 group-hover:opacity-100 group-hover:grayscale-0"
          />

          {/* underline */}
          <span
            aria-hidden
            className="absolute bottom-1.5 left-1/2 h-[2px] w-0 -translate-x-1/2 rounded-full opacity-0 transition-all duration-300 ease-out group-hover:w-3 group-hover:opacity-100"
            style={{ background: PRI }}
          />

          {/* tooltip (below the dock) */}
          <span
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 -translate-x-1/2 -translate-y-1 whitespace-nowrap rounded-lg px-2.5 py-1 text-[11px] font-semibold text-white opacity-0 transition-all duration-300 ease-out group-hover:translate-y-0 group-hover:opacity-100"
            style={{ background: INK, boxShadow: "0 8px 18px -8px rgba(11,18,32,.5)" }}
          >
            {item.name}
            <span
              className="absolute -top-1 left-1/2 size-2 -translate-x-1/2 rotate-45"
              style={{ background: INK }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

export default IntegrationDock;
