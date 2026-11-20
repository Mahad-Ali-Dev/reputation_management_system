"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "./theme-provider";

/** Navbar light/dark switch. Shows the icon of the theme you'd switch TO. */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      className="tb__iconbtn"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
    >
      {isDark ? (
        <Sun size={16} strokeWidth={1.9} aria-hidden="true" />
      ) : (
        <Moon size={16} strokeWidth={1.9} aria-hidden="true" />
      )}
    </button>
  );
}
