/**
 * Appearance choices for the rebuilt app (canvas "Appearance" artboard): theme, accent, note font.
 *
 * Theme is REAL: it calls React Native's Appearance.setColorScheme, which overrides what
 * useColorScheme() returns for the whole app, so useNx() (theme/nx.ts) follows it with no change.
 * The stored choice is re-applied when this module is first imported (ProfileMenu and the settings
 * screens import it); the root layout should also call applyStoredAppearance() on start so a cold
 * launch never flashes the phone's own scheme first.
 *
 * Accent and note font are stored and exposed through useNxAppearance(); the settings screens use
 * the accent today. The chat composer and the note editor still need to read them.
 */
import { useEffect, useState } from 'react';
import { Appearance } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export type NxThemeChoice = 'light' | 'dark' | 'system';
export type NxNoteFont = 'default' | 'serif' | 'mono';

export const NX_ACCENTS = ['#a3a3a3', '#3b93f0', '#3ecf8e', '#f0b429', '#e152b0', '#f08a24', '#8b5cf6'] as const;
export const NX_DEFAULT_ACCENT = '#3b93f0';

export interface NxAppearance {
  theme: NxThemeChoice;
  accent: string;
  font: NxNoteFont;
}

const KEY = 'nemesis_nx_appearance_v1';
const DEFAULTS: NxAppearance = { theme: 'system', accent: NX_DEFAULT_ACCENT, font: 'default' };

let current: NxAppearance = DEFAULTS;
let loaded: Promise<NxAppearance> | null = null;
const listeners = new Set<(a: NxAppearance) => void>();

function parse(raw: string | null): NxAppearance {
  try {
    const p = raw ? (JSON.parse(raw) as Partial<NxAppearance>) : {};
    return {
      theme: p.theme === 'light' || p.theme === 'dark' || p.theme === 'system' ? p.theme : DEFAULTS.theme,
      accent: typeof p.accent === 'string' && (NX_ACCENTS as readonly string[]).includes(p.accent) ? p.accent : DEFAULTS.accent,
      font: p.font === 'serif' || p.font === 'mono' || p.font === 'default' ? p.font : DEFAULTS.font,
    };
  } catch {
    return DEFAULTS;
  }
}

function applyTheme(theme: NxThemeChoice) {
  try {
    Appearance.setColorScheme(theme === 'system' ? 'unspecified' : theme);
  } catch {
    // Older runtimes without the override simply keep following the phone.
  }
}

/** Load the stored choice and apply the theme. Safe to call many times. */
export function applyStoredAppearance(): Promise<NxAppearance> {
  if (!loaded) {
    loaded = SecureStore.getItemAsync(KEY)
      .catch(() => null)
      .then((raw) => {
        current = parse(raw);
        applyTheme(current.theme);
        listeners.forEach((l) => l(current));
        return current;
      });
  }
  return loaded;
}

export function setNxAppearance(next: Partial<NxAppearance>) {
  current = { ...current, ...next };
  if (next.theme) applyTheme(next.theme);
  listeners.forEach((l) => l(current));
  void SecureStore.setItemAsync(KEY, JSON.stringify(current)).catch(() => {});
}

export function useNxAppearance(): NxAppearance {
  const [value, setValue] = useState(current);
  useEffect(() => {
    listeners.add(setValue);
    void applyStoredAppearance().then(setValue);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}

export function themeLabel(theme: NxThemeChoice): string {
  return theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'Match phone';
}

void applyStoredAppearance();
