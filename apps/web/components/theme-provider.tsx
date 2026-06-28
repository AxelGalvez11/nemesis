"use client";

import { createContext, useContext, useEffect, useState } from "react";
import {
  isThemePreference,
  nextThemePreference,
  resolveThemePreference,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme-preference";

const STORAGE_KEY = "pharmaorb-theme";

function prefersDarkScheme(): boolean {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

interface ThemeContextValue {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setTheme: (t: ThemePreference) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  resolvedTheme: "light",
  setTheme: () => {},
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // The inline no-flash script in layout.tsx already resolved stored/system preference onto
  // <html data-theme> before paint, so we read it back on mount to sync React state.
  const [theme, setThemeState] = useState<ThemePreference>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");

  useEffect(() => {
    const fromDom = document.documentElement.dataset.themePreference;
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    const next = isThemePreference(stored) ? stored : isThemePreference(fromDom) ? fromDom : "system";
    setThemeState(next);
    setResolvedTheme(resolveThemePreference(next, prefersDarkScheme()));
  }, []);

  useEffect(() => {
    if (theme !== "system" || typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      const resolved = resolveThemePreference("system", mq.matches);
      setResolvedTheme(resolved);
      document.documentElement.dataset.theme = resolved;
      document.documentElement.dataset.themePreference = "system";
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [theme]);

  const setTheme = (t: ThemePreference) => {
    const resolved = resolveThemePreference(t, prefersDarkScheme());
    setThemeState(t);
    setResolvedTheme(resolved);
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themePreference = t;
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* private mode / storage disabled — theme still applies for the session */
    }
  };

  const toggle = () => setTheme(nextThemePreference(theme));

  return <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
