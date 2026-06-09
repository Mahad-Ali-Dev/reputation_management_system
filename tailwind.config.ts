import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        rl: {
          bg: "var(--bg)",
          "bg-2": "var(--bg-2)",
          surface: "var(--surface)",
          "surface-2": "var(--surface-2)",
          "surface-3": "var(--surface-3)",
          pri: "var(--pri)",
          "pri-50": "var(--pri-50)",
          "pri-100": "var(--pri-100)",
          "pri-700": "var(--pri-700)",
          "pri-900": "var(--pri-900)",
          text: "var(--text)",
          "text-muted": "var(--text-muted)",
          "text-subtle": "var(--text-subtle)",
          "text-on-pri": "var(--text-on-pri)",
          border: "var(--border)",
          "border-strong": "var(--border-strong)",
          success: "var(--success)",
          "success-bg": "var(--success-bg)",
          "success-border": "var(--success-border)",
          warning: "var(--warning)",
          "warning-bg": "var(--warning-bg)",
          "warning-border": "var(--warning-border)",
          danger: "var(--danger)",
          "danger-bg": "var(--danger-bg)",
          "danger-border": "var(--danger-border)",
          info: "var(--info)",
          "info-bg": "var(--info-bg)",
          rating: "var(--rating-filled)",
          "rating-empty": "var(--rating-empty)",
        },
      },
      boxShadow: {
        "rl-sm": "var(--shadow-sm)",
        "rl-md": "var(--shadow-md)",
        "rl-lg": "var(--shadow-lg)",
      },
      transitionTimingFunction: {
        rl: "var(--ease-out)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        "rl-control": "8px",
        "rl-card": "12px",
        "rl-layer": "16px",
        "rl-pill": "9999px",
      },
      fontFamily: {
        sans: [
          "var(--f-ui)",
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
