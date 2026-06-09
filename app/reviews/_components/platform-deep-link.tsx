"use client";

/**
 * Reply-on-platform deep-link anchor.
 *
 * Lives in a client component because it carries an `onClick` handler
 * (stops the click from bubbling up to the surrounding card `<Link>`). The
 * parent `ReviewCard` is a Server Component, which can't pass event handlers
 * to DOM elements — so this tiny island owns the interactive anchor.
 */
export function PlatformDeepLink({
  href,
  label,
  color,
}: {
  href: string;
  /** Platform name shown in the link text, e.g. "Google". */
  label: string;
  /** Source-meta foreground colour. */
  color: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      style={{ color, textDecoration: "none", fontWeight: 500 }}
    >
      Open in {label} →
    </a>
  );
}
