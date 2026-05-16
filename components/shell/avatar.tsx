/**
 * Avatar primitive — initials on a tinted background, or an <img> when src is given.
 * Tones 1–7 match the .av-N classes in design-system.css.
 */

import type { CSSProperties } from "react";

export function Avatar({
  name = "AA",
  size = 28,
  tone = 1,
  src,
  className,
  style,
}: {
  name?: string;
  size?: number;
  tone?: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  src?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const initial = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const fs = Math.round(size * 0.4);
  const cls = `av av-${tone}${className ? ` ${className}` : ""}`;

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={cls}
        style={{ width: size, height: size, objectFit: "cover", ...style }}
      />
    );
  }
  return (
    <span className={cls} style={{ width: size, height: size, fontSize: fs, ...style }}>
      {initial}
    </span>
  );
}
