"use client";

import { createContext, useContext, useEffect, useState } from "react";

import { ACCENT_PROPERTIES, ACCENT_STORAGE_KEY, accentProperties, isAccent, normalizeStoredAccent, type AccentPreference } from "@/lib/accent";

// Re-exported so every existing `from "@/components/theme-provider"` import
// keeps working; lib/accent.ts is the definition.
export { ACCENT_COLORS, ACCENT_LABELS, ACCENT_PREFERENCES, DEFAULT_ACCENT_SWATCH, type AccentPreference } from "@/lib/accent";

type Theme = "light" | "dark";
export type ThemePreference = Theme | "system";
const STORAGE_KEY = "nemesis.web.theme";
// 🔴 READ-ONLY, AND IT HAS TO STAY. The key was "pharmaorb-theme" for the whole PharmaOrb era.
// Renaming it without this fallback would not have been a cosmetic change: every student who
// had ever chosen light or dark would silently lose that choice on their next visit, because a
// missing key falls through to the system preference. Read old, write new; a student who
// changes their theme once is migrated for good, and one who never does keeps what they picked.
const LEGACY_STORAGE_KEY = "pharmaorb-theme";
// v2, and the bump is load-bearing: SCALE_FACTOR below changes what a stored
// number MEANS, so reading a v1 value would render it 25% larger than the
// student chose. A new key retires those cleanly onto the new default.
const SCALE_STORAGE_KEY = "nemesis.web.scale.v2";
// Library chrome mode. Lives here rather than in the assistant-preferences blob
// because two surfaces read it live — WorkspaceShell (whether to suppress the
// nav rail) and the Library sidebar (whether to offer the Back exit) — and the
// settings modal renders over the workspace, so a change must apply without a
// reload. Same shape as theme/accent/scale, which are app-chrome for the same
// reason.
//
// Owner 2026-07-30: "the default for library should be 'keep sidebar'". So the
// default is now FALSE, and the stored-value test below reads `=== "true"` —
// only an explicit opt-in gives Library the whole left side. Getting that
// sentinel backwards is the way this change silently does nothing: the mount
// effect runs after the useState default and would overwrite it.
const LIBRARY_FULL_SCREEN_STORAGE_KEY = "nemesis.web.library-full-screen";
// Dark mode ships in two tones (owner 2026-08-05: "keep charcoal as an option
// in settings, bring back the 100% black background"): "black" is the default
// pure-black skin, "charcoal" the ChatGPT-parity gray ladder. CSS keys off
// <html data-dark-tone>; the attribute is set unconditionally but only the
// dark-theme selectors read it, so it is inert in light mode.
export type DarkTone = "black" | "charcoal";
const DARK_TONE_STORAGE_KEY = "nemesis.web.dark-tone";
/**
 * Which expressions the character wears while nothing is happening.
 *
 * 🔴 A PREFERENCE, NOT A CONSTANT, ON THE OWNER'S OWN ASK (2026-08-27: *"allow me to pick the
 * expressions for the montage"*). Stored beside the theme and the accent because it is the same
 * kind of thing: a per-device choice about how the app looks, with a sensible default nobody has
 * to touch. Absent means the default set, which is what everyone gets until they open Settings.
 */
const MONTAGE_STORAGE_KEY = "nemesis.web.character-montage";
const isDarkTone = (v: unknown): v is DarkTone => v === "black" || v === "charcoal";

// Owner 2026-07-28: "i need the default scaling size to match chatgpt".
// MEASURED on chatgpt.com and on our own build, not guessed: ChatGPT runs its
// root, its body and every control at 16px. Nemesis at the old 110% put the
// root at 17.6px but its nav, chat rows and composer at 14.3px — the CHROME was
// the small part, not the reading text, which is why raising only the
// conversation token did not answer the complaint. 125% lands those controls on
// 16.25px. The conversation tokens in desktop-ui.css are re-based against the
// new 20px root so the ANSWER text stays on 16px exactly instead of riding up
// to 20px with everything else.
// Owner 2026-07-28: "chatgpt '100%' is bigger than nemesis '100%' we need a
// bigger default", answering "recalibrate AND go bigger".
//
// The dial's numbers were meaningless against anything: our 100% put the root at
// 16px and the nav at 13px, where ChatGPT's default is 16px THROUGHOUT. So 100%
// now MEANS ChatGPT's size — SCALE_FACTOR maps it onto a 20px root, which is
// what measured equal to their 16px controls (our nav is 0.8125rem of root).
//
// Owner 2026-07-30: "i need the default size for the webapp to be 100% not
// 115%." The RECALIBRATION stands and is what makes 100% the right number to
// land on — the dial reads 100% and the app renders at ChatGPT's size, which is
// the same size the 115% step was reaching for by a different route. Only the
// extra step above parity is gone.
//
//   dial 100% -> root 20px  -> nav 16.25px  (ChatGPT parity, the default)
//   dial 115% -> root 23px  -> nav 18.7px   (still one step up the dial)
//
// Owner 2026-08-04: "make the default scale be around 90% of the current
// scale now. so the new 100% scale becomes that." One step below ChatGPT
// parity, everywhere, without moving the dial: 1.25 x 0.9 = 1.125.
//
//   dial 100% -> root 18px  (the new default render)
//   dial 115% -> root 20.7px
const SCALE_FACTOR = 1.125;
const DEFAULT_SCALE = 100;

/** Percentage to hand the root element. Kept next to SCALE_FACTOR so the two can
 *  never drift — every writer goes through this. */
function scaleToRootPercent(scale: number): number {
  return Math.round(scale * SCALE_FACTOR * 10) / 10;
}
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
  /** How dark surfaces render when the theme is dark: pure black or charcoal. */
  darkTone: DarkTone;
  /** Library takes over the left side, hiding the workspace nav rail. */
  libraryFullScreen: boolean;
  setTheme: (t: ThemePreference) => void;
  setAccent: (accent: AccentPreference) => void;
  /** Null until read from storage, and null MEANS "the default set" — see `resolveMontage`. */
  montage: readonly string[] | null;
  setMontage: (faces: readonly string[]) => void;
  setScale: (scale: number) => void;
  setDarkTone: (tone: DarkTone) => void;
  setLibraryFullScreen: (fullScreen: boolean) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  preference: "system",
  theme: "light",
  accent: "default",
  scale: DEFAULT_SCALE,
  darkTone: "black",
  libraryFullScreen: false,
  setTheme: () => {},
  setAccent: () => {},
  montage: null,
  setMontage: () => {},
  setScale: () => {},
  setDarkTone: () => {},
  setLibraryFullScreen: () => {},
  toggle: () => {},
});

function applyAccent(accent: AccentPreference) {
  const root = document.documentElement;
  if (accent === "default") {
    // Removing every property an accent can set is what makes "Default" mean the values in
    // app/styles/desktop-ui.css — a light/dark pair no single hex could stand for — rather
    // than a seventh colour in the table. Driven off ACCENT_PROPERTIES so a property added
    // to `accentProperties` cannot be left behind here and stick after a switch back.
    for (const property of ACCENT_PROPERTIES) root.style.removeProperty(property);
    return;
  }
  // 🔴 THE SAME DEFINITION THE PRE-PAINT SCRIPT USES, not a second copy of it. See
  // `accentProperties` and `accentPrePaintScript` in lib/accent.ts: this runs after
  // hydration and that one runs before first paint, and the two disagreeing is precisely
  // the flash they exist to prevent.
  //
  // 🔴 THE ACCENT GOVERNS THE SEND BUTTON (owner 2026-08-20: "the send button is hardcoded
  // green and does not change with the other color changes"). desktop-ui.css kept
  // --ui-action separate from --ui-accent on the reasoning that anything branded there "is
  // erased the moment someone picks Blue" — correct about --theme-midground, which feeds the
  // whole chrome tint, but it left the product's most prominent control as the one thing the
  // picker could not reach. Setting --ui-action as its own property keeps both: the chrome
  // tint stays a tint, and the primary action follows the choice. The glyph on that fill
  // moves with it, because a fill that moves needs a foreground that moves too.
  const properties = accentProperties(accent);
  for (const [property, value] of Object.entries(properties)) root.style.setProperty(property, value);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Default light; the inline no-flash script in layout.tsx already resolved stored→OS→light onto
  // <html data-theme> before paint, so we read it back on mount to sync React state.
  const [theme, setThemeState] = useState<Theme>("light");
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [accent, setAccentState] = useState<AccentPreference>("default");
  const [montage, setMontageState] = useState<readonly string[] | null>(null);
  const [scale, setScaleState] = useState(DEFAULT_SCALE);
  const [darkTone, setDarkToneState] = useState<DarkTone>("black");
  const [libraryFullScreen, setLibraryFullScreenState] = useState(false);

  useEffect(() => {
    // Resolve the stored preference (stored → OS → dark) and make it AUTHORITATIVE on the DOM.
    // The SSR `<html data-theme="dark">` literal is the identity anchor, but hydration can leave
    // it asserted over the no-flash script, so a stored light/dark choice — or an OS light
    // preference under "system" — would otherwise be lost on reload. Reading `data-theme` back
    // (the old behavior) inherited that stale value; instead we recompute from the preference and
    // write it through, which corrects the DOM regardless of what hydration left behind.
    // Normalize legacy "grey" (pre-removal stored value) to "dark" before validating.
    const stored = normalizeStoredPreference(
      typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY) : null,
    );
    const pref: ThemePreference = isPreference(stored) ? stored : "system";
    const resolved: Theme = pref === "system" ? systemTheme() : pref;
    setPreferenceState(pref);
    setThemeState(resolved);
    document.documentElement.dataset.theme = resolved;
    const storedAccent = normalizeStoredAccent(localStorage.getItem(ACCENT_STORAGE_KEY));
    const nextAccent = isAccent(storedAccent) ? storedAccent : "default";
    const storedScale = Number(localStorage.getItem(SCALE_STORAGE_KEY));
    const nextScale = Number.isFinite(storedScale) && storedScale >= 50 && storedScale <= 150 ? storedScale : DEFAULT_SCALE;
    setAccentState(nextAccent);
    setScaleState(nextScale);
    applyAccent(nextAccent);
    document.documentElement.style.fontSize = `${scaleToRootPercent(nextScale)}%`;
    // Same authoritative-write pattern as the theme above: the inline no-flash
    // script already stamped data-dark-tone, but recompute from storage and
    // write through so hydration can't leave a stale attribute behind.
    const storedTone = localStorage.getItem(DARK_TONE_STORAGE_KEY);
    const nextTone: DarkTone = isDarkTone(storedTone) ? storedTone : "black";
    setDarkToneState(nextTone);
    document.documentElement.dataset.darkTone = nextTone;
    // Only an explicit "true" opts IN to full screen; anything else (unset,
    // malformed) keeps the nav rail beside Library. Inverted 2026-07-30 with
    // the default — see the storage-key comment.
    setLibraryFullScreenState(localStorage.getItem(LIBRARY_FULL_SCREEN_STORAGE_KEY) === "true");
    // 🔴 PARSED DEFENSIVELY AND NEVER TRUSTED. Anything in storage may be from an older build, or
    // hand-edited; `resolveMontage` drops unknown ids and falls back rather than drawing nothing.
    try {
      const raw = localStorage.getItem(MONTAGE_STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed)) setMontageState(parsed.filter((v): v is string => typeof v === "string"));
    } catch {
      /* best effort */
    }
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

  const setMontage = (faces: readonly string[]) => {
    setMontageState(faces);
    try { localStorage.setItem(MONTAGE_STORAGE_KEY, JSON.stringify(faces)); } catch { /* best effort */ }
  };

  const setAccent = (next: AccentPreference) => {
    setAccentState(next);
    applyAccent(next);
    try { localStorage.setItem(ACCENT_STORAGE_KEY, next); } catch { /* best effort */ }
  };

  const setScale = (next: number) => {
    const clamped = Math.min(150, Math.max(50, Math.round(next)));
    setScaleState(clamped);
    document.documentElement.style.fontSize = `${scaleToRootPercent(clamped)}%`;
    try { localStorage.setItem(SCALE_STORAGE_KEY, String(clamped)); } catch { /* best effort */ }
  };

  const setDarkTone = (tone: DarkTone) => {
    setDarkToneState(tone);
    document.documentElement.dataset.darkTone = tone;
    try { localStorage.setItem(DARK_TONE_STORAGE_KEY, tone); } catch { /* best effort */ }
  };

  const setLibraryFullScreen = (next: boolean) => {
    setLibraryFullScreenState(next);
    try { localStorage.setItem(LIBRARY_FULL_SCREEN_STORAGE_KEY, String(next)); } catch { /* best effort */ }
  };

  // The topbar button toggles light ↔ dark; Settings offers System/Light/Dark explicitly.
  const toggle = () => setTheme(theme === "light" ? "dark" : "light");

  return <ThemeContext.Provider value={{ preference, theme, accent, scale, darkTone, libraryFullScreen, montage, setTheme, setAccent, setScale, setDarkTone, setLibraryFullScreen, setMontage, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
