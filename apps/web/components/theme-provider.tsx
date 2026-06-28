"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "grey" | "dark";
export type ThemePreference = Theme | "system";
const STORAGE_KEY = "pharmaorb-theme";

const isTheme = (v: unknown): v is Theme => v === "light" || v === "grey" || v === "dark";
const isPreference = (v: unknown): v is ThemePreference => isTheme(v) || v === "system";
const systemTheme = (): Theme =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "grey" : "light";

interface ThemeContextValue {
  preference: ThemePreference;
  theme: Theme;
  setTheme: (t: ThemePreference) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  preference: "system",
  theme: "light",
  setTheme: () => {},
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Default light; the inline no-flash script in layout.tsx already resolved stored→OS→light onto
  // <html data-theme> before paint, so we read it back on mount to sync React state.
  const [theme, setThemeState] = useState<Theme>("light");
  const [preference, setPreferenceState] = useState<ThemePreference>("system");

  useEffect(() => {
    const fromDom = document.documentElement.dataset.theme;
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    setPreferenceState(isPreference(stored) ? stored : "system");
    setThemeState(isTheme(fromDom) ? fromDom : isTheme(stored) ? stored : systemTheme());
  }, []);

  useEffect(() => {
    if (preference !== "system" || typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      const resolved = systemTheme();
      setThemeState(resolved);
      document.documentElement.dataset.theme = resolved;
    };
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [preference]);

  const setTheme = (t: ThemePreference) => {
    const resolved = t === "system" ? systemTheme() : t;
    setPreferenceState(t);
    setThemeState(resolved);
    document.documentElement.dataset.theme = resolved;
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* private mode / storage disabled — theme still applies for the session */
    }
  };

  // The topbar button cycles light → grey → dark → light; Settings offers the three explicitly.
  const toggle = () => setTheme(theme === "light" ? "grey" : theme === "grey" ? "dark" : "light");

  return <ThemeContext.Provider value={{ preference, theme, setTheme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
