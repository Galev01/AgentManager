import type { Config } from "tailwindcss";

// Colors map to CSS variables defined in globals.css.
// Names are kept backward-compatible so the 11 unrewritten screens keep working.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Accent / semantic colours
        primary: {
          DEFAULT: "oklch(0.70 0.15 300)",   // --accent
          light:   "oklch(0.75 0.13 300)",
          dark:    "oklch(0.60 0.17 300)",
          hover:   "oklch(0.72 0.14 300)",
        },
        secondary: {
          DEFAULT: "oklch(0.76 0.17 150)",
          light:   "oklch(0.82 0.13 150)",
        },
        success: {
          DEFAULT: "oklch(0.76 0.17 150)",   // --ok
          light:   "oklch(0.76 0.17 150 / 0.14)",
        },
        warning: {
          DEFAULT: "oklch(0.80 0.14 75)",    // --warn
          light:   "oklch(0.80 0.14 75 / 0.14)",
        },
        danger: {
          DEFAULT: "oklch(0.68 0.20 25)",    // --err
          light:   "oklch(0.68 0.20 25 / 0.14)",
        },
        info: {
          DEFAULT: "oklch(0.74 0.12 240)",   // --info
          light:   "oklch(0.74 0.12 240 / 0.14)",
        },
        // Backward-compat surface names
        dark: {
          DEFAULT: "oklch(0.17 0.005 60)",   // --bg
          card:    "oklch(0.21 0.005 60)",   // --panel
          border:  "oklch(0.28 0.006 60)",   // --border
          lighter: "oklch(0.23 0.006 60)",   // --bg-hover
        },
        // text.primary / text.muted / text.gray
        text: {
          primary: "oklch(0.98 0.003 80)",   // --text
          muted:   "oklch(0.56 0.007 80)",   // --text-muted
          gray:    "oklch(0.74 0.006 80)",   // --text-dim
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      fontSize: {
        xs:   "0.75rem",
        sm:   "0.8125rem",
        base: "0.875rem",
        lg:   "1rem",
        xl:   "1.125rem",
        "2xl": "1.25rem",
        "3xl": "1.5rem",
        "4xl": "1.875rem",
        "5xl": "2.25rem",
      },
      borderRadius: {
        DEFAULT: "6px",
        sm:  "4px",
        lg:  "10px",
        pill: "999px",
      },
      spacing: {
        "4.5": "1.125rem",
        "7.5": "1.875rem",
      },
      boxShadow: {
        card:       "0 5px 5px 0 oklch(0 0 0 / 0.05)",
        "card-dark": "0 0 0 1px oklch(1 0 0 / 0.1)",
        primary:    "0 5px 15px -5px oklch(0.70 0.15 300 / 0.35)",
      },
    },
  },
  plugins: [],
};
export default config;
