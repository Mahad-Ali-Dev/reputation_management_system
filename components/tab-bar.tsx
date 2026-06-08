"use client";

import { Icon, type IconName } from "@/components/shell/icon";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type JSX, useCallback, useRef } from "react";

/**
 * `<TabBar>` — the persistent top-tab shell used across the app (Steps 6–13).
 *
 * THE DEFINING REQUIREMENT — MOUNTED PANELS.
 * `TabBar` renders ONLY the bar. It never renders panels and never unmounts
 * anything. The parent renders every panel and hides the inactive ones with
 * CSS so per-tab client state (an in-progress input, a scroll position, a
 * fetched list) survives a tab switch and switches feel instant.
 *
 * Canonical parent pattern (controlled mode — the default + recommended):
 * ```tsx
 * const [tab, setTab] = useState("feed");
 * <TabBar tabs={TABS} activeKey={tab} onChange={setTab} />
 * // keep ALL panels mounted; toggle visibility — do NOT conditionally render:
 * <div hidden={tab !== "feed"}><FeedPanel /></div>
 * <div hidden={tab !== "requests"}><RequestsPanel /></div>
 * ```
 * Conditionally rendering (`{tab === "feed" && <FeedPanel/>}`) destroys per-tab
 * state on every switch — that is the one mistake this primitive is shaped to
 * prevent (the bar renders no panels, so the wrong choice is visibly the
 * parent's).
 *
 * URL MODE (`syncParam`).
 * For server-heavy tabs that must NOT all load at once, pass `syncParam="t"`
 * and the bar reads/writes `?t=<key>` via next/navigation (shallow,
 * `scroll: false`) instead of calling `onChange`. Accept remount in this mode —
 * each tab is typically its own route segment / server-rendered panel. Because
 * it reads `useSearchParams`, a component tree using `syncParam` must sit under
 * a React `<Suspense>` boundary (standard Next.js App Router requirement).
 *
 * Styling reuses the existing design-system `.tabs` / `.tabs__t` / `.is-active`
 * hooks plus `.chip` for the count badge — no new CSS this wave.
 */

export type TabItem = {
  /** Stable id; also the query-param value in `syncParam` mode. */
  key: string;
  label: string;
  /** Optional leading icon (from components/shell/icon). */
  icon?: IconName;
  /** Small count pill (e.g. unread). Hidden when 0 / undefined. */
  badge?: string | number;
  /** Renders a padlock; click routes to /subscription?feature=<key> instead of switching. */
  locked?: boolean;
  /** Non-interactive (e.g. a connection-gated tab): greyed, not focusable. */
  disabled?: boolean;
};

export function TabBar({
  tabs,
  activeKey,
  onChange,
  syncParam,
  actions,
  className,
}: {
  tabs: TabItem[];
  activeKey: string;
  /**
   * Controlled mode (default): parent owns active state and keeps children
   * mounted. Ignored when `syncParam` is set.
   */
  onChange?: (key: string) => void;
  /**
   * URL mode: when set, the bar reads/writes `?<syncParam>=<key>` (shallow,
   * scroll:false) and ignores `onChange`. Use for deep-linkable tabs.
   */
  syncParam?: string;
  /** Optional right-aligned actions rendered inside the bar (e.g. a "New" button). */
  actions?: React.ReactNode;
  className?: string;
}): JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  // useSearchParams is only meaningfully consumed in syncParam mode, but the
  // hook must be called unconditionally (rules of hooks).
  const searchParams = useSearchParams();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const selectByUrl = useCallback(
    (key: string) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.set(syncParam as string, key);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams, syncParam],
  );

  const activate = useCallback(
    (tab: TabItem) => {
      if (tab.disabled) return;
      if (tab.locked) {
        // Locked tab never reveals its panel — route to upgrade instead.
        router.push(`/subscription?feature=${encodeURIComponent(tab.key)}`);
        return;
      }
      if (tab.key === activeKey) return;
      if (syncParam) selectByUrl(tab.key);
      else onChange?.(tab.key);
    },
    [activeKey, syncParam, selectByUrl, onChange, router],
  );

  /**
   * Roving keyboard navigation across the tablist. ArrowLeft/Right (and
   * Home/End) move focus to the next non-disabled tab and activate it, matching
   * the WAI-ARIA tabs "automatic activation" pattern.
   */
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      const key = e.key;
      if (
        key !== "ArrowRight" &&
        key !== "ArrowLeft" &&
        key !== "Home" &&
        key !== "End"
      ) {
        return;
      }
      e.preventDefault();
      const last = tabs.length - 1;
      const step = key === "ArrowRight" ? 1 : key === "ArrowLeft" ? -1 : 0;

      let next: number;
      if (key === "Home") next = 0;
      else if (key === "End") next = last;
      else next = index;

      // Walk in `step` direction (wrapping) to the next focusable tab.
      for (let i = 0; i <= last; i++) {
        if (key === "Home" || key === "End") {
          // From the edge, scan inward for the first non-disabled tab.
          const dir = key === "Home" ? 1 : -1;
          let probe = next;
          while (probe >= 0 && probe <= last && tabs[probe]?.disabled) probe += dir;
          if (probe >= 0 && probe <= last) next = probe;
          break;
        }
        next = (next + step + tabs.length) % tabs.length;
        if (!tabs[next]?.disabled) break;
      }

      const target = tabs[next];
      if (!target || target.disabled) return;
      refs.current[next]?.focus();
      activate(target);
    },
    [tabs, activate],
  );

  return (
    <div
      className={className ? `tabbar ${className}` : "tabbar"}
      style={{ display: "flex", alignItems: "center", gap: 8 }}
    >
      <div
        role="tablist"
        aria-orientation="horizontal"
        className="tabs"
        style={{ flex: 1, overflowX: "auto", scrollbarWidth: "none" }}
      >
        {tabs.map((tab, i) => {
          const isActive = tab.key === activeKey;
          const showBadge =
            tab.badge !== undefined &&
            tab.badge !== null &&
            tab.badge !== 0 &&
            tab.badge !== "0";
          return (
            <button
              key={tab.key}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${tab.key}`}
              aria-selected={isActive}
              aria-controls={`panel-${tab.key}`}
              aria-disabled={tab.disabled || tab.locked || undefined}
              // Roving tabindex: only the active tab is in the tab order.
              tabIndex={isActive ? 0 : -1}
              disabled={tab.disabled}
              className={isActive ? "tabs__t is-active" : "tabs__t"}
              onClick={() => activate(tab)}
              onKeyDown={(e) => onKeyDown(e, i)}
              style={
                tab.disabled
                  ? { opacity: 0.45, cursor: "not-allowed" }
                  : tab.locked
                    ? { cursor: "pointer" }
                    : undefined
              }
            >
              {tab.icon && <Icon name={tab.icon} size={14} />}
              <span>{tab.label}</span>
              {showBadge && (
                <span
                  className="chip chip--info"
                  style={{ height: 18, padding: "0 6px", fontSize: 10.5 }}
                >
                  {tab.badge}
                </span>
              )}
              {tab.locked && (
                <Icon
                  name="lock"
                  size={12}
                  title="Upgrade to unlock"
                  style={{ color: "var(--rl-muted-2)" }}
                />
              )}
            </button>
          );
        })}
      </div>
      {actions && <div className="tabbar__actions">{actions}</div>}
    </div>
  );
}
