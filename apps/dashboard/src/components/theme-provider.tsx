"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "a" | "b" | "c";

const THEME_LABELS: Record<Theme, string> = {
  a: "Terminal",
  b: "Studio",
  c: "Nebula",
};

interface ThemeCtx {
  theme: Theme;
  setTheme: (t: Theme) => void;
  themes: typeof THEME_LABELS;
}

const Ctx = createContext<ThemeCtx>({
  theme: "a",
  setTheme: () => {},
  themes: THEME_LABELS,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("a");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("am.theme") as Theme | null;
      if (saved && (saved === "a" || saved === "b" || saved === "c")) {
        setThemeState(saved);
      }
    } catch {}
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    html.classList.remove("theme-a", "theme-b", "theme-c", "light");
    html.classList.add(`theme-${theme}`);
    if (theme === "b") html.classList.add("light");
  }, [theme]);

  function setTheme(t: Theme) {
    setThemeState(t);
    try { localStorage.setItem("am.theme", t); } catch {}
  }

  return (
    <Ctx.Provider value={{ theme, setTheme, themes: THEME_LABELS }}>
      {children}
    </Ctx.Provider>
  );
}

export function useTheme() {
  return useContext(Ctx);
}
