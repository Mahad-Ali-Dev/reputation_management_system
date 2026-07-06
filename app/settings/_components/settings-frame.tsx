import { SettingsNav } from "./settings-nav";

/**
 * Sub-page frame — the two-column body (sticky left sub-nav rail + content
 * pane) shared by every /settings/<section> route EXCEPT the overview hub
 * (/settings), which is full-width per the kit mockup.
 *
 * The shared hero lives in layout.tsx; this frame only owns the rail + pane so
 * the hub can opt out of the rail simply by not using it.
 */
export function SettingsFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="set-layout">
      <SettingsNav />
      <div className="set-pane">{children}</div>
    </div>
  );
}
