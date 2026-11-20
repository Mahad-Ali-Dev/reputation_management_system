"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type Theme = "light" | "dark";

/** localStorage key for an explicit light/dark choice. Absent = follow the OS. */
export const THEME_STORAGE_KEY = "rl-theme";

/**
 * Runs in <head> before first paint (see app/layout.tsx), so a dark-mode user
 * never sees a white flash while React hydrates. Kept as a string because it
 * must execute before any bundle loads.
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="light"}})();`;

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

/**
 * Owns the app-wide light/dark choice. The source of truth is the
 * `data-theme` attribute on <html>; dark styles are scoped to glass app pages
 * in app/globals.css, so public pages (login, landing) are unaffected.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Starts "light" on server and first client render so markup matches; the
  // effect below picks up what the init script already applied to <html>.
  const [theme, setThemeState] = useState<Theme>("light");

  const apply = useCallback((next: Theme) => {
    document.documentElement.dataset.theme = next;
    setThemeState(next);
  }, []);

  useEffect(() => {
    setThemeState(document.documentElement.dataset.theme === "dark" ? "dark" : "light");

    // Track OS changes only until the user picks a theme explicitly.
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = (event: MediaQueryListEvent) => {
      if (readStoredTheme() === null) apply(event.matches ? "dark" : "light");
    };
    media.addEventListener("change", onSystemChange);

    // Keep other open tabs in sync.
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      const stored = readStoredTheme();
      apply(stored ?? (media.matches ? "dark" : "light"));
    };
    window.addEventListener("storage", onStorage);

    return () => {
      media.removeEventListener("change", onSystemChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [apply]);

  const setTheme = useCallback(
    (next: Theme) => {
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // Private mode / blocked storage: still switch for this page view.
      }
      apply(next);
    },
    [apply],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme,
      toggleTheme: () => setTheme(theme === "dark" ? "light" : "dark"),
    }),
    [theme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside <ThemeProvider>");
  return context;
}
