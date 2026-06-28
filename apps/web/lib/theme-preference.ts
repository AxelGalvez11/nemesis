export type ResolvedTheme = "light" | "grey" | "dark";
export type ThemePreference = "system" | ResolvedTheme;

export const THEME_PREFERENCES: ThemePreference[] = ["system", "light", "grey", "dark"];

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === "string" && THEME_PREFERENCES.includes(value as ThemePreference);
}

export function resolveThemePreference(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  if (preference === "system") return prefersDark ? "grey" : "light";
  return preference;
}

export function nextThemePreference(preference: ThemePreference): ThemePreference {
  const index = THEME_PREFERENCES.indexOf(preference);
  return THEME_PREFERENCES[(index + 1) % THEME_PREFERENCES.length] ?? "system";
}
