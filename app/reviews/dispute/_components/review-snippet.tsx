/**
 * Native-style review snippet (Module 08).
 *
 * Renders the underlying review using the SAME native-style markup the review
 * detail page / feed use (stars + reviewer + source + date + body). GUARDRAIL:
 * do NOT restyle the native review surface — the dispute UI only wraps badges
 * and columns AROUND this; this component renders the review verbatim.
 *
 * Server component (no interactivity) so it can be embedded directly in pages.
 */
export function ReviewSnippet({
  rating,
  reviewerName,
  source,
  establishmentName,
  postedAt,
  body,
  clamp,
}: {
  rating: number;
  reviewerName: string | null;
  source: string;
  establishmentName?: string | null;
  postedAt: Date | string;
  body: string | null;
  /** When true, clamp the body to 2 lines (table rows). */
  clamp?: boolean;
}) {
  const safeRating = Math.max(0, Math.min(5, rating));
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="text-amber-400 text-sm" aria-label={`${safeRating} of 5 stars`}>
          {"★".repeat(safeRating)}
          {"☆".repeat(5 - safeRating)}
        </span>
        <span>{reviewerName ?? "Anonymous"}</span>
        <span>·</span>
        <span className="capitalize">{source}</span>
        {establishmentName && (
          <>
            <span>·</span>
            <span>{establishmentName}</span>
          </>
        )}
        <span>·</span>
        <span>{new Date(postedAt).toLocaleDateString()}</span>
      </div>
      {body && (
        <p className={clamp ? "mt-1 text-sm line-clamp-2" : "mt-1 text-sm whitespace-pre-wrap"}>{body}</p>
      )}
    </div>
  );
}
