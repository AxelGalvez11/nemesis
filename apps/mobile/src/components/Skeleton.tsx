import { useEffect, useRef } from "react";
import { Animated, type DimensionValue, StyleSheet, View, type ViewStyle } from "react-native";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space } from "@/theme/tokens";

// Skeleton loaders — the mobile twin of web's <Skeleton> (apps/web/components/ui/skeleton.tsx:
// "animate-pulse rounded-md bg-muted"). Same idea: a muted, pulsing placeholder in the shape of the
// content that's loading, instead of a bare spinner. Built on React Native's own Animated (no extra
// dep — the same zero-dep posture as AppDrawer; reanimated is reserved for gestures). Colors come
// from the live theme (useTheme/useThemedStyles), not the legacy static tokens — see
// components/states/index.tsx for the same conversion and why it matters for light/dark mode.

/** One pulsing bar. Width defaults to full; height/radius tuned per use. */
export function Skeleton({
  width = "100%",
  height = 14,
  radius: r = radius.sm,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}) {
  const { colors: c } = useTheme();
  const opacity = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 750, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return <Animated.View style={[{ width, height, borderRadius: r, backgroundColor: c.line2, opacity }, style]} />;
}

/** A Card-shaped skeleton: mirrors ui.tsx <Card> (border, radius.md, surface2) with a few text bars. */
export function SkeletonCard({ lines = 2, testID }: { lines?: number; testID?: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.card} testID={testID}>
      <Skeleton width="70%" height={16} />
      {Array.from({ length: Math.max(0, lines - 1) }).map((_, i) => (
        <Skeleton key={i} width={i % 2 === 0 ? "45%" : "55%"} height={12} />
      ))}
    </View>
  );
}

/** A list of N card skeletons — the loading state for the watch / report / list screens. */
export function SkeletonList({ count = 3, lines = 2, testID }: { count?: number; lines?: number; testID?: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.list} testID={testID}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} lines={lines} testID={`${testID ?? "skeleton"}-${i}`} />
      ))}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    list: { gap: space(2) },
    card: {
      borderWidth: 1,
      borderColor: c.line2,
      borderRadius: radius.md,
      padding: space(4),
      gap: space(2),
      backgroundColor: c.surface2,
    },
  });
