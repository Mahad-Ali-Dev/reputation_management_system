"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/**
 * Date-range segmented control (Module 13 Overview). Writes `?range=7|30|90`
 * (preserving the active `?tab=`) and lets the server re-render with the new
 * window. Small client island.
 */
const RANGES = [
  { v: 7, label: "7d" },
  { v: 30, label: "30d" },
  { v: 90, label: "90d" },
] as const;

export function RangeSelector({ current }: { current: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const select = useCallback(
    (v: number) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.set("range", String(v));
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return (
    <div className="tabs" role="group" aria-label="Date range" style={{ display: "inline-flex" }}>
      {RANGES.map((r) => (
        <button
          key={r.v}
          type="button"
          className={r.v === current ? "tabs__t is-active" : "tabs__t"}
          onClick={() => select(r.v)}
          aria-pressed={r.v === current}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
