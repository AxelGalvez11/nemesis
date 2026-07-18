import { type ReactNode } from "react";
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { BlurView, type BlurTint } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { useTheme } from "@/theme/ThemeProvider";

// The one Liquid Glass surface for the whole app. On iPhones running iOS 26 it renders
// Apple's true UIGlassEffect (expo-glass-effect); everywhere else — older iOS, Android, and
// the react-native-web preview — it degrades to a frosted expo-blur BlurView with a faint
// theme fill so content stays legible. Callers never branch on platform: they drop a
// GlassSurface wherever a solid `c.glass` card or piece of chrome used to be.
//
// Both native modules are import-safe off-iOS (expo-glass-effect ships a non-iOS stub;
// expo-blur ships BlurView.web) so this single file works on every target.

// Is the real thing available? Resolved once at module load — the OS/hardware that decides
// it can't change while the app runs, so there's no reason to re-check per render.
const LIQUID_GLASS =
  Platform.OS === "ios" &&
  (() => {
    try {
      return isLiquidGlassAvailable();
    } catch {
      return false;
    }
  })();

/** True on iPhones where the real iOS-26 material is rendering (vs. the blur fallback).
 *  Exposed so callers can nudge padding/borders that only make sense for one path. */
export const usingLiquidGlass = LIQUID_GLASS;

export interface GlassSurfaceProps {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** 'regular' = frosted chrome (default). 'clear' = more transparent, for large fills. */
  variant?: "regular" | "clear";
  /** Optional wash over the glass (e.g. a faint crimson tint on an active row). */
  tint?: string;
  /** Solid-ish fill drawn under the blur fallback so content stays readable pre-iOS 26.
   *  Defaults to the theme's translucent `glass` token. */
  fallbackColor?: string;
  testID?: string;
}

export function GlassSurface({ children, style, variant = "regular", tint, fallbackColor, testID }: GlassSurfaceProps) {
  const { colors: c, resolvedMode } = useTheme();

  if (LIQUID_GLASS) {
    return (
      <GlassView
        style={style}
        glassEffectStyle={variant}
        tintColor={tint}
        // Match the glass to the app's OWN light/dark toggle, not the system setting.
        colorScheme={resolvedMode}
        isInteractive={false}
        testID={testID}
      >
        {children}
      </GlassView>
    );
  }

  // Frosted fallback. systemChromeMaterial* carries its own translucent fill; the extra
  // `glass` overlay firms up contrast where the blur alone is too sheer (notably on web,
  // where backdrop-filter is weaker). `overflow:hidden` makes the blur respect borderRadius.
  const blurTint: BlurTint = resolvedMode === "dark" ? "systemChromeMaterialDark" : "systemChromeMaterialLight";
  const intensity = variant === "clear" ? 18 : 34;
  const fill = fallbackColor ?? c.glass;

  return (
    <BlurView tint={blurTint} intensity={intensity} style={[styles.clip, style]} testID={testID}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: fill }]} pointerEvents="none" />
      {tint ? <View style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} pointerEvents="none" /> : null}
      {children}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: "hidden" },
});
