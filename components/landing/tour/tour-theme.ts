/**
 * Shared brand tokens for the product-tour client islands. Kept as a plain
 * module (no JSX) so both server and client components can import the palette
 * without pulling in React. Mirrors the repulabs brand: warm canvas, royal
 * blue, teal, ink.
 */
export const TOUR = {
  canvas: "#fbfaf6",
  blue: "#2457ff",
  blueDeep: "#1b3fd1",
  teal: "#12b998",
  ink: "#0f172a",
  ink2: "#475569",
  white: "#ffffff",
  line: "rgba(15, 23, 42, 0.08)",
} as const;

export const ILLO = "/assets/repulabs/illustrations";
