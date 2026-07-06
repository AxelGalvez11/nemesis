"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";
export type ThemePreference = Theme | "system";
const STORAGE_KEY = "pharmaorb-theme";

const isTheme = (v: unknown): v is Theme => v === "light" || v === "dark";
const isPreference = (v: unknown): v is ThemePreference => isTheme(v) || v === "system";
const systemTheme = (): Theme =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";

// Only two themes ship now ("grey" was removed — owner: "Only white and black"). A stored
// preference of "grey" from before the removal must keep resolving to something valid, so
// existing users don't silently flip to an unintended theme on read.
const normalizeStoredPreference = (v: string | null): string | null => (v === "grey" ? "dark" : v);

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
    // Normalize legacy "grey" (pre-existing users' stored preference, or a stale value the
    // no-flash script may have already written to the DOM) to "dark" before validating.
    const fromDom = normalizeStoredPreference(document.documentElement.dataset.theme ?? null);
    const stored = normalizeStoredPreference(typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null);
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

  // The topbar button toggles light ↔ dark; Settings offers System/Light/Dark explicitly.
  const toggle = () => setTheme(theme === "light" ? "dark" : "light");

  return <ThemeContext.Provider value={{ preference, theme, setTheme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
