import "./system-states.css";

/**
 * Root route-level loading state — a quiet branded spinner on the warm canvas.
 * Routes with heavier layouts (e.g. /dashboard) define their own skeletons.
 */
export default function Loading() {
  return (
    <div className="sys-load-min" aria-busy="true" aria-label="Loading">
      <div className="sys-load-min__stack">
        <div className="sys-spinner" aria-hidden />
        <span>Loading&hellip;</span>
      </div>
    </div>
  );
}
