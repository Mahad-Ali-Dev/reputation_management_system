"use client";

import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Renders children straight into <body>.
 *
 * Every modal overlay goes through this. A `position: fixed` overlay is only
 * fixed to the viewport if no ancestor has `transform`, `filter` or
 * `backdrop-filter` — and the glass cards that host the "Add device" /
 * "Generate QR" triggers have all three, which trapped the sheets inside the
 * card (cut off, layered under the page). Portalling to <body> escapes that.
 */
export function BodyPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}
