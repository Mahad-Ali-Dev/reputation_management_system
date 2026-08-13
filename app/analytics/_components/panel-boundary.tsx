"use client";

import { Component, type ReactNode } from "react";

/**
 * Per-panel error boundary for the Business Reports hub. A render throw in ANY
 * single report panel (unexpected/empty prod data shape, a `.toFixed` on a null,
 * etc.) must NOT take down the whole page to the route error boundary ("Something
 * went wrong"). Each panel is wrapped in one of these, so a bad panel degrades to
 * a small inline notice while every other panel keeps working.
 *
 * Client component (React error boundaries require a class + componentDidCatch);
 * it can wrap server-component children — a throw during their streamed render
 * surfaces here.
 */
export class PanelBoundary extends Component<
  { children: ReactNode; label?: string },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    // Surfaced to the browser console + (via Next) the server log / Sentry.
    console.error("[reports] panel render failed", this.props.label, error);
  }

  render() {
    if (this.state.failed) {
      return (
        <div
          className="ds-card"
          style={{
            padding: 28,
            textAlign: "center",
            color: "var(--ink-3, #667085)",
            fontSize: 13.5,
          }}
        >
          {this.props.label ? `The ${this.props.label} view` : "This view"} couldn’t load with your
          current data. The rest of your report is unaffected — refresh to try again.
        </div>
      );
    }
    return this.props.children;
  }
}
