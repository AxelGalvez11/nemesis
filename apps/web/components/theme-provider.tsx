"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";
export type ThemePreference = Theme | "system";
export type AccentPreference = "crimson" | "blue" | "green" | "orange" | "purple";
const STORAGE_KEY = "pharmaorb-theme";
const ACCENT_STORAGE_KEY = "nemesis.web.accent";
const SCALE_STORAGE_KEY = "nemesis.web.scale";
// Library chrome mode. Lives here rather than in the assistant-preferences blob
// because two surfaces read it live — WorkspaceShell (whether to suppress the
// nav rail) and the Library sidebar (whether to offer the Back exit) — and the
// settings modal renders over the workspace, so a change must apply without a
// reload. Same shape as theme/accent/scale, which are app-chrome for the same
// reason. Default true keeps the shipped full-screen behaviour.
const LIBRARY_FULL_SCREEN_STORAGE_KEY = "nemesis.web.library-full-screen";
const ACCENT_COLORS: Record<Exclude<AccentPreference, "crimson">, string> = {
  blue: "#2563eb",
  green: "#16865c",
  orange: "#d26324",
  purple: "#7c4dca",
};

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
  accent: AccentPreference;
  scale: number;
  /** Library takes over the left side, hiding the workspace nav rail. */
  libraryFullScreen: boolean;
  setTheme: (t: ThemePreference) => void;
  setAccent: (accent: AccentPreference) => void;
  setScale: (scale: number) => void;
  setLibraryFullScreen: (fullScreen: boolean) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  preference: "system",
  theme: "light",
  accent: "crimson",
  scale: 110,
  libraryFullScreen: true,
  setTheme: () => {},
  setAccent: () => {},
  setScale: () => {},
  setLibraryFullScreen: () => {},
  toggle: () => {},
});

function isAccent(value: string | null): value is AccentPreference {
  return value === "crimson" || value === "blue" || value === "green" || value === "orange" || value === "purple";
}

function applyAccent(accent: AccentPreference) {
  const root = document.documentElement;
  if (accent === "crimson") {
    root.style.removeProperty("--theme-primary");
    root.style.removeProperty("--theme-midground");
    root.style.removeProperty("--theme-warm");
    return;
  }
  const color = ACCENT_COLORS[accent];
  root.style.setProperty("--theme-primary", color);
  root.style.setProperty("--theme-midground", color);
  root.style.setProperty("--theme-warm", color);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Default light; the inline no-flash script in layout.tsx already resolved stored→OS→light onto
  // <html data-theme> before paint, so we read it back on mount to sync React state.
  const [theme, setThemeState] = useState<Theme>("light");
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [accent, setAccentState] = useState<AccentPreference>("crimson");
  const [scale, setScaleState] = useState(110);
  const [libraryFullScreen, setLibraryFullScreenState] = useState(true);

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
    const storedAccent = localStorage.getItem(ACCENT_STORAGE_KEY);
    const nextAccent = isAccent(storedAccent) ? storedAccent : "crimson";
    const storedScale = Number(localStorage.getItem(SCALE_STORAGE_KEY));
    const nextScale = Number.isFinite(storedScale) && storedScale >= 50 && storedScale <= 150 ? storedScale : 110;
    setAccentState(nextAccent);
    setScaleState(nextScale);
    applyAccent(nextAccent);
    document.documentElement.style.fontSize = `${nextScale}%`;
    // Only an explicit "false" opts out; anything else (unset, malformed) keeps
    // the shipped full-screen default.
    setLibraryFullScreenState(localStorage.getItem(LIBRARY_FULL_SCREEN_STORAGE_KEY) !== "false");
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

  const setAccent = (next: AccentPreference) => {
    setAccentState(next);
    applyAccent(next);
    try { localStorage.setItem(ACCENT_STORAGE_KEY, next); } catch { /* best effort */ }
  };

  const setScale = (next: number) => {
    const clamped = Math.min(150, Math.max(50, Math.round(next)));
    setScaleState(clamped);
    document.documentElement.style.fontSize = `${clamped}%`;
    try { localStorage.setItem(SCALE_STORAGE_KEY, String(clamped)); } catch { /* best effort */ }
  };

  const setLibraryFullScreen = (next: boolean) => {
    setLibraryFullScreenState(next);
    try { localStorage.setItem(LIBRARY_FULL_SCREEN_STORAGE_KEY, String(next)); } catch { /* best effort */ }
  };

  // The topbar button toggles light ↔ dark; Settings offers System/Light/Dark explicitly.
  const toggle = () => setTheme(theme === "light" ? "dark" : "light");

  return <ThemeContext.Provider value={{ preference, theme, accent, scale, libraryFullScreen, setTheme, setAccent, setScale, setLibraryFullScreen, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
