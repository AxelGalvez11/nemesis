// Theme context: the reactive half of the theme engine (palette.ts is the pure
// half). Holds the student's appearance preference — light/dark/system + accent
// swatch, desktop parity — persisted in SecureStore, and hands every screen a
// ready-built ThemeColors. Until the stored preference loads, the app renders
// the shipped default (dark + crimson) so cold start looks exactly like before.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import * as SecureStore from "expo-secure-store";

import {
  buildColors,
  DEFAULT_ACCENT_ID,
  type ResolvedMode,
  type ThemeColors,
  type ThemeMode,
} from "./palette";

const APPEARANCE_STORE = "nemesis_appearance_v1";

interface AppearancePref {
  mode: ThemeMode;
  accent: string;
}

export interface Theme {
  colors: ThemeColors;
  mode: ThemeMode;
  resolvedMode: ResolvedMode;
  accentId: string;
  setMode: (mode: ThemeMode) => void;
  setAccent: (accentId: string) => void;
}

const DEFAULT_PREF: AppearancePref = { accent: DEFAULT_ACCENT_ID, mode: "system" };

const FALLBACK_THEME: Theme = {
  accentId: DEFAULT_ACCENT_ID,
  colors: buildColors("dark", DEFAULT_ACCENT_ID),
  mode: "system",
  resolvedMode: "dark",
  setAccent: () => {},
  setMode: () => {},
};

const ThemeContext = createContext<Theme>(FALLBACK_THEME);

function parsePref(raw: string | null): AppearancePref {
  try {
    const parsed = raw ? (JSON.parse(raw) as Partial<AppearancePref>) : null;
    const mode = parsed?.mode === "light" || parsed?.mode === "dark" || parsed?.mode === "system" ? parsed.mode : "system";
    const accent = typeof parsed?.accent === "string" && parsed.accent ? parsed.accent : DEFAULT_ACCENT_ID;
    return { accent, mode };
  } catch {
    return DEFAULT_PREF;
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [pref, setPref] = useState<AppearancePref>(DEFAULT_PREF);

  useEffect(() => {
    let alive = true;
    void SecureStore.getItemAsync(APPEARANCE_STORE)
      .then((raw) => {
        if (alive) setPref(parsePref(raw));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const update = useCallback((next: AppearancePref) => {
    setPref(next);
    void SecureStore.setItemAsync(APPEARANCE_STORE, JSON.stringify(next)).catch(() => {});
  }, []);

  const value = useMemo<Theme>(() => {
    // Before the stored pref loads, "system dark" == the shipped default; a
    // system-light phone flips once the pref (or its absence) resolves.
    const resolvedMode: ResolvedMode = pref.mode === "system" ? (system === "light" ? "light" : "dark") : pref.mode;
    return {
      accentId: pref.accent,
      colors: buildColors(resolvedMode, pref.accent),
      mode: pref.mode,
      resolvedMode,
      setAccent: (accentId: string) => update({ ...pref, accent: accentId }),
      setMode: (mode: ThemeMode) => update({ ...pref, mode }),
    };
  }, [pref, system, update]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/** Memoized themed StyleSheet: `const styles = useThemedStyles(createStyles)`
 *  with a module-scope `createStyles(c: ThemeColors)` factory — the conversion
 *  pattern for every screen that used to build a static StyleSheet from the old
 *  token constants. */
export function useThemedStyles<T>(factory: (colors: ThemeColors) => T): T {
  const { colors } = useTheme();
  return useMemo(() => factory(colors), [colors, factory]);
}
