"use client";

/**
 * Meta (Facebook + Instagram) is gated behind Meta's own App Review — the
 * OAuth flow itself is fully built (see lib/connections/adapters/meta.ts),
 * it's just blocked on Meta's approval, not on anything missing here. Until
 * that approval lands, every connect/reconnect entry point for the "meta"
 * provider should show this explainer instead of the live OAuth link.
 *
 * To remove once Meta approves the app: flip `META_APP_UNDER_REVIEW` to
 * `false` below (or delete the `META_APP_UNDER_REVIEW &&` guards that use it
 * in connections-browser.tsx, suggested-band.tsx, and
 * provider-detail-client.tsx) — that instantly restores the normal
 * Connect/Reconnect links everywhere, no other changes needed.
 */

import { Icon } from "@/components/shell/icon";
import { useEffect, useRef, useState } from "react";

export const META_APP_UNDER_REVIEW = true;

export function MetaReviewModal({
  triggerClassName,
  triggerLabel = "Connect",
}: {
  triggerClassName?: string;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className={triggerClassName}
        onClick={() => setOpen(true)}
      >
        {triggerLabel}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="meta-review-title"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            display: "grid",
            placeItems: "center",
            padding: 16,
            background: "rgba(11, 13, 14, 0.45)",
            backdropFilter: "blur(2px)",
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            className="ds-card"
            style={{
              width: "min(440px, 100%)",
              boxShadow: "0 24px 60px -20px rgba(11, 13, 14, 0.4)",
            }}
          >
            <div className="ds-card__body" style={{ padding: 22 }}>
              <div
                className="row"
                style={{ gap: 12, alignItems: "flex-start" }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 40,
                    height: 40,
                    flexShrink: 0,
                    borderRadius: 10,
                    background: "var(--pri-50)",
                    color: "var(--pri)",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <Icon name="clock" size={20} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <h2
                    id="meta-review-title"
                    style={{
                      fontSize: 16,
                      fontWeight: 600,
                      letterSpacing: "-0.015em",
                      margin: 0,
                      color: "var(--ink)",
                    }}
                  >
                    Meta integration is pending approval
                  </h2>
                  <span className="chip chip--warn" style={{ marginTop: 6 }}>
                    Under Meta review
                  </span>
                </div>
              </div>

              <p
                style={{
                  marginTop: 16,
                  fontSize: 13,
                  lineHeight: 1.55,
                  color: "var(--ink-2)",
                }}
              >
                Our Meta app for connecting Facebook and Instagram is currently
                going through Meta&rsquo;s App Review process. That&rsquo;s on
                Meta&rsquo;s side; there&rsquo;s nothing you need to do. As soon
                as it&rsquo;s approved, this integration will be available here
                automatically.
              </p>

              <div
                className="row"
                style={{ marginTop: 22, justifyContent: "flex-end", gap: 8 }}
              >
                <button
                  type="button"
                  ref={closeRef}
                  className="btn btn--pri"
                  onClick={() => setOpen(false)}
                >
                  Got it
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
