import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import { lightTheme, type Theme, themeFor } from "./theme";

// ThemeProvider exposes the active Theme to the tree. It already reads the system
// color scheme, but stays LIGHT-LOCKED until every screen consumes theme tokens —
// otherwise system-dark would flip the migrated screens (entry + shared primitives)
// to dark while the not-yet-migrated screens (still on the static common.ts) stay
// light, producing a jarring half-dark app. Flip ENABLE_SYSTEM_DARK to true in the
// slice that completes the migration; the dark theme is already built + tested.
const ENABLE_SYSTEM_DARK = false;

const ThemeContext = createContext<Theme>(lightTheme);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const theme = useMemo<Theme>(
    () => (ENABLE_SYSTEM_DARK && scheme === "dark" ? themeFor("dark") : themeFor("light")),
    [scheme],
  );
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

/** Access the active theme. Always returns a theme (defaults to light) so a
 *  component rendered outside a provider — e.g. in a test — never crashes. */
export function useTheme(): Theme {
  return useContext(ThemeContext);
}
