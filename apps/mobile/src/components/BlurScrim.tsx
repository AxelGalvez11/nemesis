import { type ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { BlurView, type BlurTint } from "expo-blur";
import { useTheme } from "@/theme/ThemeProvider";

// The frosted backdrop behind any popup, menu, or bottom-sheet. Instead of a flat dark
// dim, it BLURS whatever is behind the popup so the popup reads clearly while the page
// underneath stays recognisable. A light scrim rides on top of the blur for contrast —
// deliberately soft so the blur itself is still visible (a heavy dim would hide it).
//
// Usage: as the first child of a full-screen overlay, with the popup content rendered
// after it. Pass `onPress` to make tapping the backdrop dismiss the popup. Uses only
// expo-blur, so it ships over-the-air with no native change.
export function BlurScrim({
  onPress,
  intensity = 22,
  children,
  style,
  testID,
}: {
  onPress?: () => void;
  intensity?: number;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { resolvedMode } = useTheme();
  const tint: BlurTint = resolvedMode === "dark" ? "systemUltraThinMaterialDark" : "systemUltraThinMaterialLight";
  // Soft, mode-aware scrim over the blur — enough to lift a floating menu, light enough
  // that the frosted page still shows through.
  const wash = resolvedMode === "dark" ? "rgba(0,0,0,0.28)" : "rgba(0,0,0,0.12)";

  return (
    <BlurView tint={tint} intensity={intensity} style={[StyleSheet.absoluteFill, style]} testID={testID}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: wash }]} pointerEvents="none" />
      {onPress ? (
        <Pressable style={StyleSheet.absoluteFill} onPress={onPress} accessibilityLabel="Close" />
      ) : null}
      {children}
    </BlurView>
  );
}
