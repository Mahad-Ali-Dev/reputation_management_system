/**
 * Real product screenshots (the live app, dark mode, with data) and the dark
 * browser-window chrome they're shown in. Shared by the landing hero, the
 * feature rows and the product tour so they all frame screens the same way.
 */

import type { ReactNode } from "react";

export const SCREENS = [
  {
    id: "dashboard",
    label: "Dashboard",
    path: "dashboard",
    src: "/assets/repulabs/landing/screens/dashboard.png",
    w: 1365,
    h: 594,
    line: "Your whole reputation at a glance, with Repulabs AI ready to answer anything.",
  },
  {
    id: "autopilot",
    label: "AI Autopilot",
    path: "autopilot",
    src: "/assets/repulabs/landing/screens/autopilot.png",
    w: 1354,
    h: 591,
    line: "One switch runs the whole loop — 5★ replies published, everything else drafted to approve.",
  },
  {
    id: "inbox",
    label: "Review inbox",
    path: "reviews",
    src: "/assets/repulabs/landing/screens/review-inbox.png",
    w: 1365,
    h: 595,
    line: "Every review across every platform in one queue, with AI drafting the reply you approve.",
  },
  {
    id: "devices",
    label: "Device Manager",
    path: "devices",
    src: "/assets/repulabs/landing/screens/device-manager.png",
    w: 1365,
    h: 597,
    line: "QR plaques and cards that send customers straight to a review, with scan and impact tracking.",
  },
  {
    id: "analytics",
    label: "Analytics",
    path: "analytics",
    src: "/assets/repulabs/landing/screens/analytics.png",
    w: 1365,
    h: 595,
    line: "Trends, rating breakdowns and sources — see exactly how your reputation is moving.",
  },
] as const;

export type ScreenId = (typeof SCREENS)[number]["id"];
export type Screen = (typeof SCREENS)[number];

export const SCREEN_BY_ID = Object.fromEntries(SCREENS.map((s) => [s.id, s])) as Record<ScreenId, Screen>;

/** Screenshot aspect ratio, used to size empty placeholder frames to match. */
export const SCREEN_ASPECT = "1365 / 594";

/** Dark browser-window chrome (traffic lights + app URL) around any content. */
export function WindowFrame({ path, children }: { path: string; children: ReactNode }) {
  return (
    <div
      className="overflow-hidden rounded-[16px] border"
      style={{ borderColor: "rgba(255,255,255,.12)", background: "#0b0f1a", boxShadow: "0 30px 80px -34px rgba(0,0,0,.65)" }}
    >
      <div
        className="flex items-center gap-1.5 px-3.5 py-2.5"
        style={{ background: "#11151f", borderBottom: "1px solid rgba(255,255,255,.07)" }}
      >
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#ff5f57" }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#febc2e" }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#28c840" }} />
        <span className="ml-3 truncate text-[11px] font-medium" style={{ color: "rgba(255,255,255,.4)" }}>
          app.repulabs.com/{path}
        </span>
      </div>
      {children}
    </div>
  );
}

/** A real product screenshot inside the window chrome. */
export function ProductWindow({ id, priority }: { id: ScreenId; priority?: boolean }) {
  const screen = SCREEN_BY_ID[id];
  return (
    <WindowFrame path={screen.path}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={screen.src}
        alt={`Repulabs ${screen.label} — dark mode`}
        width={screen.w}
        height={screen.h}
        className="block h-auto w-full"
        loading={priority ? "eager" : "lazy"}
      />
    </WindowFrame>
  );
}
