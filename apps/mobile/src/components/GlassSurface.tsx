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
  /** Near-opaque menu backing — kills page bleed-through on both glass paths. */
  opaque?: boolean;
  testID?: string;
}

export function GlassSurface({ children, style, variant = "regular", tint, fallbackColor, opaque = false, testID }: GlassSurfaceProps) {
  const { colors: c, resolvedMode } = useTheme();

  // Near-opaque backing for menu panels: painted OVER the glass material but UNDER the
  // content, so the glass edge/highlight survives while the page behind stops bleeding
  // through (owner 2026-07-20: "mini menus still allow the background to bleed through").
  // Needed on BOTH paths — the real iOS-26 material is translucent by design, so a
  // fallback fill alone can't fix it.
  const backing = opaque ? (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: c.glassMenu }]} pointerEvents="none" />
  ) : null;

  if (LIQUID_GLASS) {
    return (
      <GlassView
        style={[opaque ? styles.clip : null, style]}
        glassEffectStyle={variant}
        tintColor={tint}
        // Match the glass to the app's OWN light/dark toggle, not the system setting.
        colorScheme={resolvedMode}
        isInteractive={false}
        testID={testID}
      >
        {backing}
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
      {backing}
      {children}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: "hidden" },
});
