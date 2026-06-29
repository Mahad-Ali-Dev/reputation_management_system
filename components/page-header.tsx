import Link from "next/link";

/**
 * Page header — repulabs v2 design (.ph block).
 *
 * Renders:
 *   - Optional kicker pill (mono uppercase with pulsing teal dot — via .ph__kicker)
 *   - Breadcrumb trail (small, sits above title)
 *   - Page title (32px, -0.03em tracking), with an optional inline badge to its
 *     right (e.g. a live "● Live" status pill) via `titleBadge`
 *   - Description (14px muted)
 *   - Right-side actions slot
 */
export function PageHeader({
  title,
  description,
  breadcrumb,
  kicker,
  titleBadge,
  actions,
}: {
  title: string;
  description?: string;
  breadcrumb?: Array<{ label: string; href?: string }>;
  kicker?: string;
  /** Optional small badge rendered inline to the right of the title. */
  titleBadge?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="ph">
      <div style={{ minWidth: 0 }}>
        {breadcrumb && breadcrumb.length > 0 && (
          <nav
            aria-label="Breadcrumb"
            className="row"
            style={{
              fontFamily: "var(--f-mono)",
              fontSize: 11,
              letterSpacing: "0.04em",
              color: "var(--rl-muted)",
              marginBottom: 10,
              gap: 6,
              textTransform: "uppercase",
            }}
          >
            {breadcrumb.map((b, i) => (
              <span key={`${b.label}-${i}`} className="row" style={{ gap: 6 }}>
                {b.href ? (
                  <Link
                    href={b.href}
                    style={{ color: "inherit", textDecoration: "none" }}
                    className="hover:!text-[var(--ink)]"
                  >
                    {b.label}
                  </Link>
                ) : (
                  <span style={{ color: "var(--ink-3)" }}>{b.label}</span>
                )}
                {i < breadcrumb.length - 1 && <span className="crumb-sep">/</span>}
              </span>
            ))}
          </nav>
        )}
        {kicker && <div className="ph__kicker">{kicker}</div>}
        {titleBadge ? (
          <div className="row" style={{ gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <h1 className="ph__title">{title}</h1>
            {titleBadge}
          </div>
        ) : (
          <h1 className="ph__title">{title}</h1>
        )}
        {description && <p className="ph__sub">{description}</p>}
      </div>
      {actions && (
        <div className="row" style={{ flexShrink: 0, flexWrap: "wrap" }}>
          {actions}
        </div>
      )}
    </div>
  );
}
