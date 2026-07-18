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
    // Resolve the stored preference (stored → OS → dark) and make it AUTHORITATIVE on the DOM.
    // The SSR `<html data-theme="dark">` literal is the identity anchor, but hydration can leave
    // it asserted over the no-flash script, so a stored light/dark choice — or an OS light
    // preference under "system" — would otherwise be lost on reload. Reading `data-theme` back
    // (the old behavior) inherited that stale value; instead we recompute from the preference and
    // write it through, which corrects the DOM regardless of what hydration left behind.
    // Normalize legacy "grey" (pre-removal stored value) to "dark" before validating.
    const stored = normalizeStoredPreference(typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null);
    const pref: ThemePreference = isPreference(stored) ? stored : "system";
    const resolved: Theme = pref === "system" ? systemTheme() : pref;
    setPreferenceState(pref);
    setThemeState(resolved);
    document.documentElement.dataset.theme = resolved;
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
