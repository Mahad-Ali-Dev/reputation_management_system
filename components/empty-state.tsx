import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Reusable empty state — every page that lists data should use this when
 * the list is empty, instead of plain "No X yet" text.
 *
 * Composition:
 *   - icon (emoji or React node)
 *   - title (what's missing)
 *   - description (why + what to do)
 *   - primary action (CTA to fix it)
 *   - secondary action (link to docs / alternative path)
 */
export function EmptyState({
  icon,
  title,
  description,
  primaryAction,
  secondaryAction,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  primaryAction?: { label: string; href: string } | { label: string; onClick: () => void };
  secondaryAction?: { label: string; href: string };
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-white py-16 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-indigo-50 to-violet-50 text-4xl">
        {icon}
      </div>
      <h3 className="mt-4 text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-slate-600">{description}</p>
      {(primaryAction || secondaryAction) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {primaryAction && ("href" in primaryAction ? (
            <Button asChild>
              <Link href={primaryAction.href}>{primaryAction.label}</Link>
            </Button>
          ) : (
            <Button onClick={primaryAction.onClick}>{primaryAction.label}</Button>
          ))}
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
