"use client";

import dynamic from "next/dynamic";
import type { FrogMascotProps } from "./ai-agent-mascot";

/**
 * The Repulabs AI frog, lazy-loaded: three.js only downloads in the browser
 * when a page actually shows him (never in the server render or the shared
 * bundle). A same-size placeholder holds the space while he loads.
 */
const Frog = dynamic(() => import("./ai-agent-mascot").then((m) => m.FrogMascot), {
  ssr: false,
  loading: () => <div aria-hidden="true" style={{ width: "100%", aspectRatio: "1 / 1" }} />,
});

export function LazyFrog(props: FrogMascotProps) {
  const size = props.size ?? 120;
  return (
    <div style={{ width: size, display: "grid", placeItems: "center" }}>
      <Frog {...props} />
    </div>
  );
}
