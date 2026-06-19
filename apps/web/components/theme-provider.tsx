"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "grey" | "dark";
const STORAGE_KEY = "pharmaorb-theme";

const isTheme = (v: unknown): v is Theme => v === "light" || v === "grey" || v === "dark";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  setTheme: () => {},
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Default light; the inline no-flash script in layout.tsx already resolved stored→OS→light onto
  // <html data-theme> before paint, so we read it back on mount to sync React state.
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    const fromDom = document.documentElement.dataset.theme;
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    setThemeState(isTheme(stored) ? stored : isTheme(fromDom) ? fromDom : "light");
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    document.documentElement.dataset.theme = t;
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* private mode / storage disabled — theme still applies for the session */
    }
  };

  // The topbar button cycles light → grey → dark → light; Settings offers the three explicitly.
  const toggle = () => setTheme(theme === "light" ? "grey" : theme === "grey" ? "dark" : "light");

  return <ThemeContext.Provider value={{ theme, setTheme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
