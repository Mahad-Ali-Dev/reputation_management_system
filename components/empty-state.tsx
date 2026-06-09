import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Brand illustration kit (`public/assets/repulabs/illustrations/<name>.svg`).
 *
 * Keep this list in sync with the generated kit so callers get autocomplete and
 * a typo is a compile error rather than a silent broken <img>. These are the
 * tasteful, on-brand line illustrations that sit above an empty-state title.
 */
export type IllustrationName =
  | "reviews-empty"
  | "contacts-empty"
  | "surveys-empty"
  | "messages-empty"
  | "social-empty"
  | "listings-empty"
  | "qr-stands-empty"
  | "phone-empty"
  | "dashboard-welcome"
  | "integrations-empty"
  | "insights-empty"
  | "requests-empty"
  | "disputes-empty"
  | "billing-empty"
  | "responses-empty"
  | "onboarding-steps"
  | "ai-assistant"
  | "upgrade"
  | "success"
  | "error"
  | "not-found";

/** Resolve an illustration name (or already-built path) to its public URL. */
export function illustrationSrc(name: IllustrationName | (string & {})): string {
  return name.startsWith("/") ? name : `/assets/repulabs/illustrations/${name}.svg`;
}

/**
 * `<EmptyIllustration>` — the centered brand illustration used above an
 * empty-state title. Server-safe (a plain static `<img>`, no client state), so
 * it drops into any inline empty state that currently renders a bare `<Icon>`.
 *
 * Sizing matches the kit's ~3:2 artboards: width is fluid up to `size` (default
 * 320px — large + prominent, responsive down via `width:100%`) and the height
 * auto-scales so nothing is squashed.
 * `alt=""` because the adjacent heading already names the state (decorative).
 */
export function EmptyIllustration({
  name,
  size = 320,
  className,
  style,
}: {
  name: IllustrationName | (string & {});
  /** Max rendered width in px (height auto-scales). */
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    // biome-ignore lint/performance/noImgElement: static brand SVG illustration (no layout shift, no optimization needed)
    <img
      src={illustrationSrc(name)}
      alt=""
      aria-hidden="true"
      width={size}
      height={Math.round((size * 2) / 3)}
      className={className}
      style={{
        display: "block",
        width: "100%",
        maxWidth: size,
        height: "auto",
        margin: "0 auto",
        ...style,
      }}
    />
  );
}

/**
 * Reusable empty state — every page that lists data should use this when
 * the list is empty, instead of plain "No X yet" text.
 *
 * Composition:
 *   - illustration (optional brand SVG, rendered ~148px centered above title)
 *   - icon (emoji or React node) — fallback when no illustration is given
 *   - title (what's missing)
 *   - description (why + what to do)
 *   - primary action (CTA to fix it)
 *   - secondary action (link to docs / alternative path)
 */
export function EmptyState({
  illustration,
  icon,
  title,
  description,
  primaryAction,
  secondaryAction,
}: {
  /**
   * Brand illustration name (or `/assets/...svg` path). When set it replaces the
   * icon bubble; when absent the `icon` is shown — so existing callers keep
   * working unchanged.
   */
  illustration?: IllustrationName | (string & {});
  icon: React.ReactNode;
  title: string;
  description: string;
  primaryAction?: { label: string; href: string };
  secondaryAction?: { label: string; href: string };
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200/80 bg-white py-20 px-8 text-center">
      {illustration ? (
        <EmptyIllustration name={illustration} style={{ marginBottom: 12 }} />
      ) : (
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-indigo-50 to-violet-50 text-4xl">
          {icon}
        </div>
      )}
      <h3 className="mt-4 text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-slate-600">{description}</p>
      {(primaryAction || secondaryAction) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {primaryAction && (
            <Button asChild>
              <Link href={primaryAction.href}>{primaryAction.label}</Link>
            </Button>
          )}
          {secondaryAction && (
            <Button asChild variant="ghost">
              <Link href={secondaryAction.href}>{secondaryAction.label}</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
