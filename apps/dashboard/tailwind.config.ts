import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: "#886CC0", light: "#a88fd6", dark: "#6a4fa0", hover: "#7a5fb5" },
        secondary: { DEFAULT: "#FFA7D7", light: "#ffbfe3" },
        success: { DEFAULT: "#09BD3C", light: "#d4f5dd" },
        warning: { DEFAULT: "#FFBF00", light: "#fff3cc" },
        danger: { DEFAULT: "#FC2E53", light: "#fdd9e0" },
        info: { DEFAULT: "#D653C1", light: "#f3d4ee" },
        dark: { DEFAULT: "#161717", card: "#202020", border: "#2B2B2B", lighter: "#2d2d2d" },
        text: { primary: "#ffffff", muted: "#828690", gray: "#b3b3b3" },
      },
      fontFamily: { sans: ["Roboto", "sans-serif"] },
      fontSize: {
        xs: "0.75rem", sm: "0.8125rem", base: "0.875rem", lg: "1rem",
        xl: "1.125rem", "2xl": "1.25rem", "3xl": "1.5rem", "4xl": "1.875rem", "5xl": "2.25rem",
      },
      borderRadius: { DEFAULT: "0.625rem", sm: "0.325rem", lg: "1rem", pill: "2rem" },
      spacing: { "4.5": "1.125rem", "7.5": "1.875rem" },
      boxShadow: {
        card: "0 5px 5px 0 rgba(82,63,105,0.05)",
        "card-dark": "0 0 0 1px rgba(255,255,255,0.1)",
        primary: "0 5px 15px 0 rgba(136,108,192,0.2)",
      },
    },
  },
  plugins: [],
};
export default config;
